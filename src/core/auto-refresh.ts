/**
 * Tab auto-refresh — per-tab timers that reload a page on an interval.
 *
 * The popular "auto refresh" extensions became browser hijackers (Auto
 * Refresh Plus, 1M+ users). This one is a plain local timer: a page asks
 * to reload itself every N seconds while the timer is active, and the
 * refresh stops the moment the user turns it off or leaves. No network,
 * no injection, nothing but a `location.reload()`.
 *
 * Timers are stored per-origin so a reload re-arms them (the content
 * script dies on reload, so it re-checks this store on boot).
 */

import type { KvStorage } from "./storage-utils";

export const AUTO_REFRESH_KEY = "ok.autoRefresh";
export const MIN_INTERVAL_SECONDS = 5;
export const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

export interface AutoRefreshRule {
  /** Origin the rule applies to (e.g. https://example.com). */
  origin: string;
  /** Reload interval in seconds. */
  intervalSeconds: number;
  /** Unix ms when the rule was created. */
  createdAt: number;
}

/** Clamps + validates an interval into MIN..MAX seconds. */
export function normalizeIntervalSeconds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return MIN_INTERVAL_SECONDS;
  return Math.max(MIN_INTERVAL_SECONDS, Math.min(MAX_INTERVAL_SECONDS, Math.round(n)));
}

/** Origin key from a full URL — timers key on origin so ?query or #hash don't matter. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.split("/")[0] ?? url;
  }
}

function isRule(value: unknown): value is AutoRefreshRule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.origin === "string" && typeof v.intervalSeconds === "number";
}

async function readRules(storage: KvStorage): Promise<AutoRefreshRule[]> {
  const raw = await storage.get(AUTO_REFRESH_KEY);
  const list = raw[AUTO_REFRESH_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isRule);
}

async function writeRules(storage: KvStorage, rules: AutoRefreshRule[]): Promise<void> {
  await storage.set({ [AUTO_REFRESH_KEY]: rules });
}

export async function listAutoRefreshRules(storage: KvStorage): Promise<AutoRefreshRule[]> {
  const rules = await readRules(storage);
  return rules.sort((a, b) => a.origin.localeCompare(b.origin));
}

/** Rule for an origin, or null. */
export async function autoRefreshFor(storage: KvStorage, url: string): Promise<AutoRefreshRule | null> {
  const origin = originOf(url);
  const rules = await readRules(storage);
  return rules.find((r) => r.origin === origin) ?? null;
}

/** Starts (or updates) an auto-refresh timer for a URL. */
export async function setAutoRefresh(
  storage: KvStorage,
  url: string,
  intervalSeconds: number,
  now: number = Date.now()
): Promise<AutoRefreshRule> {
  const origin = originOf(url);
  const rule: AutoRefreshRule = { origin, intervalSeconds: normalizeIntervalSeconds(intervalSeconds), createdAt: now };
  const rules = await readRules(storage);
  const next = rules.filter((r) => r.origin !== origin).concat(rule);
  await writeRules(storage, next);
  return rule;
}

/** Stops the timer for a URL. Returns true when a rule was removed. */
export async function clearAutoRefresh(storage: KvStorage, url: string): Promise<boolean> {
  const origin = originOf(url);
  const rules = await readRules(storage);
  const next = rules.filter((r) => r.origin !== origin);
  if (next.length === rules.length) return false;
  await writeRules(storage, next);
  return true;
}

export async function clearAllAutoRefresh(storage: KvStorage): Promise<number> {
  const rules = await readRules(storage);
  if (rules.length > 0) await writeRules(storage, []);
  return rules.length;
}

export function localStorageAutoRefresh(): KvStorage {
  return localStorageAreaRef();
}

// Local import at the bottom keeps the module testable without browser APIs.
import { localStorageArea as localStorageAreaRef } from "./storage-utils";
