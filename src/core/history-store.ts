import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Full-text page history — the "find that page that said X" tool.
 * Stores URL/title/trimmed body text per visited page, capped, oldest first.
 * Text is capped per page and the total list is capped, so storage stays
 * bounded even with unlimitedStorage permission.
 */

export interface HistoryEntry {
  url: string;
  title: string;
  text: string;
  ts: number;
  visits: number;
}

export const HISTORY_STORAGE_KEY = "ok.history";
/** Hard cap on stored pages (oldest dropped first). */
export const MAX_HISTORY_ENTRIES = 3000;
/** Per-page text cap — enough to search meaningfully, small enough to stay lean. */
export const MAX_PAGE_TEXT_CHARS = 4000;
/** Search result cap. */
export const MAX_SEARCH_RESULTS = 50;

/** Collapses whitespace, trims, and caps a page's body text. */
export function extractPageText(rawText: string, maxChars: number = MAX_PAGE_TEXT_CHARS): string {
  const collapsed = rawText.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return collapsed.slice(0, maxChars);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.url === "string" &&
    typeof v.title === "string" &&
    typeof v.text === "string" &&
    typeof v.ts === "number"
  );
}

async function readEntries(storage: KvStorage): Promise<HistoryEntry[]> {
  const raw = await storage.get(HISTORY_STORAGE_KEY);
  const list = raw[HISTORY_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isHistoryEntry);
}

async function writeEntries(storage: KvStorage, entries: HistoryEntry[]): Promise<void> {
  await storage.set({ [HISTORY_STORAGE_KEY]: entries });
}

/** Upserts a page visit. Re-visits bump ts + visits and refresh title/text. */
export async function addHistoryEntry(
  storage: KvStorage,
  url: string,
  title: string,
  text: string,
  now: number = Date.now()
): Promise<void> {
  const entries = await readEntries(storage);
  const existingIndex = entries.findIndex((e) => e.url === url);
  const entry: HistoryEntry = {
    url,
    title: title || url,
    text: extractPageText(text),
    ts: now,
    visits: existingIndex >= 0 ? (entries[existingIndex]?.visits ?? 0) + 1 : 1
  };
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.unshift(entry);
  }
  // Cap: drop the oldest beyond the max.
  const trimmed = entries.slice(0, MAX_HISTORY_ENTRIES);
  await writeEntries(storage, trimmed);
}

/** Case-insensitive substring search over title + text. Newest first. */
export async function searchHistory(
  storage: KvStorage,
  query: string,
  limit: number = MAX_SEARCH_RESULTS
): Promise<HistoryEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const entries = await readEntries(storage);
  const matches = entries
    .filter(
      (e) => e.title.toLowerCase().includes(q) || e.text.toLowerCase().includes(q)
    )
    .sort((a, b) => b.ts - a.ts);
  return matches.slice(0, limit);
}

export async function listHistory(storage: KvStorage): Promise<HistoryEntry[]> {
  const entries = await readEntries(storage);
  return entries.sort((a, b) => b.ts - a.ts);
}

export async function removeHistoryEntry(storage: KvStorage, url: string): Promise<void> {
  const entries = await readEntries(storage);
  await writeEntries(storage, entries.filter((e) => e.url !== url));
}

export async function clearHistory(storage: KvStorage): Promise<void> {
  await storage.remove(HISTORY_STORAGE_KEY);
}

export async function historyStats(storage: KvStorage): Promise<{ count: number; bytes: number }> {
  const entries = await readEntries(storage);
  const bytes = JSON.stringify(entries).length;
  return { count: entries.length, bytes };
}

export function localStorageHistory(): KvStorage {
  return localStorageArea();
}
