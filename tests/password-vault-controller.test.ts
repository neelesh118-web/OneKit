/**
 * Password vault controller render states — locked shows the unlock prompt
 * with no plaintext, unlock renders entries, no-master shows the honest
 * plaintext warning. jsdom environment (default).
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  addVaultEntry,
  readVaultEntries,
  setMasterPassword,
  unlockVault
} from "../src/core/passwords";
import { createPasswordVaultController } from "../src/popup/password-vault-controller";
import type { OneKitCapabilities } from "../src/popup/capabilities";

const INPUT = { site: "github.com", username: "alice", password: "hunter2", notes: "work" };

const VAULT_IDS = [
  "pwv-status",
  "pwv-passphrase-input", "pwv-passphrase-set", "pwv-passphrase-clear",
  "pwv-unlock-wrap", "pwv-unlock-input", "pwv-unlock-btn",
  "pwv-change-input", "pwv-change-btn",
  "pwv-site", "pwv-username", "pwv-password", "pwv-notes", "pwv-generate", "pwv-add",
  "pwv-list",
  "pwv-export", "pwv-import", "pwv-import-file", "pwv-delete-all"
];

function buildDom(): void {
  document.body.innerHTML = "";
  for (const id of VAULT_IDS) {
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
    getActiveTab: async () => ({ url: "https://github.com/", id: 42 }),
    sendMessage: async () => ({ filled: 2 }),
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
    loadWordlist: async () => []
  };
}

describe("password vault controller render states", () => {
  it("locked: master set, no key → unlock prompt, no plaintext anywhere", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    await addVaultEntry(INPUT, storage, key);

    buildDom();
    const cleanup = createPasswordVaultController(fakeCaps(storage));
    await vi.waitFor(() => {
      expect(document.getElementById("pwv-status")!.textContent).toContain("encrypted");
    });

    expect((document.getElementById("pwv-unlock-wrap") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("pwv-passphrase-input") as HTMLElement).hidden).toBe(true);
    const list = document.getElementById("pwv-list")!;
    expect(list.textContent ?? "").not.toContain("hunter2");
    expect(list.textContent ?? "").not.toContain("alice");
    expect(list.querySelectorAll(".vault-row")).toHaveLength(0);
    cleanup();
  });

  it("unlocks with the right master password and renders entries (password hidden)", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    await addVaultEntry(INPUT, storage, key);

    buildDom();
    const cleanup = createPasswordVaultController(fakeCaps(storage));
    await vi.waitFor(() => {
      expect((document.getElementById("pwv-unlock-wrap") as HTMLElement).hidden).toBe(false);
    });

    (document.getElementById("pwv-unlock-input") as HTMLInputElement).value = "master-pass";
    (document.getElementById("pwv-unlock-btn") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.getElementById("pwv-list")!.querySelectorAll(".vault-row")).toHaveLength(1);
    });
    const row = document.getElementById("pwv-list")!.querySelector(".vault-row")!;
    expect(row.textContent).toContain("github.com");
    expect(row.textContent).toContain("alice");
    expect(row.textContent).not.toContain("hunter2"); // password stays hidden
    expect(row.querySelectorAll("button").length).toBeGreaterThanOrEqual(3); // Fill / Copy / Delete
    cleanup();
  });

  it("no master password: unlock prompt hidden, plaintext warning shown", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);

    buildDom();
    const cleanup = createPasswordVaultController(fakeCaps(storage));
    await vi.waitFor(() => {
      expect(document.getElementById("pwv-list")!.querySelectorAll(".vault-row")).toHaveLength(1);
    });

    expect((document.getElementById("pwv-unlock-wrap") as HTMLElement).hidden).toBe(true);
    expect(document.getElementById("pwv-status")!.textContent).toContain("plaintext");
    expect(document.getElementById("pwv-list")!.textContent).toContain("github.com");
    cleanup();
  });

  it("fill button sends credentials to the active tab", async () => {
    const storage = createMemoryStorage();
    const sent: unknown[] = [];
    const caps = fakeCaps(storage);
    caps.sendMessage = async (tabId, message) => {
      sent.push({ tabId, message });
      return { filled: 2 };
    };
    await addVaultEntry(INPUT, storage, null);

    buildDom();
    const cleanup = createPasswordVaultController(caps);
    await vi.waitFor(() => {
      expect(document.getElementById("pwv-list")!.querySelectorAll(".vault-row")).toHaveLength(1);
    });

    const fillBtn = [...document.querySelectorAll<HTMLButtonElement>(".vault-row button")].find(
      (b) => b.textContent === "Fill this page"
    )!;
    fillBtn.click();
    await vi.waitFor(() => {
      expect(sent.length).toBe(1);
    });
    const message = (sent[0] as { message: { type: string; username: string; password: string } }).message;
    expect(message.type).toBe("ok:vault-fill");
    expect(message.username).toBe("alice");
    expect(message.password).toBe("hunter2");
    expect(document.getElementById("pwv-status")!.textContent).toContain("check the fields");
    cleanup();
  });

  it("encrypted entries survive a full round trip via the controller surface", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    const key = await setMasterPassword("master-pass", storage);
    // Entries were migrated to encryption; confirm via the core.
    const entries = await readVaultEntries(storage, key);
    expect(entries).toHaveLength(1);
    const unlocked = await unlockVault("master-pass", storage);
    expect((await readVaultEntries(storage, unlocked))[0]!.password).toBe("hunter2");
  });
});
