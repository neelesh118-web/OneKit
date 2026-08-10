import { browser } from "wxt/browser";
import { qrDataUrl } from "../../src/core/qr";
import { localStorageArea } from "../../src/core/storage-utils";
import type { TabLike } from "../../src/core/tab-tools";
import type { BookmarkNodeLike } from "../../src/core/bookmark-cleaner";
import type { CookieLike } from "../../src/core/cookie-manager";
import type { OneKitCapabilities } from "../../src/popup/capabilities";
import { createMemoryController } from "../../src/popup/memory-controller";
import { createVaultController } from "../../src/popup/vault-controller";
import { createSafetyController } from "../../src/popup/safety-controller";
import { createSpeedController } from "../../src/popup/speed-controller";
import { createFocusController } from "../../src/popup/focus-controller";
import { createTypingController } from "../../src/popup/typing-controller";
import { createToolsController } from "../../src/popup/tools-controller";
import { createDownloadsController } from "../../src/popup/downloads-controller";
import { createDevController } from "../../src/popup/dev-controller";
import { createPasswordVaultController } from "../../src/popup/password-vault-controller";
import { createMediaController } from "../../src/popup/media-controller";
import { createUtilitiesController } from "../../src/popup/utilities-controller";
import { createMemoryToolsController } from "../../src/popup/memory-tools-controller";
import { createSessionToolsController } from "../../src/popup/session-tools-controller";
import { createPowerToolsController } from "../../src/popup/power-tools-controller";
import { createSettingsController, applyTheme } from "../../src/popup/settings-controller";
import { loadSettings, saveSettings, updateSettings, type OneKitSettings } from "../../src/core/settings";

/**
 * OneKit popup — wires the six tab panels to their controllers. The
 * controllers never call browser.* directly; every capability is injected
 * here so the controllers stay unit-testable.
 */

