import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Local web archive — right-click a page to save its full HTML into a
 * searchable local archive (capped), so you can re-read it later even if
 * the site changes or goes offline. Everything stays on-device.
 */

export const ARCHIVE_STORAGE_KEY = "ok.archive";
export const MAX_ARCHIVE_ITEMS = 50;
export const MAX_ARCHIVE_HTML_CHARS = 400_000;

export interface ArchiveItem {
  id: string;
  url: string;
  title: string;
  savedAt: number;
  /** Extracted readable text (for search). */
  text: string;
  /** Full serialized HTML (for re-reading). */
  html: string;
}

function isArchiveItem(value: unknown): value is ArchiveItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.title === "string" &&
    typeof v.savedAt === "number" &&
    typeof v.text === "string" &&
    typeof v.html === "string"
  );
}

async function readArchive(storage: KvStorage): Promise<ArchiveItem[]> {
  const raw = await storage.get(ARCHIVE_STORAGE_KEY);
  const list = raw[ARCHIVE_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isArchiveItem);
}

async function writeArchive(storage: KvStorage, items: ArchiveItem[]): Promise<void> {
  await storage.set({ [ARCHIVE_STORAGE_KEY]: items });
}

/** Saves a page. Returns the item, or null when there's nothing to save. */
export async function saveArchiveItem(
  storage: KvStorage,
  entry: Omit<ArchiveItem, "id" | "savedAt">,
  now: number = Date.now()
): Promise<ArchiveItem | null> {
  const text = entry.text.trim();
  if (!text) return null;
  const item: ArchiveItem = {
    ...entry,
    id: `arch-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: now,
    html: entry.html.slice(0, MAX_ARCHIVE_HTML_CHARS)
  };
  const items = await readArchive(storage);
  items.unshift(item);
  await writeArchive(storage, items.slice(0, MAX_ARCHIVE_ITEMS));
  return item;
}

export async function listArchive(storage: KvStorage): Promise<ArchiveItem[]> {
  const items = await readArchive(storage);
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

export async function searchArchive(storage: KvStorage, query: string): Promise<ArchiveItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const items = await readArchive(storage);
  return items
    .filter((i) => i.title.toLowerCase().includes(q) || i.text.toLowerCase().includes(q) || i.url.toLowerCase().includes(q))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function removeArchiveItem(storage: KvStorage, id: string): Promise<void> {
  const items = await readArchive(storage);
  await writeArchive(storage, items.filter((i) => i.id !== id));
}

export async function clearArchive(storage: KvStorage): Promise<void> {
  await storage.remove(ARCHIVE_STORAGE_KEY);
}

export function localStorageArchive(): KvStorage {
  return localStorageArea();
}
