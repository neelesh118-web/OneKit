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
import { planTabGroups } from "../src/core/tab-grouping";
import {
  dueSnoozedTabs,
  localStorageSnooze,
  unsnoozeTab
} from "../src/core/tab-snooze";
import { localStorageHistory, searchHistory } from "../src/core/history-store";
import { listClipboard, localStorageClipboard } from "../src/core/clipboard-store";
import { dueReminders, localStorageReminders, markFired } from "../src/core/reminders";
import { loadLimit, localStorageTabLimit, statusFor } from "../src/core/tab-limiter";
import { addCollectedLink, localStorageLinkCollection } from "../src/core/link-collector";
import {
  advanceSession,
  dueSessions,
  loadScheduledSessions,
  localStorageScheduledSessions,
  saveScheduledSessions
} from "../src/core/scheduled-sessions";
import { localStorageActivity, logActivity } from "../src/core/activity-log";
import { localStorageMeetingLinks, meetingTabLike, recordMeetingTab } from "../src/core/meeting-links";
import {
  BREAK_ALARM_NAME,
  isDue,
  localStorageBreakReminders,
  pickSuggestion,
  readBreakSettings,
  snoozeBreakReminder
} from "../src/core/break-reminders";
import { windowSizeForPreset, presetById } from "../src/core/window-resizer";

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
const ARCHIVE_PAGE_MENU_ID = "onekit-archive-page";

const SESSION_BACKUP_ALARM = "ok-session-backup";
const TAB_SUSPENDER_ALARM = "ok-tab-suspender";
const TAB_SNOOZE_ALARM = "ok-tab-snooze";