const caps: OneKitCapabilities = {
  storage: localStorageArea(),
  now: () => Date.now(),
  copyText: async (text) => {
    await navigator.clipboard.writeText(text);
  },
  queryTabs: async () => {
    const tabs = await browser.tabs.query({});
    return tabs as unknown as TabLike[];
  },
  closeTabs: async (ids) => {
    if (ids.length > 0) await browser.tabs.remove(ids);
  },
  activateTab: async (id) => {
    const tab = await browser.tabs.get(id);
    await browser.tabs.update(id, { active: true });
    if (tab.windowId !== undefined) {
      await browser.windows.update(tab.windowId, { focused: true });
    }
  },
  discardTabs: async (ids) => {
    for (const id of ids) {
      await browser.tabs.discard(id).catch(() => {
        // A tab may close mid-loop; that's fine.
      });
    }
  },
  captureVisibleTab: async () => {
    return browser.tabs.captureVisibleTab();
  },
  downloadDataUrl: (dataUrl, filename) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  },
  openUrl: async (url) => {
    // Relative paths (e.g. the reader page) resolve against the extension.
    let target = url;
    if (url.startsWith("/reader.html")) {
      const suffix = url.slice("/reader.html".length);
      target = browser.runtime.getURL("/reader.html") + suffix;
    }
    await browser.tabs.create({ url: target });
  },
  getActiveTab: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return (tab ?? {}) as TabLike;
  },
  sendMessage: async (tabId, message) => {
    return browser.tabs.sendMessage(tabId, message);
  },
  makeQr: (text) => qrDataUrl(text),
  downloadText: (text, filename) => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  groupTabs: async () => {
    const result = (await browser.runtime.sendMessage({ type: "ok:group-tabs" })) as { grouped?: number } | undefined;
    return { grouped: result?.grouped ?? 0 };
  },
  captureFullPage: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await browser.tabs.sendMessage(tab.id, { type: "ok:fullpage-capture" });
    }
  },
  getBookmarks: async () => {
    const tree = await browser.bookmarks.getTree();
    return tree as unknown as BookmarkNodeLike[];
  },
  removeBookmarks: async (ids) => {
    for (const id of ids) {
      await browser.bookmarks.remove(id).catch(() => {
        // A bookmark may vanish mid-loop; keep going.
      });
    }
  },
  downloadBytes: (bytes, filename) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  saveFile: (bytes, filename, mime) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  saveFileTo: async (bytes, filename, folder, mime) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const path = folder ? `${folder}/${filename}` : filename;
    try {
      await browser.downloads.download({ url, filename: path, saveAs: false });
    } finally {
      // downloads.download copies the blob asynchronously — revoke after it's done.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  },
  getCookies: async (url) => {
    const cookies = await browser.cookies.getAll({ url });
    return cookies as unknown as CookieLike[];
  },
  setCookie: async (details) => {
    const cookie = await browser.cookies.set({
      url: details.url,
      name: details.name,
      value: details.value,
      domain: details.domain,
      path: details.path
    });
    return (cookie as unknown as CookieLike) ?? null;
  },
  removeCookie: async (url, name) => {
    await browser.cookies.remove({ url, name });
  },
  clearSiteData: async (origin) => {
    const since = 0;
    await browser.browsingData.remove(
      { origins: [origin], since },
      { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true }
    );
  },
  getAllCookieHosts: async () => {
    const cookies = await browser.cookies.getAll({});
    return cookies.map((c) => c.domain.replace(/^\./, "")).filter(Boolean);
  },
  getHistoryDomains: async (days) => {
    const startTime = Date.now() - days * 86_400_000;
    const items = await browser.history.search({ text: "", startTime, maxResults: 100_000 });
    const byHost = new Map<string, number>();
    for (const item of items) {
      if (!item.url) continue;
      let host: string;
      try {
        host = new URL(item.url).hostname;
      } catch {
        continue;
      }
      if (!host) continue;
      byHost.set(host, (byHost.get(host) ?? 0) + 1);
    }
    return [...byHost.entries()].map(([host, visits]) => ({ host, visits }));
  },
  resizeWindow: async (presetId) => {
    await browser.runtime.sendMessage({ type: "ok:resize-window", presetId });
  },
  getProtectedTools: async () => {
    const settings = await loadSettings();
    const enabled: string[] = [];
    if (settings.tools.cookieReject) enabled.push("cookieReject");
    if (settings.tools.emailBlocker) enabled.push("emailBlocker");
    if (settings.tools.customCss) enabled.push("customCss");
    return enabled;
  },
  deleteHistoryForHost: async (host) => {
    const items = await browser.history.search({ text: "", startTime: 0, maxResults: 100_000 });
    let deleted = 0;
    for (const item of items) {
      if (!item.url) continue;
      try {
        if (new URL(item.url).hostname === host) {
          await browser.history.deleteUrl({ url: item.url });
          deleted += 1;
        }
      } catch {
        // A malformed URL can't be deleted; skip it.
      }
    }
    return deleted;
  },
  clearCacheAll: async () => {
    await browser.browsingData.removeCache({});
  },
  pickColor: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return { error: "No tab open." };
    const result = (await browser.tabs.sendMessage(tab.id, { type: "ok:pick-color" })) as { color?: string; error?: string } | undefined;
    return result ?? { error: "No response — reload the page." };
  },
  downloadPageImages: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return 0;
    const result = (await browser.tabs.sendMessage(tab.id, { type: "ok:collect-images" })) as { saved?: number } | undefined;
    return result?.saved ?? 0;
  },
  videoSpeedGet: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return { host: "", speed: 1 };
    const result = (await browser.tabs.sendMessage(tab.id, { type: "ok:video-speed-get" })) as
      | { host?: string; speed?: number }
      | undefined;
    return { host: result?.host ?? "", speed: result?.speed ?? 1 };
  },
  videoSpeedSet: async (speed) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return speed;
    const result = (await browser.tabs.sendMessage(tab.id, { type: "ok:video-speed-set", speed })) as
      | { speed?: number }
      | undefined;
    return result?.speed ?? speed;
  },
  videoSpeedReset: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return 1;
    const result = (await browser.tabs.sendMessage(tab.id, { type: "ok:video-speed-reset" })) as
      | { speed?: number }
      | undefined;
    return result?.speed ?? 1;
  },
  captureTabStream: async () => {
    const tabCapture = (browser as unknown as { tabCapture: { capture(options: { audio: boolean; video: boolean }): Promise<MediaStream> } }).tabCapture;
    return tabCapture.capture({ audio: true, video: true });
  },
  saveBlob: (blob, filename) => {
    const url = URL.createObjectURL(blob);
    void browser.downloads.download({ url, filename, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  openVideoPip: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return { ok: false, reason: "no-video" as const };
    const result = (await browser.tabs.sendMessage(tab.id, { type: "ok:video-pip" })) as
      | { ok?: boolean; reason?: "no-video" | "unsupported" | "rejected" }
      | undefined;
    const ok = result?.ok ?? false;
    const reason = result?.reason;
    return reason === undefined ? { ok } : { ok, reason };
  },
  ocrImage: async (dataUrl) => {
    const mod = await import("../../src/core/ocr");
    const getUrl = browser.runtime.getURL as (path: string) => string;
    return mod.ocrImageDataUrl(dataUrl, getUrl);
  },
  fileToDataUrl: async (file) => {
    const mod = await import("../../src/core/ocr");
    return mod.imageDataUrlFromFile(file);
  },
  loadWordlist: async () => {
    const getUrl = browser.runtime.getURL as (path: string) => string;
    const res = await fetch(getUrl("dictionary/words.json"));
    if (!res.ok) throw new Error("The dictionary file is missing from this install.");
    return (await res.json()) as string[];
  },
  readerUrl: () => browser.runtime.getURL("/reader.html")
};

/* Tab navigation ------------------------------------------------------ */

const TAB_ORDER = ["memory", "vault", "safety", "speed", "focus", "typing", "tools", "dev", "convert", "downloads", "settings"];

function switchTab(name: string): void {
  for (const tabName of TAB_ORDER) {
    const btn = document.querySelector<HTMLButtonElement>(`.tab-btn[data-tab="${tabName}"]`);
    const panel = document.getElementById(`panel-${tabName}`);
    if (!btn || !panel) continue;
    const active = tabName === name;
    btn.classList.toggle("active", active);
    panel.hidden = !active;
  }
  // The Convert tab drags in the heavy converter chain (pdfjs, mammoth,
  // xlsx, gifenc, the WOFF2 wasm). Load it lazily the first time the tab
  // is opened so a plain popup open stays fast.
  if (name === "convert") void ensureConvertController();
}

document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) switchTab(tab);
  });
});

