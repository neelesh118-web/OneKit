/**
 * Scheduled session opens — "open my work tabs every weekday at 9am".
 * Sessions are stored locally with a daily/weekly recurrence; the
 * background worker checks due sessions on alarm + tab events.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";
import { tabsToWorkspaceTabs, type WorkspaceTab } from "./workspaces";
import type { TabLike } from "./tab-tools";

export const SCHEDULED_SESSIONS_KEY = "ok.scheduledSessions";

export interface ScheduledSession {
  id: string;
  name: string;
  /** "daily" or "weekly" (dayOfWeek applies to weekly). */
  frequency: "daily" | "weekly";
  /** 0 = Sunday … 6 = Saturday (weekly only). */
  dayOfWeek: number;
  /** HH:MM (24h). */
  time: string;
  tabs: WorkspaceTab[];
  /** Epoch ms of the next scheduled open. */
  nextAt: number;
  lastOpenedAt: number | null;
}

export interface ScheduleInput {
  name: string;
  frequency: "daily" | "weekly";
  dayOfWeek: number;
  time: string; // "HH:MM"
  tabs: TabLike[];
}

/** Next occurrence of a HH:MM time (possibly a later day). */
export function nextOccurrence(time: string, now: number, frequency: "daily" | "weekly", dayOfWeek: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new Error("Time must be HH:MM.");
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error("Time must be a valid HH:MM.");
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  let ms = target.getTime();
  if (ms <= now) ms += 24 * 60 * 60 * 1000;
  if (frequency === "weekly") {
    while (new Date(ms).getDay() !== dayOfWeek) ms += 24 * 60 * 60 * 1000;
  }
  return ms;
}

export function createScheduledSession(input: ScheduleInput, now: number): ScheduledSession {
  const tabs = tabsToWorkspaceTabs(input.tabs);
  if (tabs.length === 0) throw new Error("No web tabs to schedule.");
  const name = input.name.trim() || `Session ${now}`;
  return {
    id: `sched-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    frequency: input.frequency,
    dayOfWeek: input.dayOfWeek,
    time: input.time,
    tabs,
    nextAt: nextOccurrence(input.time, now, input.frequency, input.dayOfWeek),
    lastOpenedAt: null
  };
}

export async function loadScheduledSessions(storage: KvStorage): Promise<ScheduledSession[]> {
  const raw = await storage.get(SCHEDULED_SESSIONS_KEY);
  const list = raw[SCHEDULED_SESSIONS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is ScheduledSession => {
    if (typeof s !== "object" || s === null) return false;
    const c = s as Partial<ScheduledSession>;
    return (
      typeof c.id === "string" && typeof c.name === "string" &&
      typeof c.time === "string" && Array.isArray(c.tabs) && typeof c.nextAt === "number"
    );
  });
}

export async function saveScheduledSessions(storage: KvStorage, list: ScheduledSession[]): Promise<void> {
  await storage.set({ [SCHEDULED_SESSIONS_KEY]: list });
}

export async function addScheduledSession(input: ScheduleInput, now: number, storage: KvStorage): Promise<ScheduledSession> {
  const session = createScheduledSession(input, now);
  const list = await loadScheduledSessions(storage);
  list.push(session);
  await saveScheduledSessions(storage, list);
  return session;
}

export async function removeScheduledSession(id: string, storage: KvStorage): Promise<void> {
  const list = await loadScheduledSessions(storage);
  await saveScheduledSessions(storage, list.filter((s) => s.id !== id));
}

/** Due sessions (nextAt in the past). */
export async function dueSessions(storage: KvStorage, now: number): Promise<ScheduledSession[]> {
  const list = await loadScheduledSessions(storage);
  return list.filter((s) => s.nextAt <= now);
}

/** Rolls a session to its next occurrence after it fires. */
export function advanceSession(session: ScheduledSession, now: number): ScheduledSession {
  return {
    ...session,
    lastOpenedAt: now,
    nextAt: nextOccurrence(session.time, now, session.frequency, session.dayOfWeek)
  };
}

export function describeSchedule(s: ScheduledSession): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const when = s.frequency === "daily" ? "every day" : `${days[s.dayOfWeek]}s`;
  return `${when} at ${s.time}`;
}

export function localStorageScheduledSessions(): KvStorage {
  return localStorageArea();
}
