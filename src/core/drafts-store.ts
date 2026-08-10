import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Form Draft Vault — auto-saves what you type into form fields so a refresh,
 * crash, or accidental close can't lose a long application/order/reply.
 * Keyed by (origin + field identity) so drafts never leak across sites.
 */

export interface DraftEntry {
  /** Stable key: origin + field identity. */
  key: string;
  origin: string;
  /** Human label for the field (name/id/placeholder — best effort). */
  fieldLabel: string;
  value: string;
  ts: number;
}

export const DRAFTS_STORAGE_KEY = "ok.drafts";
export const MAX_DRAFT_ENTRIES = 400;
export const MAX_DRAFT_VALUE_CHARS = 20000;

/** Builds the cross-site-safe storage key for a form field. */
export function draftKeyFor(origin: string, fieldName?: string, fieldId?: string): string {
  const identity = fieldName?.trim() || fieldId?.trim() || "unnamed";
  return `${origin}|${identity}`.slice(0, 500);
}

/**
 * Extracts the field identity from a stored draft key. Returns null when
 * the draft has no usable identity (saved from an unnamed field) — such
 * drafts cannot be mapped back to a field on restore, so they are skipped.
 */
export function draftIdentityForKey(key: string, origin: string): string | null {
  if (!origin || !key.startsWith(`${origin}|`)) return null;
  const identity = key.slice(origin.length + 1);
  if (!identity || identity === "unnamed") return null;
  return identity;
}

/** Field label for humans: id > name > placeholder-derived name. */
export function fieldLabelFor(fieldName?: string, fieldId?: string): string {
  return fieldName?.trim() || fieldId?.trim() || "Field";
}

function isDraftEntry(value: unknown): value is DraftEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    typeof v.origin === "string" &&
    typeof v.value === "string" &&
    typeof v.ts === "number"
  );
}

async function readEntries(storage: KvStorage): Promise<DraftEntry[]> {
  const raw = await storage.get(DRAFTS_STORAGE_KEY);
  const list = raw[DRAFTS_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isDraftEntry);
}

async function writeEntries(storage: KvStorage, entries: DraftEntry[]): Promise<void> {
  await storage.set({ [DRAFTS_STORAGE_KEY]: entries });
}

/** Saves/updates a field draft. Empty values remove the draft. */
export async function saveDraft(
  storage: KvStorage,
  entry: Omit<DraftEntry, "ts">,
  now: number = Date.now()
): Promise<void> {
  const value = entry.value.slice(0, MAX_DRAFT_VALUE_CHARS);
  if (!value.trim()) {
    await removeDraft(storage, entry.key);
    return;
  }
  const entries = await readEntries(storage);
  const idx = entries.findIndex((e) => e.key === entry.key);
  const saved: DraftEntry = { ...entry, value, ts: now };
  if (idx >= 0) {
    entries[idx] = saved;
  } else {
    entries.unshift(saved);
  }
  await writeEntries(storage, entries.slice(0, MAX_DRAFT_ENTRIES));
}

export async function listDrafts(storage: KvStorage): Promise<DraftEntry[]> {
  const entries = await readEntries(storage);
  return entries.sort((a, b) => b.ts - a.ts);
}

/** Drafts for one origin (site-scoped view). */
export async function listDraftsForOrigin(storage: KvStorage, origin: string): Promise<DraftEntry[]> {
  const entries = await readEntries(storage);
  return entries.filter((e) => e.origin === origin).sort((a, b) => b.ts - a.ts);
}

export async function removeDraft(storage: KvStorage, key: string): Promise<void> {
  const entries = await readEntries(storage);
  await writeEntries(storage, entries.filter((e) => e.key !== key));
}

export async function clearDrafts(storage: KvStorage): Promise<void> {
  await storage.remove(DRAFTS_STORAGE_KEY);
}

export function localStorageDrafts(): KvStorage {
  return localStorageArea();
}
