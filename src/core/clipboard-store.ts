import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Clipboard history — remembers text copied in the browser (capped, deduped).
 * Only text is stored, only up to MAX_CLIPBOARD_ENTRIES entries, and the
 * value is capped per entry so huge copies can't blow up storage.
 */

export interface ClipboardEntry {
  id: string;
  text: string;
  ts: number;
  /** Origin the copy happened on (informational only). */
  url?: string;
  /** Pinned entries survive trimming and sort above the rest. */
  pinned?: boolean;
}

export const CLIPBOARD_STORAGE_KEY = "ok.clipboard";
export const MAX_CLIPBOARD_ENTRIES = 50;
export const MAX_CLIPBOARD_TEXT_CHARS = 4000;

function makeId(now: number, text: string): string {
  return `${now.toString(36)}-${text.length.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalizes a copied snippet: trims, collapses whitespace, caps length. */
export function normalizeClipboardText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  if (collapsed.length <= MAX_CLIPBOARD_TEXT_CHARS) return collapsed;
  return collapsed.slice(0, MAX_CLIPBOARD_TEXT_CHARS);
}

function isClipboardEntry(value: unknown): value is ClipboardEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.ts === "number"
  );
}

async function readEntries(storage: KvStorage): Promise<ClipboardEntry[]> {
  const raw = await storage.get(CLIPBOARD_STORAGE_KEY);
  const list = raw[CLIPBOARD_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isClipboardEntry);
}

async function writeEntries(storage: KvStorage, entries: ClipboardEntry[]): Promise<void> {
  await storage.set({ [CLIPBOARD_STORAGE_KEY]: entries });
}

/** Adds a copied snippet (newest first). Exact duplicates move to the front. */
export async function addClipboardEntry(
  storage: KvStorage,
  rawText: string,
  now: number = Date.now(),
  url?: string
): Promise<ClipboardEntry | null> {
  const text = normalizeClipboardText(rawText);
  if (!text) return null;
  const entries = await readEntries(storage);
  const dupIndex = entries.findIndex((e) => e.text === text);
  if (dupIndex >= 0) {
    const dup = entries[dupIndex];
    if (!dup) return null;
    dup.ts = now;
    if (url) dup.url = url;
    entries.splice(dupIndex, 1);
    entries.unshift(dup);
    await writeEntries(storage, entries);
    return dup;
  }
  const entry: ClipboardEntry = { id: makeId(now, text), text, ts: now, ...(url ? { url } : {}) };
  entries.unshift(entry);
  // Keep pinned entries even when the cap is hit; trim the oldest unpinned.
  const trimmed = entries
    .filter((e) => e.pinned)
    .concat(entries.filter((e) => !e.pinned))
    .slice(0, MAX_CLIPBOARD_ENTRIES);
  await writeEntries(storage, trimmed);
  return entry;
}

export async function listClipboard(storage: KvStorage): Promise<ClipboardEntry[]> {
  const entries = await readEntries(storage);
  return entries.sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.ts - a.ts);
}

export async function removeClipboardEntry(storage: KvStorage, id: string): Promise<void> {
  const entries = await readEntries(storage);
  await writeEntries(storage, entries.filter((e) => e.id !== id));
}

export async function clearClipboard(storage: KvStorage): Promise<void> {
  await storage.remove(CLIPBOARD_STORAGE_KEY);
}

/** Toggles the pin on an entry. Pinned items survive the 50-entry trim. */
export async function setClipboardPinned(storage: KvStorage, id: string, pinned: boolean): Promise<void> {
  const entries = await readEntries(storage);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  if (pinned) entry.pinned = true;
  else delete entry.pinned;
  await writeEntries(storage, entries);
}

export function localStorageClipboard(): KvStorage {
  return localStorageArea();
}
