import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Reading progress — a thin progress bar at the top of article-like pages,
 * with per-URL position saved locally so you can resume where you left off.
 * The module holds the pure math and the storage; the content script feeds
 * scroll values.
 */

export const READING_PROGRESS_KEY = "ok.readingProgress";

export interface ReadingProgressRecord {
  url: string;
  /** 0–100 (percent through the page). */
  pct: number;
  updatedAt: number;
}

/** 0–100 progress through a scrollable page (clamped). */
export function progressPercent(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const range = scrollHeight - clientHeight;
  if (range <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((scrollTop / range) * 100)));
}

/** Whether a page looks like a long read (progress bar worth showing). */
export function isArticleLike(p: { textLength: number; paragraphCount: number; scrollHeight: number; clientHeight: number }): boolean {
  const paragraphs = Math.max(0, p.paragraphCount);
  const longText = p.textLength >= 1500 && paragraphs >= 4;
  const longPage = p.scrollHeight > p.clientHeight * 3;
  return longText && longPage;
}

function isRecord(value: unknown): value is ReadingProgressRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string" && typeof v.pct === "number" && typeof v.updatedAt === "number";
}

async function readAll(storage: KvStorage): Promise<ReadingProgressRecord[]> {
  const raw = await storage.get(READING_PROGRESS_KEY);
  const list = raw[READING_PROGRESS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord);
}

async function writeAll(storage: KvStorage, items: ReadingProgressRecord[]): Promise<void> {
  await storage.set({ [READING_PROGRESS_KEY]: items });
}

/** Saves a page's progress, capping the store at 200 URLs (LRU by update). */
export async function saveProgress(storage: KvStorage, url: string, pct: number, now: number = Date.now()): Promise<void> {
  const items = await readAll(storage);
  const next = items.filter((r) => r.url !== url);
  next.push({ url, pct: Math.max(0, Math.min(100, Math.round(pct))), updatedAt: now });
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  await writeAll(storage, next.slice(0, 200));
}

/** Latest saved progress for a URL, or null. */
export async function readProgress(storage: KvStorage, url: string): Promise<ReadingProgressRecord | null> {
  const items = await readAll(storage);
  return items.find((r) => r.url === url) ?? null;
}

/** URLs with saved progress, most recently updated first (for a resume list). */
export async function listProgress(storage: KvStorage): Promise<ReadingProgressRecord[]> {
  const items = await readAll(storage);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function clearProgress(storage: KvStorage): Promise<void> {
  await storage.remove(READING_PROGRESS_KEY);
}

export function localStorageReadingProgress(): KvStorage {
  return localStorageArea();
}
