// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addScheduledSession,
  advanceSession,
  createScheduledSession,
  describeSchedule,
  dueSessions,
  loadScheduledSessions,
  nextOccurrence,
  removeScheduledSession
} from "../src/core/scheduled-sessions";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = new Date("2026-08-11T08:00:00").getTime(); // Tuesday

const tabs = [{ id: 1, title: "Work", url: "https://work.example", active: false }];

describe("nextOccurrence", () => {
  it("today when still ahead", () => {
    const at = nextOccurrence("09:00", NOW, "daily", 0);
    expect(new Date(at).getHours()).toBe(9);
    expect(at).toBeGreaterThan(NOW);
  });
  it("tomorrow when already past", () => {
    const at = nextOccurrence("07:00", NOW, "daily", 0);
    expect(new Date(at).getDate()).toBe(new Date(NOW).getDate() + 1);
  });
  it("weekly rolls to the right weekday", () => {
    // NOW is Tuesday (2). Schedule for Friday (5).
    const at = nextOccurrence("09:00", NOW, "weekly", 5);
    expect(new Date(at).getDay()).toBe(5);
  });
  it("rejects bad times", () => {
    expect(() => nextOccurrence("25:00", NOW, "daily", 0)).toThrow();
  });
});

describe("createScheduledSession", () => {
  it("builds a session with a computed nextAt", () => {
    const s = createScheduledSession({ name: "  Work tabs ", frequency: "daily", dayOfWeek: 0, time: "09:00", tabs }, NOW);
    expect(s.name).toBe("Work tabs");
    expect(s.tabs).toHaveLength(1);
    expect(s.nextAt).toBeGreaterThan(NOW);
  });
  it("rejects empty sessions", () => {
    expect(() => createScheduledSession({ name: "x", frequency: "daily", dayOfWeek: 0, time: "09:00", tabs: [] }, NOW)).toThrow();
  });
});

describe("store + due + advance", () => {
  it("adds, lists and removes", async () => {
    const storage = createMemoryStorage();
    const s = await addScheduledSession({ name: "Morning", frequency: "daily", dayOfWeek: 0, time: "09:00", tabs }, NOW, storage);
    expect((await loadScheduledSessions(storage))).toHaveLength(1);
    await removeScheduledSession(s.id, storage);
    expect(await loadScheduledSessions(storage)).toHaveLength(0);
  });
  it("finds due sessions and advances them", async () => {
    const storage = createMemoryStorage();
    // Scheduled for 07:00 — tomorrow at 08:00 that occurrence is already due.
    const s = await addScheduledSession({ name: "Morning", frequency: "daily", dayOfWeek: 0, time: "07:00", tabs }, NOW, storage);
    const tomorrow = NOW + 24 * 60 * 60 * 1000;
    const due = await dueSessions(storage, tomorrow);
    expect(due.map((d) => d.id)).toEqual([s.id]);
    const advanced = advanceSession(due[0]!, tomorrow);
    expect(advanced.nextAt).toBeGreaterThan(tomorrow);
    expect(advanced.lastOpenedAt).toBe(tomorrow);
  });
  it("describes schedules", () => {
    const daily = createScheduledSession({ name: "x", frequency: "daily", dayOfWeek: 0, time: "09:00", tabs }, NOW);
    const weekly = createScheduledSession({ name: "y", frequency: "weekly", dayOfWeek: 2, time: "09:00", tabs }, NOW);
    expect(describeSchedule(daily)).toContain("every day");
    expect(describeSchedule(weekly)).toContain("Tue");
  });
});
