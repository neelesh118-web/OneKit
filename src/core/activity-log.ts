/**
 * Activity log — a local, append-only audit trail of what OneKit did:
 * reminders fired, tab limits hit, sessions opened, exports made, etc.
 * Capped at MAX_ENTRIES and stored under one key.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const ACTIVITY_LOG_KEY = "ok.activityLog";
export const MAX_ENTRIES = 200;

export interface ActivityEvent {
  id: string;
  at: number;
  /** Short machine-ish code, e.g. "reminder.fired". */
  type: string;
  message: string;
}

export async function loadActivity(storage: KvStorage): Promise<ActivityEvent[]> {
  const raw = await storage.get(ACTIVITY_LOG_KEY);
  const list = raw[ACTIVITY_LOG_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is ActivityEvent => {
    if (typeof e !== "object" || e === null) return false;
    const c = e as Partial<ActivityEvent>;
    return typeof c.id === "string" && typeof c.at === "number" && typeof c.type === "string" && typeof c.message === "string";
  });
}

export async function logActivity(
  storage: KvStorage,
  type: string,
  message: string,
  now: number = Date.now()
): Promise<ActivityEvent> {
  const event: ActivityEvent = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
    type,
    message: message.slice(0, 300)
  };
  const list = await loadActivity(storage);
  list.unshift(event);
  await storage.set({ [ACTIVITY_LOG_KEY]: list.slice(0, MAX_ENTRIES) });
  return event;
}

export async function clearActivity(storage: KvStorage): Promise<void> {
  await storage.remove(ACTIVITY_LOG_KEY);
}

export function describeEvent(e: ActivityEvent): string {
  return `${new Date(e.at).toLocaleString()} — ${e.message}`;
}

export function localStorageActivity(): KvStorage {
  return localStorageArea();
}
