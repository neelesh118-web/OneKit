import { defineConfig } from "wxt";

export default defineConfig({
  // MV3 for every target browser — the only manifest path Chrome/Edge/Firefox
  // all support without legacy MV2 baggage.
  manifestVersion: 3,
  manifest: {
    // Chrome Web Store title limit is 75 chars; the first ~30 survive grid
    // truncation, so the brand + the core promise sit up front.
    name: "OneKit — Local Browser Toolbox (40 tools, no cloud)",
    description:
      "40 local tools: history search, AI chat vault, session backup, focus sessions, tab memory saver + grouping, PDF merge/split, full-page screenshots, bookmark cleaner, download organizer, dark mode, autofill — 100% on-device, free forever.",
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
      "sidePanel"
    ],
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
