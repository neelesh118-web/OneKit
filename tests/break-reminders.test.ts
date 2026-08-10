import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  disableBreakReminder,
  enableBreakReminder,
  isDue,
  nextReminderAt,
  normalizeInterval,
  pickSuggestion,
  readBreakSettings,
  snoozeBreakReminder,
  DEFAULT_BREAK_SETTINGS
} from "../src/core/break-reminders";

describe("break reminders", () => {
  it("normalizes the interval", () => {
    expect(normalizeInterval(45)).toBe(45);
    expect(normalizeInterval(1)).toBe(5);
    expect(normalizeInterval(500)).toBe(120);
  });

  it("defaults to disabled with a 45-min interval", async () => {
    const storage = createMemoryStorage();
    const settings = await readBreakSettings(storage);
    expect(settings.enabled).toBe(false);
    expect(settings.intervalMinutes).toBe(DEFAULT_BREAK_SETTINGS.intervalMinutes);
  });

  it("enables and disables", async () => {
    const storage = createMemoryStorage();
    const enabled = await enableBreakReminder(storage, 30);
    expect(enabled.enabled).toBe(true);
    expect(enabled.intervalMinutes).toBe(30);
    const disabled = await disableBreakReminder(storage);
    expect(disabled.enabled).toBe(false);
  });

  it("respects snooze and due logic", async () => {
    const storage = createMemoryStorage();
    const settings = await enableBreakReminder(storage, 45);
    expect(isDue(settings, 1000)).toBe(true);
    await snoozeBreakReminder(storage, 5000);
    const snoozed = await readBreakSettings(storage);
    expect(isDue(snoozed, 3000)).toBe(false);
    expect(isDue(snoozed, 6000)).toBe(true);
  });

  it("computes the next reminder time", async () => {
    const storage = createMemoryStorage();
    const settings = await enableBreakReminder(storage, 60);
    const next = nextReminderAt(settings, 1000);
    expect(next).toBe(1000 + 60 * 60_000);
    const disabled = await disableBreakReminder(storage);
    expect(nextReminderAt(disabled, 1000)).toBeNull();
  });

  it("picks a suggestion deterministically-ish", () => {
    const a = pickSuggestion(1000, "seed");
    const b = pickSuggestion(1000, "seed");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});
