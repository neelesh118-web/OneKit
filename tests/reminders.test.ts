// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addReminder,
  clearReminders,
  createReminder,
  dueReminders,
  loadReminders,
  markFired,
  pendingReminders,
  relativeDue,
  removeReminder,
  saveReminders,
  type Reminder
} from "../src/core/reminders";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

describe("createReminder", () => {
  it("builds a valid reminder", () => {
    const r = createReminder({ text: "  Call dentist  ", due: NOW + 30 * MIN }, NOW);
    expect(r.text).toBe("Call dentist");
    expect(r.due).toBe(NOW + 30 * MIN);
    expect(r.firedAt).toBeNull();
    expect(r.id).toBeTruthy();
  });
  it("rejects empty text", () => {
    expect(() => createReminder({ text: "  ", due: NOW + MIN }, NOW)).toThrow(/text/);
  });
  it("rejects past due times", () => {
    expect(() => createReminder({ text: "x", due: NOW - 1 }, NOW)).toThrow(/future/);
  });
});

describe("store", () => {
  it("adds and schedules an alarm", async () => {
    const storage = createMemoryStorage();
    const alarms: Array<[string, number]> = [];
    const r = await addReminder(
      { text: "Stand up", due: NOW + MIN },
      NOW,
      storage,
      async (id, when) => {
        alarms.push([id, when]);
      }
    );
    expect(alarms).toEqual([[r.id, NOW + MIN]]);
    const list = await loadReminders(storage);
    expect(list).toHaveLength(1);
  });

  it("marks fired and lists pending/due", async () => {
    const storage = createMemoryStorage();
    const r1 = createReminder({ text: "soon", due: NOW + MIN }, NOW);
    // A past-due reminder can only exist after the fact (e.g. the machine
    // slept past the alarm) — seed it directly.
    const r2: Reminder = { id: "rem-past", text: "past", due: NOW - MIN, createdAt: NOW - 2 * MIN, firedAt: null };
    await saveReminders([r1, r2], storage);

    const pending = await pendingReminders(storage, NOW);
    expect(pending.map((r) => r.text)).toEqual(["soon"]);

    const due = await dueReminders(storage, NOW);
    expect(due.map((r) => r.text)).toEqual(["past"]);

    await markFired(r2.id, storage);
    expect((await loadReminders(storage)).find((r) => r.id === r2.id)!.firedAt).not.toBeNull();
  });

  it("removes and clears", async () => {
    const storage = createMemoryStorage();
    const r = createReminder({ text: "x", due: NOW + MIN }, NOW);
    await saveReminders([r], storage);
    await removeReminder(r.id, storage);
    expect(await loadReminders(storage)).toHaveLength(0);
    await saveReminders([r], storage);
    await clearReminders(storage);
    expect(await loadReminders(storage)).toHaveLength(0);
  });

  it("ignores malformed stored entries", async () => {
    const storage = createMemoryStorage({ "ok.reminders": [{ id: 1 }, "nope"] });
    expect(await loadReminders(storage)).toHaveLength(0);
  });
});

describe("relativeDue", () => {
  it("labels times sensibly", () => {
    expect(relativeDue(NOW + 30 * MIN, NOW)).toBe("in 30 min");
    expect(relativeDue(NOW + 3 * 60 * MIN, NOW)).toBe("in 3 h");
    expect(relativeDue(NOW + 2 * 24 * 60 * MIN, NOW)).toBe("in 2 d");
    expect(relativeDue(NOW + 1, NOW)).toBe("now");
  });
});
