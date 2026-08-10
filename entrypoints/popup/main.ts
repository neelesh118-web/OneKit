import { browser } from "wxt/browser";
import { qrDataUrl } from "../../src/core/qr";
import { localStorageArea } from "../../src/core/storage-utils";
import type { TabLike } from "../../src/core/tab-tools";
import type { BookmarkNodeLike } from "../../src/core/bookmark-cleaner";
import type { OneKitCapabilities } from "../../src/popup/capabilities";
import { createMemoryController } from "../../src/popup/memory-controller";
import { createVaultController } from "../../src/popup/vault-controller";
import { createSafetyController } from "../../src/popup/safety-controller";
import { createSpeedController } from "../../src/popup/speed-controller";
import { createFocusController } from "../../src/popup/focus-controller";
import { createTypingController } from "../../src/popup/typing-controller";
import { createToolsController } from "../../src/popup/tools-controller";
import { createDownloadsController } from "../../src/popup/downloads-controller";
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
  }
};

/* Tab navigation ------------------------------------------------------ */

const TAB_ORDER = ["memory", "vault", "safety", "speed", "focus", "typing", "tools", "downloads", "settings"];

function switchTab(name: string): void {
  for (const tabName of TAB_ORDER) {
    const btn = document.querySelector<HTMLButtonElement>(`.tab-btn[data-tab="${tabName}"]`);
    const panel = document.getElementById(`panel-${tabName}`);
    if (!btn || !panel) continue;
    const active = tabName === name;
    btn.classList.toggle("active", active);
    panel.hidden = !active;
  }
}

document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) switchTab(tab);
  });
});

/* Boot ---------------------------------------------------------------- */

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
  createSpeedController(caps);
  createFocusController(caps);
  createTypingController(caps);
  createToolsController(caps);
  createDownloadsController(caps);
  createSettingsController(caps);

  wireOnboarding();
  if (!settings.onboarded) {
    document.getElementById("onboarding")!.hidden = false;
  }

  switchTab("memory");
})();
