/**
 * Tab parking — OneTab-style tab memory-saving, done safely.
 *
 * "Park" the current window's tabs into a local list and close them to free
 * RAM; restore any or all of them later. Nothing is ever deleted: parked
 * tabs live in `ok.parking` until the user removes them, and every restore
 * reopens them without touching what's already open.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";
import type { TabLike } from "./tab-tools";

export const PARKING_STORAGE_KEY = "ok.parking";
export const MAX_PARKED_TABS = 500;

export interface ParkedTab {
  url: string;
  title: string;
  /** Epoch ms when it was parked. */
  parkedAt: number;
}

export async function loadParked(storage: KvStorage): Promise<ParkedTab[]> {
  const raw = await storage.get(PARKING_STORAGE_KEY);
  const list = raw[PARKING_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter((t): t is ParkedTab => {
    if (typeof t !== "object" || t === null) return false;
    const c = t as Partial<ParkedTab>;
    return typeof c.url === "string" && /^https?:/.test(c.url) && typeof c.title === "string" && typeof c.parkedAt === "number";
  });
}

async function writeParked(storage: KvStorage, list: ParkedTab[]): Promise<void> {
  await storage.set({ [PARKING_STORAGE_KEY]: list.slice(0, MAX_PARKED_TABS) });
}

/**
 * Parks the given tabs: stores them (newest first) and returns the list of
 * tab ids that were parked (the caller closes them). Pinned and active tabs
 * are never parked, and nothing is removed from storage here.
 */
export async function parkTabs(
  storage: KvStorage,
  tabs: TabLike[],
  now: number
): Promise<{ parked: ParkedTab[]; tabIds: number[] }> {
  const existing = await loadParked(storage);
  const parked: ParkedTab[] = [];
  const tabIds: number[] = [];
  for (const tab of tabs) {
    const url = tab.url ?? "";
    if (!/^https?:/.test(url)) continue;
    if (tab.pinned) continue;
    if (tab.active) continue;
    if (existing.some((t) => t.url === url)) continue; // dedupe by URL
    if (tab.id !== undefined) tabIds.push(tab.id);
    parked.push({ url, title: tab.title ?? url, parkedAt: now });
  }
  const merged = [...parked, ...existing];
  await writeParked(storage, merged);
  return { parked, tabIds };
}

export async function restoreParked(
  storage: KvStorage,
  urls: string[]
): Promise<{ restored: number; removed: string[] }> {
  const list = await loadParked(storage);
  const target = new Set(urls);
  const restored = list.filter((t) => target.has(t.url));
  const remaining = list.filter((t) => !target.has(t.url));
  await writeParked(storage, remaining);
  return { restored: restored.length, removed: restored.map((t) => t.url) };
}

export async function removeParked(storage: KvStorage, url: string): Promise<void> {
  const list = await loadParked(storage);
  await writeParked(storage, list.filter((t) => t.url !== url));
}

export async function clearParked(storage: KvStorage): Promise<void> {
  await storage.remove(PARKING_STORAGE_KEY);
}

export function parkedStats(list: ParkedTab[]): { count: number; hosts: number } {
  return { count: list.length, hosts: new Set(list.map((t) => new URL(t.url).hostname)).size };
}

export function localStorageParking(): KvStorage {
  return localStorageArea();
}
