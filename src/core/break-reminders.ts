/**
 * Break & stretch reminders — step away from the screen.
 *
 * The #1 health ask in extension research: "remind me every 45 minutes to
 * stand up and stretch". Complements the generic reminders tool with a
 * desk-specific flow: configurable interval, per-day snooze, and actual
 * stretch suggestions instead of a bare notification. Runs on the
 * browser's own alarm system, so it fires even with the popup closed.
 */

import type { KvStorage } from "./storage-utils";

export const BREAK_REMINDERS_KEY = "ok.breakReminders";
export const BREAK_ALARM_NAME = "ok-break-reminder";
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 120;

export interface BreakReminderSettings {
  /** Minutes between reminders. */
  intervalMinutes: number;
  /** Enabled — the background fires alarms only when true. */
  enabled: boolean;
  /** Unix ms when the last snooze ends (per-day snooze). */
  snoozedUntil: number;
}

export const DEFAULT_BREAK_SETTINGS: BreakReminderSettings = {
  intervalMinutes: 45,
  enabled: false,
  snoozedUntil: 0
};

/** The stretch/eye-break suggestions shown with each reminder. */
export const BREAK_SUGGESTIONS = [
  "Stand up and stretch your arms overhead for 20 seconds.",
  "Roll your shoulders back 10 times and unclench your jaw.",
  "Look at something 20 feet away for 20 seconds (the 20-20-20 rule).",
  "Step away for a 2-minute walk — even to the next room.",
  "Drink some water — hydration is a focus hack too.",
  "Shake out your hands and wrists — your tendons will thank you.",
  "Sit up tall, squeeze your shoulder blades together, hold 10 seconds."
];

export function pickSuggestion(now: number, seedText: string): string {
  const idx = (Math.abs(seedText.length * 31 + now)) % BREAK_SUGGESTIONS.length;
  return BREAK_SUGGESTIONS[idx] ?? BREAK_SUGGESTIONS[0]!;
}

export function normalizeInterval(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_BREAK_SETTINGS.intervalMinutes;
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.round(raw)));
}

function isSettings(value: unknown): value is BreakReminderSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.intervalMinutes === "number" && typeof v.enabled === "boolean";
}

export async function readBreakSettings(storage: KvStorage): Promise<BreakReminderSettings> {
  const raw = await storage.get(BREAK_REMINDERS_KEY);
  const value = raw[BREAK_REMINDERS_KEY];
  if (!isSettings(value)) return { ...DEFAULT_BREAK_SETTINGS };
  return { ...DEFAULT_BREAK_SETTINGS, ...value, intervalMinutes: normalizeInterval(value.intervalMinutes) };
}

export async function writeBreakSettings(storage: KvStorage, settings: BreakReminderSettings): Promise<void> {
  await storage.set({ [BREAK_REMINDERS_KEY]: { ...settings, intervalMinutes: normalizeInterval(settings.intervalMinutes) } });
}

/** Sets the interval and enables the reminder. */
export async function enableBreakReminder(storage: KvStorage, intervalMinutes: number): Promise<BreakReminderSettings> {
  const settings = await readBreakSettings(storage);
  const next = { ...settings, intervalMinutes: normalizeInterval(intervalMinutes), enabled: true };
  await writeBreakSettings(storage, next);
  return next;
}

export async function disableBreakReminder(storage: KvStorage): Promise<BreakReminderSettings> {
  const settings = await readBreakSettings(storage);
  const next = { ...settings, enabled: false };
  await writeBreakSettings(storage, next);
  return next;
}

/** Snoozes reminders until `untilMs`. */
export async function snoozeBreakReminder(storage: KvStorage, untilMs: number): Promise<void> {
  const settings = await readBreakSettings(storage);
  await writeBreakSettings(storage, { ...settings, snoozedUntil: untilMs });
}

/** Whether a reminder is due right now (not snoozed). */
export function isDue(settings: BreakReminderSettings, now: number): boolean {
  return settings.enabled && now >= settings.snoozedUntil;
}

/** Next reminder time given the settings (or null when disabled). */
export function nextReminderAt(settings: BreakReminderSettings, now: number): number | null {
  if (!settings.enabled) return null;
  return Math.max(now, settings.snoozedUntil) + settings.intervalMinutes * 60_000;
}

export function localStorageBreakReminders(): KvStorage {
  return localStorageAreaRef();
}

import { localStorageArea as localStorageAreaRef } from "./storage-utils";
