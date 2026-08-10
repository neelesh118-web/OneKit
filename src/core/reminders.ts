/**
 * Reminders — purely local. A reminder has a due timestamp; when it comes
 * due the background service worker shows a notification. No account, no
 * server, and nothing is uploaded.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const REMINDERS_STORAGE_KEY = "ok.reminders";

export interface Reminder {
  id: string;
  text: string;
  /** Epoch ms the reminder should fire. */
  due: number;
  /** When it was created (epoch ms). */
  createdAt: number;
  /** When it fired (epoch ms) or null while pending. */
  firedAt: number | null;
}

export interface ReminderInput {
  text: string;
  due: number;
}

export function createReminder(input: ReminderInput, now: number): Reminder {
  const text = input.text.trim();
  if (!text) throw new Error("Reminder text is required.");
  if (!Number.isFinite(input.due) || input.due <= now) {
    throw new Error("Pick a time in the future.");
  }
  return {
    id: `rem-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    due: Math.round(input.due),
    createdAt: now,
    firedAt: null
  };
}

/** Adds a reminder and schedules its alarm in one call. */
export async function addReminder(
  input: ReminderInput,
  now: number,
  storage: KvStorage,
  scheduleAlarm: (id: string, when: number) => Promise<void>
): Promise<Reminder> {
  const reminder = createReminder(input, now);
  const list = await loadReminders(storage);
  list.push(reminder);
  await saveReminders(list, storage);
  await scheduleAlarm(reminder.id, reminder.due);
  return reminder;
}

export async function loadReminders(storage: KvStorage): Promise<Reminder[]> {
  const data = await storage.get(REMINDERS_STORAGE_KEY);
  const raw = data[REMINDERS_STORAGE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is Reminder => {
    if (typeof r !== "object" || r === null) return false;
    const cand = r as Partial<Reminder>;
    return typeof cand.id === "string" && typeof cand.text === "string" && typeof cand.due === "number";
  });
}

export async function saveReminders(list: Reminder[], storage: KvStorage): Promise<void> {
  await storage.set({ [REMINDERS_STORAGE_KEY]: list });
}

/** Marks a reminder as fired (kept in the list so the user can dismiss it). */
export async function markFired(id: string, storage: KvStorage): Promise<Reminder | null> {
  const list = await loadReminders(storage);
  const reminder = list.find((r) => r.id === id);
  if (!reminder) return null;
  reminder.firedAt = Date.now();
  await saveReminders(list, storage);
  return reminder;
}

export async function removeReminder(id: string, storage: KvStorage): Promise<void> {
  const list = await loadReminders(storage);
  await saveReminders(list.filter((r) => r.id !== id), storage);
}

export async function clearReminders(storage: KvStorage): Promise<void> {
  await storage.set({ [REMINDERS_STORAGE_KEY]: [] });
}

/** Pending (not yet fired) reminders sorted soonest-first. */
export async function pendingReminders(storage: KvStorage, now: number): Promise<Reminder[]> {
  const list = await loadReminders(storage);
  return list.filter((r) => r.firedAt === null && r.due > now).sort((a, b) => a.due - b.due);
}

/** Due-but-unfired reminders (for a service-worker catch-up sweep). */
export async function dueReminders(storage: KvStorage, now: number): Promise<Reminder[]> {
  const list = await loadReminders(storage);
  return list.filter((r) => r.firedAt === null && r.due <= now);
}

/** Friendly "in 25 minutes" style label. */
export function relativeDue(due: number, now: number): string {
  const diff = Math.max(0, due - now);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `in ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} d`;
}

/** Convenience wrapper used by tests and the popup without a live alarm API. */
export function reminderLabel(r: Reminder, now: number): string {
  return r.firedAt !== null ? "fired" : relativeDue(r.due, now);
}

/** Storage adapter for extension contexts (matches the other stores). */
export function localStorageReminders(): KvStorage {
  return localStorageArea();
}
