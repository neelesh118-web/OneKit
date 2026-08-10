import { browser } from "wxt/browser";
import { qrDataUrl } from "../../src/core/qr";
import { localStorageArea } from "../../src/core/storage-utils";
import type { TabLike } from "../../src/core/tab-tools";
import type { OneKitCapabilities } from "../../src/popup/capabilities";
import { createMemoryController } from "../../src/popup/memory-controller";
import { createVaultController } from "../../src/popup/vault-controller";
import { createSafetyController } from "../../src/popup/safety-controller";
import { createSpeedController } from "../../src/popup/speed-controller";
import { createFocusController } from "../../src/popup/focus-controller";
import { createTypingController } from "../../src/popup/typing-controller";
import { createToolsController } from "../../src/popup/tools-controller";
import { createSettingsController, applyTheme } from "../../src/popup/settings-controller";
import { loadSettings } from "../../src/core/settings";

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
  }
};

/* Tab navigation ------------------------------------------------------ */

const TAB_ORDER = ["memory", "vault", "safety", "speed", "focus", "typing", "tools", "settings"];

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
  createSettingsController(caps);

  switchTab("memory");
})();
