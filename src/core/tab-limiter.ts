/**
 * Tab limiter — a soft, honest cap on open tabs. The extension never force-
 * closes tabs; it warns at the limit and can suggest suspending the oldest
 * inactive tabs instead. 100% local.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const TAB_LIMIT_KEY = "ok.tabLimit";

export const DEFAULT_LIMIT = 40;
export const MIN_LIMIT = 10;
export const MAX_LIMIT = 500;

/** Storage adapter for extension contexts. */
export function localStorageTabLimit(): KvStorage {
  return localStorageArea();
}

export async function loadLimit(storage: KvStorage): Promise<number> {
  const data = await storage.get(TAB_LIMIT_KEY);
  const raw = data[TAB_LIMIT_KEY];
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, n));
}

export async function saveLimit(storage: KvStorage, limit: number): Promise<number> {
  const clamped = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.round(limit) || DEFAULT_LIMIT));
  await storage.set({ [TAB_LIMIT_KEY]: clamped });
  return clamped;
}

export type LimitAction = "ok" | "warn" | "over";

export function statusFor(count: number, limit: number): { action: LimitAction; message: string } {
  if (limit <= 0) return { action: "ok", message: "Tab limiter is off." };
  if (count <= limit) return { action: "ok", message: `${count} tab${count === 1 ? "" : "s"} open — under your ${limit} limit.` };
  if (count <= limit + 5) {
    return { action: "warn", message: `${count} tabs open — over your ${limit} limit. Close a few or suspend the oldest.` };
  }
  return { action: "over", message: `${count} tabs open — way over your ${limit} limit. Worth a cleanup.` };
}

/** Oldest inactive tabs first, for a "suspend oldest" suggestion. */
export function suspensionCandidates(
  tabs: Array<{ id?: number; active?: boolean; lastAccessed?: number; discarded?: boolean; pinned?: boolean }>,
  keep: number
): number[] {
  const rest = tabs
    .filter((t) => t.id !== undefined && !t.active && !t.pinned && !t.discarded)
    .sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0));
  const excess = rest.length - Math.max(0, keep);
  return excess > 0 ? rest.slice(0, excess).map((t) => t.id!) : [];
}
