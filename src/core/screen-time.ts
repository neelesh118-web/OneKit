import { dayKey } from "./date-utils";
import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Screen time — local per-site active-time stats. The content script
 * accumulates seconds while the tab is visible and flushes them here,
 * rolled up per day so storage stays tiny. Old days are pruned; the
 * data never leaves the device.
 */

export const SCREEN_TIME_STORAGE_KEY = "ok.screenTime";
/** Days of history kept per site. */
export const SCREEN_TIME_RETENTION_DAYS = 90;

/** ok.screenTime shape: { [origin]: { [dayKey]: seconds } } */
export type ScreenTimeMap = Record<string, Record<string, number>>;

/** Normalizes a page URL to its origin (https://example.com). */
export function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

async function readMap(storage: KvStorage): Promise<ScreenTimeMap> {
  const raw = await storage.get(SCREEN_TIME_STORAGE_KEY);
  const value = raw[SCREEN_TIME_STORAGE_KEY];
  if (!value || typeof value !== "object") return {};
  return value as ScreenTimeMap;
}

function pruneMap(map: ScreenTimeMap, now: Date): ScreenTimeMap {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - SCREEN_TIME_RETENTION_DAYS);
  const cutoffKey = dayKey(cutoff);
  const pruned: ScreenTimeMap = {};
  for (const [origin, days] of Object.entries(map)) {
    if (!days || typeof days !== "object") continue;
    const cleanDays: Record<string, number> = {};
    for (const [key, seconds] of Object.entries(days)) {
      if (key < cutoffKey) continue;
      if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
        cleanDays[key] = seconds;
      }
    }
    if (Object.keys(cleanDays).length > 0) pruned[origin] = cleanDays;
  }
  return pruned;
}

/** Adds `seconds` of active time for an origin on the day containing `now`. */
export async function recordActiveTime(
  storage: KvStorage,
  url: string,
  seconds: number,
  now: Date = new Date()
): Promise<void> {
  const origin = originOf(url);
  if (!origin || seconds <= 0) return;
  const map = await readMap(storage);
  const days = (map[origin] ?? {}) as Record<string, number>;
  const key = dayKey(now);
  days[key] = (days[key] ?? 0) + seconds;
  map[origin] = days;
  await storage.set({ [SCREEN_TIME_STORAGE_KEY]: pruneMap(map, now) });
}

export interface ScreenTimeSite {
  origin: string;
  seconds: number;
}

export interface ScreenTimeStats {
  /** Total seconds across all sites today. */
  todaySeconds: number;
  /** Per-site totals today, most-used first. */
  todaySites: ScreenTimeSite[];
  /** Per-day totals for the last 7 days, oldest first. */
  last7Days: { day: string; seconds: number }[];
  /** Total seconds across all sites over the last 7 days. */
  last7Seconds: number;
}

/** Builds stats for the popup. Pure read — no writes. */
export async function screenTimeStats(storage: KvStorage, now: Date = new Date()): Promise<ScreenTimeStats> {
  const map = await readMap(storage);
  const todayKey = dayKey(now);

  let todaySeconds = 0;
  const siteTotals = new Map<string, number>();
  const dayTotals = new Map<string, number>();

  for (const [origin, days] of Object.entries(map)) {
    for (const [key, seconds] of Object.entries(days ?? {})) {
      if (typeof seconds !== "number") continue;
      if (key === todayKey) {
        todaySeconds += seconds;
        siteTotals.set(origin, (siteTotals.get(origin) ?? 0) + seconds);
      }
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + seconds);
    }
  }

  const todaySites = [...siteTotals.entries()]
    .map(([origin, seconds]) => ({ origin, seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  // Last 7 days including today.
  const last7Days: { day: string; seconds: number }[] = [];
  let last7Seconds = 0;
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = dayKey(date);
    const seconds = dayTotals.get(key) ?? 0;
    last7Days.push({ day: key, seconds });
    last7Seconds += seconds;
  }

  return { todaySeconds, todaySites, last7Days, last7Seconds };
}

/** Seconds recorded for one origin today (used by daily site budgets). */
export async function secondsForOriginToday(
  storage: KvStorage,
  origin: string,
  now: Date = new Date()
): Promise<number> {
  const map = await readMap(storage);
  const days = map[origin];
  if (!days) return 0;
  const seconds = days[dayKey(now)];
  return typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 0;
}

export async function clearScreenTime(storage: KvStorage): Promise<void> {
  await storage.remove(SCREEN_TIME_STORAGE_KEY);
}

export function localStorageScreenTime(): KvStorage {
  return localStorageArea();
}
