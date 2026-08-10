import { browser } from "wxt/browser";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, loadSettings } from "../src/core/settings";
import { addReadLater, localStorageReadLater } from "../src/core/read-later-store";
import { filterTabs, type TabLike } from "../src/core/tab-tools";
import { saveSessionBackup, localStorageSessionBackup } from "../src/core/session-backup";
import { tabsToSuspend } from "../src/core/tab-suspender";
import {
  addDownloadEntry,
  classifyDownload,
  localStorageDownloads,
  routedFilename
} from "../src/core/downloads";

/**
 * OneKit background — owns right-click quick actions, install-time defaults,
 * and the always-on background jobs: automatic session backup and the tab
 * memory saver (both alarm-driven, MV3-friendly).
 */

const CLEAN_LINK_MENU_ID = "onekit-clean-link";
const COUNT_WORDS_MENU_ID = "onekit-count-words";
const HIGHLIGHT_MENU_ID = "onekit-highlight-selection";
const READ_LATER_MENU_ID = "onekit-read-later";
const READER_MENU_ID = "onekit-open-reader";
const READ_SELECTION_MENU_ID = "onekit-read-selection";
const READ_PAGE_MENU_ID = "onekit-read-page";

const SESSION_BACKUP_ALARM = "ok-session-backup";
const TAB_SUSPENDER_ALARM = "ok-tab-suspender";

