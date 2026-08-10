import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Read-later — pages saved for later reading. Local only; the paired
 * "clean reader" view (entrypoints/reader) fetches and re-renders the page
 * without distractions.
 */

export interface ReadLaterItem {
  id: string;
  url: string;
  title: string;
  savedAt: number;
  read: boolean;
}

export const READ_LATER_STORAGE_KEY = "ok.readLater";
export const MAX_READ_LATER_ITEMS = 200;

function makeId(now: number, url: string): string {
  return `${now.toString(36)}-${url.length.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isReadLaterItem(value: unknown): value is ReadLaterItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.title === "string" &&
    typeof v.savedAt === "number"
  );
}

async function readItems(storage: KvStorage): Promise<ReadLaterItem[]> {
  const raw = await storage.get(READ_LATER_STORAGE_KEY);
  const list = raw[READ_LATER_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isReadLaterItem);
}

async function writeItems(storage: KvStorage, items: ReadLaterItem[]): Promise<void> {
  await storage.set({ [READ_LATER_STORAGE_KEY]: items });
}

export async function addReadLater(
  storage: KvStorage,
  url: string,
  title: string,
  now: number = Date.now()
): Promise<ReadLaterItem> {
  const items = await readItems(storage);
  const existing = items.find((i) => i.url === url);
  if (existing) {
    existing.read = false;
    existing.savedAt = now;
    await writeItems(storage, items);
    return existing;
  }
  const item: ReadLaterItem = {
    id: makeId(now, url),
    url,
    title: title || url,
    savedAt: now,
    read: false
  };
  items.unshift(item);
  await writeItems(storage, items.slice(0, MAX_READ_LATER_ITEMS));
  return item;
}

export async function listReadLater(storage: KvStorage): Promise<ReadLaterItem[]> {
  const items = await readItems(storage);
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

export async function markReadLater(storage: KvStorage, id: string, read: boolean): Promise<void> {
  const items = await readItems(storage);
  const item = items.find((i) => i.id === id);
  if (item) {
    item.read = read;
    await writeItems(storage, items);
  }
}

export async function removeReadLater(storage: KvStorage, id: string): Promise<void> {
  const items = await readItems(storage);
  await writeItems(storage, items.filter((i) => i.id !== id));
}

export async function clearReadLater(storage: KvStorage): Promise<void> {
  await storage.remove(READ_LATER_STORAGE_KEY);
}

export function localStorageReadLater(): KvStorage {
  return localStorageArea();
}
