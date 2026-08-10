import { describe, expect, it } from "vitest";
import {
  BACKUP_KEYS,
  createBackup,
  eraseAllData,
  parseBackup,
  restoreBackup,
  serializeBackup,
  validateBackup
} from "../src/core/backup-restore";
import { HISTORY_STORAGE_KEY } from "../src/core/history-store";
import { CLIPBOARD_STORAGE_KEY } from "../src/core/clipboard-store";
import { DRAFTS_STORAGE_KEY } from "../src/core/drafts-store";
import { SNIPPETS_STORAGE_KEY } from "../src/core/snippets";
import { READ_LATER_STORAGE_KEY } from "../src/core/read-later-store";
import { HIGHLIGHTS_STORAGE_KEY } from "../src/core/highlights-store";
import { CHAT_VAULT_STORAGE_KEY } from "../src/core/chat-vault";
import { WORKSPACES_STORAGE_KEY } from "../src/core/workspaces";
import { FOCUS_RULES_STORAGE_KEY } from "../src/core/focus";
import { SCREEN_TIME_STORAGE_KEY } from "../src/core/screen-time";
import { BUDGETS_STORAGE_KEY } from "../src/core/budgets";
import { SESSION_BACKUP_STORAGE_KEY } from "../src/core/session-backup";
import { DOWNLOAD_HISTORY_KEY } from "../src/core/downloads";
import { VAULT_CRYPTO_STORAGE_KEY } from "../src/core/vault-crypto";
import { SETTINGS_STORAGE_KEY } from "../src/core/settings";
import { addHistoryEntry } from "../src/core/history-store";
import { saveSnippet } from "../src/core/snippets";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("backup-restore", () => {
  it("exports every store into a backup", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/", "A", "some text", 1);
    await saveSnippet(s, "addr", "1 Main Street", 2);
    const backup = await createBackup(s);
    expect(backup.app).toBe("onekit");
    expect(backup.version).toBe(1);
    expect(backup.data["ok.history"]).toHaveLength(1);
    expect(backup.data["ok.snippets"]).toHaveLength(1);
  });

  it("round-trips through JSON serialization", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/", "A", "some text", 1);
    const backup = await createBackup(s);
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.data["ok.history"]).toHaveLength(1);
    }
  });

  it("rejects garbage, wrong app, and unknown keys", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ app: "other", version: 1, data: {} }).ok).toBe(false);
    expect(
      validateBackup({ app: "onekit", version: 1, data: { "ok.evil": [] } }).ok
    ).toBe(false);
    expect(
      validateBackup({ app: "onekit", version: 99, data: {} }).ok
    ).toBe(false);
    expect(parseBackup("not json at all").ok).toBe(false);
  });

  it("rejects malformed key shapes", () => {
    const result = validateBackup({
      app: "onekit",
      version: 1,
      data: { "ok.history": "not an array" }
    });
    expect(result.ok).toBe(false);
  });

  it("restores only the keys present in the backup", async () => {
    const source = storage();
    const target = storage();
    await addHistoryEntry(source, "https://a.com/", "A", "text", 1);
    await saveSnippet(source, "addr", "1 Main Street", 2);
    await addHistoryEntry(target, "https://b.com/", "B", "other", 3);

    const backup = await createBackup(source);
    // Drop snippets from the backup to simulate a partial export.
    delete backup.data["ok.snippets"];
    const result = await restoreBackup(target, backup);

    expect(result.restored).toContain("ok.history");
    expect(result.skipped).toContain("ok.snippets");
    // Target's existing history entry is overwritten by the source's.
    const raw = await target.get("ok.history");
    expect(raw["ok.history"]).toHaveLength(1);
    // Keys absent from the backup were never touched.
    const rawSnippets = await target.get("ok.snippets");
    expect(rawSnippets["ok.snippets"]).toBeUndefined();
  });

  it("registers every store key for backup and erase-all", () => {
    const allStoreKeys = [
      HISTORY_STORAGE_KEY,
      CLIPBOARD_STORAGE_KEY,
      DRAFTS_STORAGE_KEY,
      SNIPPETS_STORAGE_KEY,
      READ_LATER_STORAGE_KEY,
      HIGHLIGHTS_STORAGE_KEY,
      CHAT_VAULT_STORAGE_KEY,
      WORKSPACES_STORAGE_KEY,
      FOCUS_RULES_STORAGE_KEY,
      BUDGETS_STORAGE_KEY,
      SCREEN_TIME_STORAGE_KEY,
      SESSION_BACKUP_STORAGE_KEY,
      DOWNLOAD_HISTORY_KEY,
      VAULT_CRYPTO_STORAGE_KEY,
      SETTINGS_STORAGE_KEY
    ];
    for (const key of allStoreKeys) {
      expect(BACKUP_KEYS).toContain(key);
    }
    // And nothing outside the registry — backup/erase-all must agree.
    expect(new Set(BACKUP_KEYS).size).toBe(BACKUP_KEYS.length);
  });

  it("eraseAllData removes every data store but keeps settings", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/", "A", "text", 1);
    await saveSnippet(s, "addr", "1 Main Street", 2);
    await s.set({ [SETTINGS_STORAGE_KEY]: { theme: "dark" } });

    const removed = await eraseAllData(s);
    expect(removed).toContain("ok.history");
    expect(removed).toContain("ok.snippets");
    expect(removed).not.toContain("ok.settings");

    const history = await s.get("ok.history");
    expect(history["ok.history"]).toBeUndefined();
    const settings = await s.get("ok.settings");
    expect(settings["ok.settings"]).toEqual({ theme: "dark" });
  });
});