/* Boot ---------------------------------------------------------------- */

let convertControllerReady = false;
/** Loads the Convert-tab controller once, on first open. */
async function ensureConvertController(): Promise<void> {
  if (convertControllerReady) return;
  convertControllerReady = true;
  try {
    const mod = await import("../../src/popup/convert-controller");
    mod.createConvertController(caps);
  } catch (err) {
    // A lazy tab must never break the rest of the popup.
    convertControllerReady = false;
    console.error("Convert tab failed to load:", err);
  }
}

const ONBOARDING_PRESETS: Record<string, (settings: OneKitSettings) => void> = {
  focus: (s) => {
    s.tools.focusBlocker = true;
    s.tools.screenTime = true;
    s.tools.sessionBackup = true;
  },
  privacy: (s) => {
    s.tools.cookieReject = true;
  },
  speed: (s) => {
    s.tools.sessionBackup = true;
    s.tools.tabSuspender = true;
    s.tools.autoplayKiller = true;
  },
  all: (s) => {
    s.tools.draftVault = true;
    s.tools.cookieReject = true;
    s.tools.autoplayKiller = true;
    s.tools.textExpander = true;
    s.tools.pasteCleaner = true;
    s.tools.dictation = true;
    s.tools.sessionBackup = true;
    s.tools.tabSuspender = true;
    s.tools.wordLookup = true;
    s.tools.focusBlocker = true;
    // chatVault stays off — capture is on by request only.
  }
};

function wireOnboarding(): void {
  const overlay = document.getElementById("onboarding");
  if (!overlay) return;
  const dismiss = (): void => {
    overlay.hidden = true;
    void updateSettings({ onboarded: true }, caps.storage);
  };
  overlay.querySelectorAll<HTMLButtonElement>("[data-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.focus;
      if (preset && ONBOARDING_PRESETS[preset]) {
        void (async () => {
          const settings = await loadSettings(caps.storage);
          ONBOARDING_PRESETS[preset]!(settings);
          await saveSettings(settings, caps.storage);
        })();
      }
      dismiss();
    });
  });
  document.getElementById("onboarding-skip")?.addEventListener("click", dismiss);
}

void (async () => {
  const settings = await loadSettings(caps.storage);
  applyTheme(settings.theme);

  createMemoryController(caps);
  createVaultController(caps);
  createSafetyController(caps);
  createPasswordVaultController(caps);
  createSpeedController(caps);
  createFocusController(caps);
  createTypingController(caps);
  createToolsController(caps);
  createMediaController(caps);
  createUtilitiesController(caps);
  createMemoryToolsController(caps);
  createSessionToolsController(caps);
  createPowerToolsController(caps);
  createDownloadsController(caps);
  createDevController(caps);
  createSettingsController(caps);

  wireOnboarding();
  if (!settings.onboarded) {
    document.getElementById("onboarding")!.hidden = false;
  }

  switchTab("memory");
})();
