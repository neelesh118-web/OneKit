import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Tab snooze — hide a tab now and reopen it automatically at a chosen time.
 * The background alarm wakes the service worker, finds due snoozes, and
 * reopens the tabs. Everything is local; the module stays browser-free.
 */

export const SNOOZE_STORAGE_KEY = "ok.snoozedTabs";

export interface SnoozedTab {
  id: string;
  url: string;
  title: string;
  /** Epoch ms when the tab should reopen. */
  reopenAt: number;
  /** When the tab was snoozed. */
  snoozedAt: number;
}

function isSnoozedTab(value: unknown): value is SnoozedTab {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.title === "string" &&
    typeof v.reopenAt === "number" &&
    typeof v.snoozedAt === "number"
  );
}

async function readAll(storage: KvStorage): Promise<SnoozedTab[]> {
  const raw = await storage.get(SNOOZE_STORAGE_KEY);
  const list = raw[SNOOZE_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isSnoozedTab);
}

async function writeAll(storage: KvStorage, items: SnoozedTab[]): Promise<void> {
  await storage.set({ [SNOOZE_STORAGE_KEY]: items });
}

export function isValidSnoozeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Snoozes a tab. Returns the record, or null when the URL isn't snoozeable. */
export async function snoozeTab(
  storage: KvStorage,
  entry: { url: string; title: string; reopenAt: number },
  now: number = Date.now()
): Promise<SnoozedTab | null> {
  if (!isValidSnoozeUrl(entry.url)) return null;
  const record: SnoozedTab = {
    id: `snooze-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    url: entry.url,
    title: entry.title || entry.url,
    reopenAt: entry.reopenAt,
    snoozedAt: now
  };
  const items = await readAll(storage);
  items.push(record);
  await writeAll(storage, items);
  return record;
}

export async function listSnoozedTabs(storage: KvStorage): Promise<SnoozedTab[]> {
  const items = await readAll(storage);
  return items.sort((a, b) => a.reopenAt - b.reopenAt);
}

export async function unsnoozeTab(storage: KvStorage, id: string): Promise<void> {
  const items = await readAll(storage);
  await writeAll(storage, items.filter((t) => t.id !== id));
}

export async function clearSnoozedTabs(storage: KvStorage): Promise<void> {
  await storage.remove(SNOOZE_STORAGE_KEY);
}

/**
 * Tabs whose time has come (reopenAt <= now). Sorted soonest-first.
 * Returns the due tabs — callers reopen them then remove them.
 */
export async function dueSnoozedTabs(storage: KvStorage, now: number = Date.now()): Promise<SnoozedTab[]> {
  const items = await readAll(storage);
  return items
    .filter((t) => t.reopenAt <= now)
    .sort((a, b) => a.reopenAt - b.reopenAt);
}

/** Human label for a reopen time (e.g. "in 2h", "tomorrow 09:00"). */
export function formatReopenLabel(reopenAt: number, now: number = Date.now()): string {
  const diff = reopenAt - now;
  if (diff <= 0) return "due now";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `in ${days} d`;
  return new Date(reopenAt).toLocaleDateString();
}

export function localStorageSnooze(): KvStorage {
  return localStorageArea();
}
