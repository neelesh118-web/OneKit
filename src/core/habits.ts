/**
 * Habit tracker — daily check-off grid with streaks, stored in
 * chrome.storage.local. A habit keeps a map of `YYYY-MM-DD → true` so
 * streaks survive restarts and can be computed from history alone.
 */

import type { KvStorage } from "./storage-utils";

export interface Habit {
  id: string;
  name: string;
  icon: string;
  /** Local date keys ("YYYY-MM-DD") that were checked off. */
  dates: Record<string, true>;
}

export interface HabitStats {
  /** Consecutive days up to today (or yesterday if today isn't checked yet). */
  streak: number;
  /** Total days ever checked. */
  total: number;
  /** How many of the last 7 days were checked. */
  last7: number;
  doneToday: boolean;
}

const HABITS_KEY = "ok.habits";

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayKeyOffset(fromKey: string, offsetDays: number): string {
  const [y, m, d] = fromKey.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + offsetDays);
  return todayKey(date);
}

async function readHabits(storage: KvStorage): Promise<Habit[]> {
  const raw = await storage.get(HABITS_KEY);
  const list = raw[HABITS_KEY] as Habit[] | undefined;
  return Array.isArray(list) ? list : [];
}

async function writeHabits(storage: KvStorage, habits: Habit[]): Promise<void> {
  await storage.set({ [HABITS_KEY]: habits });
}

export async function listHabits(storage: KvStorage): Promise<Habit[]> {
  return readHabits(storage);
}

export async function addHabit(name: string, icon: string, storage: KvStorage): Promise<Habit> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the habit a name.");
  const habit: Habit = { id: `habit-${crypto.randomUUID()}`, name: trimmed, icon: icon || "✅", dates: {} };
  const habits = await readHabits(storage);
  if (habits.some((h) => h.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That habit already exists.");
  }
  habits.push(habit);
  await writeHabits(storage, habits);
  return habit;
}

export async function removeHabit(id: string, storage: KvStorage): Promise<void> {
  const habits = await readHabits(storage);
  await writeHabits(storage, habits.filter((h) => h.id !== id));
}

/** Checks (or unchecks) a habit for a given local date key. */
export async function toggleHabitDay(
  id: string,
  dateKey: string,
  storage: KvStorage
): Promise<Habit> {
  const habits = await readHabits(storage);
  const habit = habits.find((h) => h.id === id);
  if (!habit) throw new Error("Habit not found.");
  if (habit.dates[dateKey]) {
    delete habit.dates[dateKey];
  } else {
    habit.dates[dateKey] = true;
  }
  await writeHabits(storage, habits);
  return habit;
}

/** Consecutive-day streak: counts back from today; if today isn't checked,
 * the streak is still alive if yesterday is (you haven't missed today yet). */
export function habitStreak(habit: Habit, now = new Date()): HabitStats {
  const today = todayKey(now);
  const days: string[] = [];
  let cursor = habit.dates[today] ? today : dayKeyOffset(today, -1);
  let streak = 0;
  while (habit.dates[cursor]) {
    streak += 1;
    days.push(cursor);
    cursor = dayKeyOffset(cursor, -1);
  }
  if (!habit.dates[today] && streak > 0) {
    // Streak still alive (yesterday checked) — don't credit today yet.
  }
  let last7 = 0;
  for (let i = 0; i < 7; i++) {
    if (habit.dates[dayKeyOffset(today, -i)]) last7 += 1;
  }
  return {
    streak,
    total: Object.keys(habit.dates).length,
    last7,
    doneToday: Boolean(habit.dates[today])
  };
}

/** The last 7 date keys ending today — for the popup's weekly grid. */
export function last7Keys(now = new Date()): string[] {
  const today = todayKey(now);
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) out.push(dayKeyOffset(today, -i));
  return out;
}

/** Short weekday label for a date key, e.g. "Mon". */
export function weekdayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "short" });
}
