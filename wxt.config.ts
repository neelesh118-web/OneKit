import { defineConfig } from "wxt";

export default defineConfig({
  // MV3 for every target browser — the only manifest path Chrome/Edge/Firefox
  // all support without legacy MV2 baggage.
  manifestVersion: 3,
  manifest: {
    // Chrome Web Store title limit is 75 chars; the first ~30 survive grid
    // truncation, so the brand + the core promise sit up front.
    name: "OneKit — Local Browser Toolbox (139 tools, no cloud)",
    description:
      "139 local tools: history search, AI chat vault, session backup, tab snooze, focus sessions, TOTP 2FA authenticator, local password vault, video speed controller, tab recorder, OCR, spell-checker, todo list, secure notes, reminders, link collector, barcode generator, file converter, PDF tools, citation generator, API tester, new-tab dashboard, tab parking, CSV export hub, page-to-PDF, downloads cleaner, tab auto-refresh, window resizer, page ruler, meeting link launcher, privacy score, speed reader, local TL;DR, QR scanner, EXIF viewer, contact extractor, tab utilities, recently closed tabs, read aloud, UTM builder, generator pack, favicon extractor, bulk link checker — 100% on-device, free forever.",
    // storage (settings + all local data), unlimitedStorage (large local
    // history/clipboard vault), tabs (tab finder + duplicate killer),
    // contextMenus (right-click quick actions), clipboardWrite (copy from
    // the popup and on-page tools). host_permissions <all_urls> lets the
    // content script run everywhere — required for history indexing, cookie
    // rejection, autoplay killing, text expansion and draft saving.
    permissions: [
      "storage",
      "unlimitedStorage",
      "tabs",
      "contextMenus",
      "clipboardWrite",
      "alarms",
      "downloads",
      "bookmarks",
      "sidePanel",
      "cookies",
      "history",
      "browsingData",
      "tabCapture",
      "notifications",
      "sessions"
    ],
    // Type "ok" + a word in the address bar to search history/tabs/clipboard.
    omnibox: { keyword: "ok" },
    // Ctrl+Shift+Space — Alt+Tab-style quick tab switcher (opened by the background).
    commands: {
      "quick-tab-switch": {
        suggested_key: {
          default: "Ctrl+Shift+Space",
          mac: "Command+Shift+Space"
        },
        description: "Open the OneKit quick tab switcher"
      }
    },
    host_permissions: ["<all_urls>"],
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png"
    },
    action: {
      default_title: "OneKit",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png"
      }
    }
  }
});
