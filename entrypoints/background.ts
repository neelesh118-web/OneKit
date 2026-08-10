import { browser } from "wxt/browser";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "../src/core/settings";
import { addReadLater, localStorageReadLater } from "../src/core/read-later-store";
import { filterTabs, type TabLike } from "../src/core/tab-tools";

/**
 * OneKit background — owns right-click quick actions and install-time
 * defaults. All data work happens in the popup and content script; the
 * background stays tiny so it wakes fast and stays out of the way.
 */

const CLEAN_LINK_MENU_ID = "onekit-clean-link";
const COUNT_WORDS_MENU_ID = "onekit-count-words";
const HIGHLIGHT_MENU_ID = "onekit-highlight-selection";
const READ_LATER_MENU_ID = "onekit-read-later";
const READER_MENU_ID = "onekit-open-reader";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    // Seed defaults only when the user has no settings yet (don't clobber).
    const existing = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    if (!existing[SETTINGS_STORAGE_KEY]) {
      await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS });
    }

    // Context menus are a real-browser feature; environments without
    // contextMenus support (WXT's type-gen sandbox, unit tests) must not crash.
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
    } catch {
      // Menus unavailable — the popup tools still cover everything.
    }
  });

  async function sendToTab(tabId: number, message: unknown): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // The content script isn't there yet (e.g. chrome:// or a just-opening
      // tab) — nothing to do; the user can use the popup tools instead.
    }
  }

  // Unified-search support: the Ctrl+Shift+K palette runs in content
  // scripts, which cannot see tabs — they ask the background instead.
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
      return;
    });
  } catch {
    // No runtime messaging in this environment.
  }

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
      }
    });
  } catch {
    // No contextMenus support in this environment — popup tools cover it.
  }
});
