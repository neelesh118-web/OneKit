/**
 * TOTP controller render states — proves the Safety tab's TOTP section shows
 * the honest locked/unlocked/no-passphrase UI and never leaks a secret or
 * code while locked. Runs in the default jsdom environment so the controller
 * has a real DOM to wire.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  addTotpAccount,
  setTotpPassphrase,
  unlockTotp
} from "../src/core/totp";
import { createSafetyController } from "../src/popup/safety-controller";
import type { OneKitCapabilities } from "../src/popup/capabilities";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

/** Every id the Safety controller wires — mirror of the real panel. */
const SAFETY_IDS = [
  "cleanlink-input", "cleanlink-btn", "cleanlink-output", "cleanlink-copy", "cleanlink-status",
  "scam-check", "scam-result", "scam-status",
  "pii-input", "pii-scan", "pii-findings", "pii-output", "pii-copy", "pii-status",
  "cookie-refresh", "cookie-forget", "cookie-name", "cookie-value", "cookie-domain",
  "cookie-path", "cookie-add", "cookie-list", "cookie-status",
  "totp-passphrase-input", "totp-passphrase-set", "totp-passphrase-clear",
  "totp-unlock-wrap", "totp-unlock-input", "totp-unlock-btn",
  "totp-add-label", "totp-add-secret", "totp-add-btn", "totp-qr-btn", "totp-qr-file",
  "totp-export", "totp-import", "totp-import-file", "totp-delete-all",
  "totp-list", "totp-status",
  "sweep-scan", "sweep-filter", "sweep-list", "sweep-status", "sweep-clear-cache"
];

function buildSafetyDom(): void {
  document.body.innerHTML = "";
  for (const id of SAFETY_IDS) {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
}

function fakeCaps(storage: ReturnType<typeof createMemoryStorage>): OneKitCapabilities {
  return {
    storage,
    now: () => Date.now(),
    copyText: async () => {},
    queryTabs: async () => [],
    closeTabs: async () => {},
    activateTab: async () => {},
    captureVisibleTab: async () => "",
    downloadDataUrl: () => {},
    openUrl: async () => {},
    getActiveTab: async () => ({}),
    sendMessage: async () => undefined,
    discardTabs: async () => {},
    makeQr: () => ({ dataUrl: "", sizePx: 0, modules: 0 }),
    downloadText: () => {},
    groupTabs: async () => ({ grouped: 0 }),
    captureFullPage: async () => {},
    getBookmarks: async () => [],
    removeBookmarks: async () => {},
    downloadBytes: () => {},
    saveFile: () => {},
    saveFileTo: async () => {},
    getCookies: async () => [],
    setCookie: async () => null,
    removeCookie: async () => {},
    clearSiteData: async () => {},
    pickColor: async () => ({}),
    downloadPageImages: async () => 0,
    getHistoryDomains: async () => [],
    deleteHistoryForHost: async () => 0,
    clearCacheAll: async () => {},
    getAllCookieHosts: async () => [],
    videoSpeedGet: async () => ({ host: "", speed: 1 }),
    videoSpeedSet: async (speed) => speed,
    videoSpeedReset: async () => 1,
    captureTabStream: async () => new MediaStream(),
    saveBlob: () => {},
    openVideoPip: async () => ({ ok: false, reason: "unsupported" }),
    ocrImage: async () => "",
    fileToDataUrl: async () => "data:image/png;base64,",
    loadWordlist: async () => [],
    readerUrl: () => "chrome-extension://reader/reader.html"
  };
}

describe("TOTP locked-state render", () => {
  it("locked: passphrase set, no key → unlock prompt shown, no secrets or codes rendered", async () => {
    const storage = createMemoryStorage();
    await setTotpPassphrase("correct horse", storage);
    const key = await unlockTotp("correct horse", storage);
    await addTotpAccount(
      { label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 },
      storage,
      key
    );

    buildSafetyDom();
    const cleanup = createSafetyController(fakeCaps(storage));
    // Wait for the async init chain (refreshTotpUnlockUi → renderTotpList)
    // by polling for a value only init produces.
    const status = document.getElementById("totp-status")!;
    const list = document.getElementById("totp-list")!;
    const passphraseInput = document.getElementById("totp-passphrase-input")!;
    await vi.waitFor(() => {
      expect(status.textContent).toContain("Enter it to see your codes");
    });

    expect(document.getElementById("totp-unlock-wrap")!.hidden).toBe(false);
    expect(passphraseInput.hidden).toBe(true); // set-passphrase form hidden
    expect(list.textContent).toContain("Locked");
    // No account rows, no plaintext secret, no 6-digit code anywhere.
    expect(list.querySelectorAll("[data-totp-row]")).toHaveLength(0);
    expect(list.textContent ?? "").not.toContain(RFC_SECRET);
    expect(list.textContent ?? "").not.toMatch(/\d{6}/);
    cleanup();
  });

  it("unlocks with the right passphrase and renders a live code row", async () => {
    const storage = createMemoryStorage();
    await setTotpPassphrase("correct horse", storage);
    const key = await unlockTotp("correct horse", storage);
    await addTotpAccount(
      { label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 },
      storage,
      key
    );

    buildSafetyDom();
    const cleanup = createSafetyController(fakeCaps(storage));
    await vi.waitFor(() => {
      expect(document.getElementById("totp-status")!.textContent).toContain("Enter it to see your codes");
    });

    const unlockInput = document.getElementById("totp-unlock-input") as HTMLInputElement;
    const unlockBtn = document.getElementById("totp-unlock-btn") as HTMLButtonElement;
    unlockInput.value = "correct horse";
    unlockBtn.click();

    await vi.waitFor(() => {
      expect(document.getElementById("totp-unlock-wrap")!.hidden).toBe(true);
    });
    const list = document.getElementById("totp-list")!;
    expect(list.querySelectorAll("[data-totp-row]")).toHaveLength(1);
    const code = list.querySelector<HTMLElement>("[data-totp-code]")!;
    expect(code.textContent).toMatch(/^\d{6}$/);
    // The per-row meta carries the at-rest flag after decrypt-on-unlock.
    expect(list.querySelector(".result-meta")!.textContent).toContain("encrypted");
    cleanup();
  });

  it("no passphrase: unlock prompt hidden, plaintext honesty warning", async () => {
    const storage = createMemoryStorage();
    await addTotpAccount(
      { label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 },
      storage
    );

    buildSafetyDom();
    const cleanup = createSafetyController(fakeCaps(storage));
    await vi.waitFor(() => {
      expect(document.getElementById("totp-list")!.querySelectorAll("[data-totp-row]")).toHaveLength(1);
    });

    expect(document.getElementById("totp-unlock-wrap")!.hidden).toBe(true);
    expect(document.getElementById("totp-status")!.textContent).toContain("no passphrase is set");
    cleanup();
  });
});