export default defineBackground(() => {
  /* Install / update -------------------------------------------------- */
  browser.runtime.onInstalled.addListener(async (details) => {
    const existing = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    if (!existing[SETTINGS_STORAGE_KEY]) {
      // Fresh install: seed defaults; onboarding picker will show.
      await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS });
    } else if (details.reason === "update") {
      // Never nag existing users with the onboarding picker.
      const settings = await loadSettings();
      if (!settings.onboarded) {
        settings.onboarded = true;
        await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
      }
    }

    try {
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({
        id: CLEAN_LINK_MENU_ID,
        title: "OneKit — Copy clean link (no tracking)",
        contexts: ["link", "page"]
      });
      browser.contextMenus.create({
        id: COUNT_WORDS_MENU_ID,
        title: "OneKit — Count words in selection",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: HIGHLIGHT_MENU_ID,
        title: "OneKit — Highlight selection",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: READ_LATER_MENU_ID,
        title: "OneKit — Save page to read later",
        contexts: ["page"]
      });
      browser.contextMenus.create({
        id: READER_MENU_ID,
        title: "OneKit — Open clean reader",
        contexts: ["page", "link"]
      });
      browser.contextMenus.create({
        id: READ_SELECTION_MENU_ID,
        title: "OneKit — Read selection aloud",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: READ_PAGE_MENU_ID,
        title: "OneKit — Read page aloud",
        contexts: ["page"]
      });
    } catch {
      // Menus unavailable — the popup tools still cover everything.
    }

    // Background jobs run on a schedule (alarms survive service-worker
    // suspension — plain timers don't in MV3).
    try {
      await browser.alarms.create(SESSION_BACKUP_ALARM, { periodInMinutes: 15 });
      await browser.alarms.create(TAB_SUSPENDER_ALARM, { periodInMinutes: 5 });
    } catch {
      // Alarms unavailable in this environment.
    }
  });

  async function sendToTab(tabId: number, message: unknown): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // The content script isn't there yet — nothing to do.
    }
  }

  /* Messages from content scripts / the palette ----------------------- */
  try {
    browser.runtime.onMessage.addListener((message: unknown) => {
      const msg = message as { type?: string; query?: string; tabId?: number; url?: string };
      if (msg.type === "ok:search-tabs") {
        return (async () => {
          const tabs = (await browser.tabs.query({})) as TabLike[];
          return filterTabs(tabs, msg.query ?? "").slice(0, 8).map((t) => ({
            id: `tab-${t.id ?? "?"}`,
            title: t.title || "Untitled",
            subtitle: t.url ?? "",
            action: t.id !== undefined ? { kind: "activate-tab" as const, tabId: t.id } : null
          })).filter((r) => r.action !== null);
        })();
      }
      if (msg.type === "ok:activate-tab") {
        return (async () => {
          if (msg.tabId === undefined) return;
          const tab = await browser.tabs.get(msg.tabId);
          await browser.tabs.update(msg.tabId, { active: true });
          if (tab.windowId !== undefined) {
            await browser.windows.update(tab.windowId, { focused: true });
          }
        })();
      }
      if (msg.type === "ok:open-tab") {
        return (async () => {
          if (typeof msg.url === "string" && msg.url) {
            await browser.tabs.create({ url: msg.url });
          }
        })();
      }
      if (msg.type === "ok:open-popup") {
        return (async () => {
          try {
            // Chrome 127+; unsupported browsers fall back to the toast hint.
            await browser.action.openPopup();
          } catch {
            // No-op — the palette shows its own hint.
          }
        })();
      }
      return;
    });
  } catch {
    // No runtime messaging in this environment.
  }

  /* Context menus ----------------------------------------------------- */
  try {
    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      const tabId = tab?.id;
      if (info.menuItemId === CLEAN_LINK_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:copy-clean-link",
            url: info.linkUrl ?? info.pageUrl
          });
        }
      } else if (info.menuItemId === COUNT_WORDS_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:count-selection",
            text: info.selectionText ?? ""
          });
        }
      } else if (info.menuItemId === HIGHLIGHT_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:highlight-selection",
            text: info.selectionText ?? ""
          });
        }
      } else if (info.menuItemId === READ_LATER_MENU_ID) {
        const url = info.pageUrl;
        if (url) {
          await addReadLater(localStorageReadLater(), url, tab?.title ?? url);
        }
      } else if (info.menuItemId === READER_MENU_ID) {
        const url = info.linkUrl ?? info.pageUrl;
        if (url) {
          await browser.tabs.create({
            url: `${browser.runtime.getURL("/reader.html")}?url=${encodeURIComponent(url)}`
          });
        }
      } else if (info.menuItemId === READ_SELECTION_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:read-selection",
            text: info.selectionText ?? ""
          });
        }
      } else if (info.menuItemId === READ_PAGE_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, { type: "ok:read-page" });
        }
      }
    });
  } catch {
    // No contextMenus support in this environment.
  }

  /* Automatic session backup ------------------------------------------ */
  let backupDebounce: ReturnType<typeof setTimeout> | undefined;

  async function snapshotTabs(): Promise<void> {
    try {
      const settings = await loadSettings();
      if (!settings.tools.sessionBackup) return;
      const tabs = (await browser.tabs.query({})) as TabLike[];
      await saveSessionBackup(localStorageSessionBackup(), tabs);
    } catch {
      // Best-effort: a failed snapshot must never break anything.
    }
  }

  function scheduleSnapshot(): void {
    if (backupDebounce !== undefined) clearTimeout(backupDebounce);
    // Debounced so rapid tab churn doesn't hammer storage.
    backupDebounce = setTimeout(() => void snapshotTabs(), 20_000);
  }

  try {
    browser.tabs.onUpdated.addListener(scheduleSnapshot);
    browser.tabs.onRemoved.addListener(scheduleSnapshot);
    browser.tabs.onActivated.addListener(scheduleSnapshot);
    browser.tabs.onCreated.addListener(scheduleSnapshot);
  } catch {
    // Tab events unavailable.
  }

  /* Tab memory saver --------------------------------------------------- */
  async function suspendIdleTabs(): Promise<void> {
    try {
      const settings = await loadSettings();
      if (!settings.tools.tabSuspender) return;
      const tabs = (await browser.tabs.query({})) as TabLike[];
      const ids = tabsToSuspend(tabs, { thresholdMs: 30 * 60 * 1000 });
      // The API accepts one id per call — loop (still cheap at this scale).
      for (const id of ids) {
        await browser.tabs.discard(id).catch(() => {
          // A tab may close mid-loop; that's fine.
        });
      }
    } catch {
      // Best-effort.
    }
  }

  /* Download organizer ------------------------------------------------- */
  try {
    browser.downloads.onDeterminingFilename.addListener((item, suggest) => {
      void (async () => {
        try {
          const settings = await loadSettings();
          if (!settings.tools.downloadOrganizer) return;
          const filename = item.filename ?? "";
          if (!filename) return;
          const routed = routedFilename(filename, item.url ?? "", new Set());
          if (routed !== filename) {
            // uniquify dedupes simultaneous downloads at the browser level.
            suggest({ filename: routed, conflictAction: "uniquify" });
          }
        } catch {
          // Best-effort: never break a download.
        }
      })();
    });
  } catch {
    // Downloads API unavailable in this environment.
  }

  try {
    browser.downloads.onCreated.addListener((item) => {
      void addDownloadEntry(
        localStorageDownloads(),
        {
          filename: item.filename ?? "download",
          url: item.url ?? "",
          category: classifyDownload(item.filename ?? "", item.url ?? ""),
          ts: (item.startTime ? new Date(item.startTime).getTime() : Date.now())
        }
      ).catch(() => {
        // Best-effort: history is a convenience log.
      });
    });
  } catch {
    // Downloads API unavailable.
  }

  /* Alarm-driven background jobs --------------------------------------- */
  try {
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === SESSION_BACKUP_ALARM) void snapshotTabs();
      else if (alarm.name === TAB_SUSPENDER_ALARM) void suspendIdleTabs();
    });
  } catch {
    // No alarms in this environment.
  }
});