const COPY_SELECTION_MD_MENU_ID = "onekit-copy-selection-md";
const COPY_LINK_MD_MENU_ID = "onekit-copy-link-md";
const COPY_PAGE_MD_MENU_ID = "onekit-copy-page-md";
const COPY_LINKS_MENU_ID = "onekit-copy-all-links";
const PRINT_FRIENDLY_MENU_ID = "onekit-print-friendly";
const COLLECT_LINK_MENU_ID = "onekit-collect-link";
const SEARCH_GOOGLE_MENU_ID = "onekit-search-google";
const SEARCH_YOUTUBE_MENU_ID = "onekit-search-youtube";
const SEARCH_WIKIPEDIA_MENU_ID = "onekit-search-wikipedia";
const SEARCH_PERPLEXITY_MENU_ID = "onekit-search-perplexity";

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
      browser.contextMenus.create({
        id: ARCHIVE_PAGE_MENU_ID,
        title: "OneKit — Save page to local archive",
        contexts: ["page"]
      });
      browser.contextMenus.create({
        id: COPY_SELECTION_MD_MENU_ID,
        title: "OneKit — Copy selection as Markdown",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: COPY_LINK_MD_MENU_ID,
        title: "OneKit — Copy link as Markdown",
        contexts: ["link"]
      });
      browser.contextMenus.create({
        id: COPY_PAGE_MD_MENU_ID,
        title: "OneKit — Copy page as Markdown link",
        contexts: ["page"]
      });
      browser.contextMenus.create({
        id: COPY_LINKS_MENU_ID,
        title: "OneKit — Copy all links on page as Markdown",
        contexts: ["page"]
      });
      browser.contextMenus.create({
        id: PRINT_FRIENDLY_MENU_ID,
        title: "OneKit — Print-friendly version",
        contexts: ["page"]
      });
      browser.contextMenus.create({
        id: COLLECT_LINK_MENU_ID,
        title: "OneKit — Collect link (export later)",
        contexts: ["link", "page"]
      });
      browser.contextMenus.create({
        id: SEARCH_GOOGLE_MENU_ID,
        title: "OneKit — Search Google for \"%s\"",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: SEARCH_YOUTUBE_MENU_ID,
        title: "OneKit — Search YouTube for \"%s\"",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: SEARCH_WIKIPEDIA_MENU_ID,
        title: "OneKit — Search Wikipedia for \"%s\"",
        contexts: ["selection"]
      });
      browser.contextMenus.create({
        id: SEARCH_PERPLEXITY_MENU_ID,
        title: "OneKit — Search Perplexity for \"%s\"",
        contexts: ["selection"]
      });
    } catch {
      // Menus unavailable — the popup tools still cover everything.
    }

    // Background jobs run on a schedule (alarms survive service-worker
    // suspension — plain timers don't in MV3).
    try {
      await browser.alarms.create(SESSION_BACKUP_ALARM, { periodInMinutes: 15 });
      await browser.alarms.create(TAB_SUSPENDER_ALARM, { periodInMinutes: 5 });
      await browser.alarms.create(TAB_SNOOZE_ALARM, { periodInMinutes: 1 });
      // Scheduled sessions check every half hour (and on tab events).
      await browser.alarms.create("ok-scheduled-sessions", { periodInMinutes: 30 });
      await browser.alarms.create(BREAK_ALARM_NAME, { periodInMinutes: 1 });
    } catch {
      // Alarms unavailable in this environment.
    }

    // Omnibox commands: type "ok" + query to search/act without the popup.
    try {
      browser.omnibox.setDefaultSuggestion({ description: "OneKit: search history, tabs, clipboard — then open or copy" });
      browser.omnibox.onInputChanged.addListener((text, suggest) => {
        void (async () => {
          const q = text.trim();
          if (!q) {
            suggest([]);
            return;
          }
          const suggestions: Array<{ content: string; description: string }> = [];
          const seen = new Set<string>();
          const push = (content: string, description: string): void => {
            if (seen.has(content) || suggestions.length >= 7) return;
            seen.add(content);
            suggestions.push({ content, description });
          };
          for (const entry of (await searchHistory(localStorageHistory(), q)).slice(0, 4)) {
            push(entry.url, `📄 ${entry.title} — ${entry.url}`);
          }
          for (const tab of filterTabs((await browser.tabs.query({})) as TabLike[], q).slice(0, 4)) {
            if (tab.url) push(tab.url, `🗂 ${tab.title ?? tab.url} — ${tab.url}`);
          }
          for (const clip of (await listClipboard(localStorageClipboard())).slice(0, 4)) {
            if (clip.text.toLowerCase().includes(q.toLowerCase())) {
              push(`copy:${clip.text.slice(0, 500)}`, `📋 ${clip.text.slice(0, 60)}`);
            }
          }
          suggest(suggestions);
        })().catch(() => suggest([]));
      });
      browser.omnibox.onInputEntered.addListener((text, disposition) => {
        void (async () => {
          const value = text.trim();
          if (!value) return;
          const open = (url: string): void => {
            if (disposition === "currentTab") void browser.tabs.update({ url });
            else void browser.tabs.create({ url, active: disposition === "newForegroundTab" });
          };
          if (value.startsWith("copy:")) {
            await navigator.clipboard.writeText(value.slice(5));
            return;
          }
          if (/^https?:\/\//.test(value)) {
            open(value);
          } else {
            open(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
          }
        })().catch(() => {
          // Best-effort.
        });
      });
    } catch {
      // Omnibox unavailable in this environment.
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
      const msg = message as {
        type?: string;
        query?: string;
        tabId?: number;
        url?: string;
        dataUrl?: string;
        filename?: string;
        urls?: unknown;
        sessionId?: string;
        thickness?: unknown;
      };

      /** HEAD (falling back to GET) with a hard timeout — one link. */
      async function checkOneLink(url: string): Promise<{ url: string; status: number; ok: boolean; error?: string }> {
        const attempt = async (method: "HEAD" | "GET"): Promise<number> => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          try {
            const resp = await fetch(url, { method, redirect: "follow", signal: controller.signal });
            return resp.status;
          } finally {
            clearTimeout(timer);
          }
        };
        try {
          const status = await attempt("HEAD");
          return { url, status, ok: status >= 200 && status < 400 };
        } catch (headErr) {
          try {
            const status = await attempt("GET");
            return { url, status, ok: status >= 200 && status < 400 };
          } catch {
            const error = headErr instanceof Error ? headErr.name : "error";
            return { url, status: 0, ok: false, error };
          }
        }
      }
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
      if (msg.type === "ok:open-tabs" && Array.isArray(msg.urls)) {
        return (async () => {
          const urls = (msg.urls as unknown[])
            .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
            .slice(0, 25);
          for (const url of urls) {
            await browser.tabs.create({ url, active: false });
          }
          return { opened: urls.length };
        })();
      }
      if (msg.type === "ok:check-links" && Array.isArray(msg.urls)) {
        return (async () => {
          const urls = (msg.urls as unknown[])
            .filter((u): u is string => typeof u === "string")
            .slice(0, 30);
          const results = [];
          for (const url of urls) {
            results.push(await checkOneLink(url));
          }
          return results;
        })();
      }
      if (msg.type === "ok:recent-closed") {
        return (async () => {
          try {
            const sessions = await browser.sessions.getRecentlyClosed({ maxResults: 20 });
            return { sessions: sessions as unknown[] };
          } catch {
            return { sessions: [] };
          }
        })();
      }
      if (msg.type === "ok:restore-session") {
        return (async () => {
          if (typeof msg.sessionId !== "string") return;
          await browser.sessions.restore(msg.sessionId);
        })();
      }
      if (msg.type === "ok:resize-window") {
        return (async () => {
          const preset = typeof (msg as { presetId?: unknown }).presetId === "string" ? presetById((msg as { presetId: string }).presetId) : undefined;
          if (!preset) return;
          const size = windowSizeForPreset(preset);
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (tab?.windowId !== undefined) {
            await browser.windows.update(tab.windowId, { width: size.width, height: size.height });
          }
        })();
      }
      if (msg.type === "ok:clear-page-refresh") {
        return (async () => {
          if (typeof msg.url === "string") {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab?.id !== undefined) {
              try {
                await browser.tabs.sendMessage(tab.id, { type: "ok:stop-auto-refresh" });
              } catch {
                // Content script not injected — nothing to stop.
              }
            }
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
      if (msg.type === "ok:open-sidepanel") {
        return (async () => {
          try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab?.windowId !== undefined) {
              await browser.sidePanel.open({ windowId: tab.windowId });
            }
          } catch {
            // Side panel unavailable (Firefox, older Chrome) — popup covers it.
          }
        })();
      }
      if (msg.type === "ok:capture-visible") {
        return (async () => {
          try {
            return await browser.tabs.captureVisibleTab();
          } catch {
            return undefined;
          }
        })();
      }
      if (msg.type === "ok:download-dataurl") {
        return (async () => {
          if (typeof msg.dataUrl !== "string" || typeof msg.filename !== "string") return;
          try {
            await browser.downloads.download({ url: msg.dataUrl, filename: msg.filename });
          } catch {
            // Best-effort.
          }
        })();
      }
      if (msg.type === "ok:collect-images") {
        return (async () => {
          const urls = Array.isArray(msg.urls) ? (msg.urls as string[]) : [];
          let saved = 0;
          for (const url of urls.slice(0, 50)) {
            try {
              await browser.downloads.download({ url, conflictAction: "uniquify" });
              saved++;
            } catch {
              // Some images are hotlinked and fail to download — skip them.
            }
          }
          return { saved };
        })();
      }
      if (msg.type === "ok:gesture-new-tab") {
        return (async () => {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          await browser.tabs.create({ active: true });
          void tab;
        })();
      }
      if (msg.type === "ok:gesture-close-tab") {
        return (async () => {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
        })();
      }
      if (msg.type === "ok:gesture-reload") {
        return (async () => {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (tab?.id !== undefined) await browser.tabs.reload(tab.id);
        })();
      }
      if (msg.type === "ok:group-tabs") {
        return (async () => {
          try {
            const tabs = (await browser.tabs.query({})) as TabLike[];
            const plans = planTabGroups(tabs);
            let grouped = 0;
            for (const plan of plans) {
              // Plans only contain groups with ≥2 tabs, so the tuple cast is safe.
              const groupId = (await browser.tabs.group({ tabIds: plan.tabIds as [number, ...number[]] })) as number;
              await browser.tabGroups.update(groupId, { title: plan.name, color: plan.color });
              grouped += plan.tabIds.length;
            }
            return { grouped };
          } catch {
            return { grouped: 0 };
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
      } else if (info.menuItemId === ARCHIVE_PAGE_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, { type: "ok:archive-page" });
        }
      } else if (info.menuItemId === COPY_SELECTION_MD_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:copy-selection-md",
            text: info.selectionText ?? ""
          });
        }
      } else if (info.menuItemId === COPY_LINK_MD_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:copy-link-md",
            url: info.linkUrl ?? "",
            text: (info.selectionText ?? "") || (tab?.title ?? "")
          });
        }
      } else if (info.menuItemId === COPY_PAGE_MD_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, {
            type: "ok:copy-page-md",
            url: info.pageUrl ?? "",
            text: tab?.title ?? ""
          });
        }
      } else if (info.menuItemId === COPY_LINKS_MENU_ID) {
        if (tabId !== undefined) {
          await sendToTab(tabId, { type: "ok:copy-all-links" });
        }
      } else if (info.menuItemId === PRINT_FRIENDLY_MENU_ID) {
        const url = info.pageUrl;
        if (url) {
          await browser.tabs.create({
            url: `${browser.runtime.getURL("/reader.html")}?url=${encodeURIComponent(url)}&print=1`
          });
        }
      } else if (info.menuItemId === COLLECT_LINK_MENU_ID) {
        const url = info.linkUrl ?? info.pageUrl;
        if (url) {
          await addCollectedLink(
            { url, title: info.linkUrl ? (info.selectionText ?? "") || url : (tab?.title ?? "") || url },
            localStorageLinkCollection(),
            Date.now()
          );
        }
      } else if (info.menuItemId === SEARCH_GOOGLE_MENU_ID) {
        if (info.selectionText) {
          await browser.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(info.selectionText)}` });
        }
      } else if (info.menuItemId === SEARCH_YOUTUBE_MENU_ID) {
        if (info.selectionText) {
          await browser.tabs.create({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(info.selectionText)}` });
        }
      } else if (info.menuItemId === SEARCH_WIKIPEDIA_MENU_ID) {
        if (info.selectionText) {
          await browser.tabs.create({ url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(info.selectionText)}` });
        }
      } else if (info.menuItemId === SEARCH_PERPLEXITY_MENU_ID) {
        if (info.selectionText) {
          await browser.tabs.create({ url: `https://www.perplexity.ai/search?q=${encodeURIComponent(info.selectionText)}` });
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

  /* Tab snooze — reopen due tabs ----------------------------------------- */
  async function reopenDueSnoozes(): Promise<void> {
    try {
      const storage = localStorageSnooze();
      const due = await dueSnoozedTabs(storage, Date.now());
      for (const tab of due) {
        await browser.tabs.create({ url: tab.url, active: false });
        await unsnoozeTab(storage, tab.id);
      }
    } catch {
      // Best-effort: a failed reopen never breaks anything.
    }
  }

  /* Break & stretch reminders — notify + roll forward ------------------ */
  async function fireBreakReminder(): Promise<void> {
    try {
      const storage = localStorageBreakReminders();
      const settings = await readBreakSettings(storage);
      if (!settings.enabled) return;
      const now = Date.now();
      if (!isDue(settings, now)) return;
      const suggestion = pickSuggestion(now, String(now));
      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("/icon/128.png"),
        title: "🧘 Time for a break",
        message: suggestion
      });
      // Roll the snooze window forward to the next interval.
      await snoozeBreakReminder(storage, now + settings.intervalMinutes * 60_000);
      void logActivity(localStorageActivity(), "break.reminder", "Fired a break & stretch reminder.");
    } catch {
      // Best-effort: a reminder failure must never break the service worker.
    }
  }

  /* Reminders — fire due reminders as notifications --------------------- */
  let lastReminderFire = 0;
  async function fireDueReminders(): Promise<void> {
    try {
      const storage = localStorageReminders();
      const due = await dueReminders(storage, Date.now());
      for (const reminder of due.slice(0, 5)) {
        await markFired(reminder.id, storage);
        const title = `⏰ ${reminder.text.slice(0, 60)}`;
        const url = browser.runtime.getURL("/popup.html");
        if (Date.now() - lastReminderFire > 1_000) {
          lastReminderFire = Date.now();
          try {
            await browser.notifications.create({
              type: "basic",
              iconUrl: browser.runtime.getURL("/icon/128.png"),
              title,
              message: "Set with OneKit — tap the extension to dismiss it."
            });
          } catch {
            // Notifications may be unavailable (Firefox) — fall back silently.
          }
        }
        void url;
      }
    } catch {
      // Best-effort: a reminder failure must never break the service worker.
    }
  }

  /* Scheduled sessions — open due sessions, then roll them forward ------- */
  async function openDueScheduledSessions(): Promise<void> {
    try {
      const storage = localStorageScheduledSessions();
      const due = await dueSessions(storage, Date.now());
      if (due.length === 0) return;
      const list = await loadScheduledSessions(storage);
      for (const session of due) {
        for (const tab of session.tabs.slice(0, 20)) {
          await browser.tabs.create({ url: tab.url, active: false }).catch(() => {
            // Best-effort: one bad URL must not block the rest.
          });
        }
        const idx = list.findIndex((s) => s.id === session.id);
        if (idx >= 0) list[idx] = advanceSession(session, Date.now());
        void logActivity(localStorageActivity(), "session.opened", `Opened scheduled session "${session.name}" (${session.tabs.length} tabs).`);
      }
      await saveScheduledSessions(storage, list);
    } catch {
      // Best-effort: scheduled opens must never break the worker.
    }
  }

  /* Tab limiter — warn when the tab count is way over ------------------- */
  let lastLimitWarn = 0;
  async function checkTabLimit(): Promise<void> {
    try {
      const settings = await loadSettings();
      if (!settings.tools.tabLimiter) return;
      const limit = await loadLimit(localStorageTabLimit());
      const tabs = (await browser.tabs.query({})) as TabLike[];
      const { action, message } = statusFor(tabs.length, limit);
      if (action !== "over") return;
      if (Date.now() - lastLimitWarn < 10 * 60 * 1000) return; // once per 10 min
      lastLimitWarn = Date.now();
      try {
        await browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("/icon/128.png"),
          title: "🛑 Too many tabs open",
          message
        });
      } catch {
        // Best-effort.
      }
    } catch {
      // Best-effort.
    }
  }

  /* Alarm-driven background jobs --------------------------------------- */
  try {
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === SESSION_BACKUP_ALARM) void snapshotTabs();
      else if (alarm.name === TAB_SUSPENDER_ALARM) void suspendIdleTabs();
      else if (alarm.name === TAB_SNOOZE_ALARM) void reopenDueSnoozes();
      else if (alarm.name.startsWith("ok-reminder-")) void fireDueReminders();
      else if (alarm.name === "ok-scheduled-sessions") void openDueScheduledSessions();
      else if (alarm.name === BREAK_ALARM_NAME) void fireBreakReminder();
    });
    // Reminders, scheduled sessions and the tab limiter also catch up on
    // tab events so a machine that slept past alarms still fires on the
    // next interaction.
    browser.tabs.onCreated.addListener(() => void fireDueReminders());
    browser.tabs.onCreated.addListener(() => void openDueScheduledSessions());
    browser.tabs.onUpdated.addListener(() => void checkTabLimit());
    browser.tabs.onCreated.addListener(() => void checkTabLimit());
    browser.tabs.onRemoved.addListener(() => void checkTabLimit());
    // Meeting links: whenever a tab lands on a known join URL, record it.
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        void recordMeetingTab(localStorageMeetingLinks(), meetingTabLike(tab)).catch(() => {});
      }
    });
    browser.tabs.onCreated.addListener((tab) => {
      void recordMeetingTab(localStorageMeetingLinks(), meetingTabLike(tab)).catch(() => {});
    });
  } catch {
    // No alarms in this environment.
  }
});
