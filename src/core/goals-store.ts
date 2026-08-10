/**
 * Daily goals — a short, per-day to-do list for the home dashboard.
 * Stored under a per-day key so each day starts fresh while yesterday's
 * list stays intact (and is shown as "yesterday" until the first edit).
 */
import type { KvStorage } from "./storage-utils";

export interface Goal {
  id: string;
  text: string;
  done: boolean;
}

export const MAX_GOALS = 10;

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function keyFor(date: string): string {
  return `ok:goals:${date}`;
}

export function newGoalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listGoals(storage: KvStorage, date = todayKey()): Promise<Goal[]> {
  const got = await storage.get(keyFor(date));
  const raw = got[keyFor(date)];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (g): g is Goal =>
      typeof g === "object" &&
      g !== null &&
      typeof (g as Goal).id === "string" &&
      typeof (g as Goal).text === "string"
  );
}

export async function addGoal(text: string, storage: KvStorage, date = todayKey()): Promise<Goal[]> {
  const clean = text.trim();
  if (!clean) return listGoals(storage, date);
  const goals = await listGoals(storage, date);
  if (goals.length >= MAX_GOALS) return goals;
  const next = [...goals, { id: newGoalId(), text: clean, done: false }];
  await storage.set({ [keyFor(date)]: next });
  return next;
}

export async function toggleGoal(id: string, storage: KvStorage, date = todayKey()): Promise<Goal[]> {
  const goals = await listGoals(storage, date);
  const next = goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g));
  await storage.set({ [keyFor(date)]: next });
  return next;
}

export async function removeGoal(id: string, storage: KvStorage, date = todayKey()): Promise<Goal[]> {
  const next = (await listGoals(storage, date)).filter((g) => g.id !== id);
  await storage.set({ [keyFor(date)]: next });
  return next;
}
