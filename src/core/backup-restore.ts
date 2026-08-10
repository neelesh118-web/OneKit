import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Local backup/restore — exports every OneKit store to a single JSON file
 * and restores from one. Restore is key-scoped and validates each key's
 * shape before writing, so a corrupt or foreign backup can never wipe or
 * poison unrelated data.
 */

export const BACKUP_VERSION = 1;

/** Every OneKit storage key that holds user data. */
export const BACKUP_KEYS = [
  "ok.settings",
  "ok.history",
  "ok.clipboard",
  "ok.drafts",
  "ok.snippets",
  "ok.chatVault",
  "ok.vaultCrypto",
  "ok.highlights",
  "ok.readLater",
  "ok.workspaces",
  "ok.focusRules",
  "ok.budgets",
  "ok.focusSession",
  "ok.screenTime",
  "ok.sessionBackup",
  "ok.downloads",
  "ok.contactCard",
  "ok.archive",
  "ok.darkMode",
  "ok.snoozedTabs",
  "ok.webNotes",
  "ok.readingProgress"
] as const;

export interface OneKitBackup {
  app: "onekit";
  version: number;
  exportedAt: number;
  data: Record<string, unknown>;
}

export function isBackupKey(key: string): key is (typeof BACKUP_KEYS)[number] {
  return (BACKUP_KEYS as readonly string[]).includes(key);
}

/** Shape guard per key — keeps restore honest even if the file is edited. */
const KEY_VALIDATORS: Record<(typeof BACKUP_KEYS)[number], (value: unknown) => boolean> = {
  "ok.settings": (v) => !!v && typeof v === "object",
  "ok.history": (v) => Array.isArray(v),
  "ok.clipboard": (v) => Array.isArray(v),
  "ok.drafts": (v) => Array.isArray(v),
  "ok.snippets": (v) => Array.isArray(v),
  "ok.chatVault": (v) => Array.isArray(v),
  "ok.vaultCrypto": (v) => !!v && typeof v === "object",
  "ok.highlights": (v) => Array.isArray(v),
  "ok.readLater": (v) => Array.isArray(v),
  "ok.workspaces": (v) => Array.isArray(v),
  "ok.focusRules": (v) => Array.isArray(v),
  "ok.budgets": (v) => Array.isArray(v),
  "ok.focusSession": (v) => !!v && typeof v === "object",
  "ok.screenTime": (v) => !!v && typeof v === "object",
  "ok.sessionBackup": (v) => !!v && typeof v === "object",
  "ok.downloads": (v) => Array.isArray(v),
  "ok.contactCard": (v) => !!v && typeof v === "object",
  "ok.archive": (v) => Array.isArray(v),
  "ok.darkMode": (v) => !!v && typeof v === "object",
  "ok.snoozedTabs": (v) => Array.isArray(v),
  "ok.webNotes": (v) => Array.isArray(v),
  "ok.readingProgress": (v) => Array.isArray(v)
};

export async function createBackup(storage: KvStorage, now: number = Date.now()): Promise<OneKitBackup> {
  const data: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const raw = await storage.get(key);
    if (raw[key] !== undefined) data[key] = raw[key];
  }
  return { app: "onekit", version: BACKUP_VERSION, exportedAt: now, data };
}

export function serializeBackup(backup: OneKitBackup): string {
  return JSON.stringify(backup, null, 2);
}

/** Parses + validates an untrusted backup payload. */
export function validateBackup(raw: unknown): { ok: true; backup: OneKitBackup } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Not a backup file." };
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.app !== "onekit") {
    return { ok: false, error: "This file is not an OneKit backup." };
  }
  if (typeof candidate.version !== "number" || candidate.version > BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version ${String(candidate.version)}.` };
  }
  if (typeof candidate.exportedAt !== "number") {
    return { ok: false, error: "The backup is missing its export timestamp." };
  }
  if (!candidate.data || typeof candidate.data !== "object") {
    return { ok: false, error: "The backup contains no data." };
  }
  const data = candidate.data as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!isBackupKey(key)) {
      return { ok: false, error: `Unknown data key "${key}" — refusing to restore.` };
    }
    if (!KEY_VALIDATORS[key](data[key])) {
      return { ok: false, error: `Key "${key}" has an unexpected shape — refusing to restore.` };
    }
  }
  const backup: OneKitBackup = {
    app: "onekit",
    version: candidate.version,
    exportedAt: candidate.exportedAt,
    data
  };
  return { ok: true, backup };
}

export function parseBackup(json: string): { ok: true; backup: OneKitBackup } | { ok: false; error: string } {
  try {
    return validateBackup(JSON.parse(json));
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
}

/**
 * Writes only the validated keys from the backup into storage. Never
 * touches keys that aren't in the backup, so current data is preserved.
 */
export async function restoreBackup(
  storage: KvStorage,
  backup: OneKitBackup
): Promise<{ restored: string[]; skipped: string[] }> {
  const restored: string[] = [];
  const skipped: string[] = [];
  for (const key of BACKUP_KEYS) {
    const value = backup.data[key];
    if (value === undefined) {
      skipped.push(key);
      continue;
    }
    if (!KEY_VALIDATORS[key](value)) {
      skipped.push(key);
      continue;
    }
    await storage.set({ [key]: value });
    restored.push(key);
  }
  return { restored, skipped };
}

export function localStorageBackup(): KvStorage {
  return localStorageArea();
}

/**
 * Removes every user-data store except settings (which the popup keeps by
 * design) and returns the keys that were cleared. Owns the same key list as
 * backup, so "erase all" can never drift from what gets backed up.
 */
export async function eraseAllData(storage: KvStorage): Promise<string[]> {
  const removed: string[] = [];
  for (const key of BACKUP_KEYS) {
    if (key === "ok.settings") continue;
    await storage.remove(key);
    removed.push(key);
  }
  return removed;
}
