// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addHabit,
  habitStreak,
  last7Keys,
  listHabits,
  removeHabit,
  toggleHabitDay,
  todayKey,
  weekdayLabel
} from "../src/core/habits";
import { createMemoryStorage } from "../src/core/storage-utils";

function keyFor(daysAgo: number, from = new Date(2026, 7, 10)): string {
  const d = new Date(from);
  d.setDate(d.getDate() - daysAgo);
  return todayKey(d);
}

describe("habit tracker", () => {
  it("adds, dedupes and removes habits", async () => {
    const storage = createMemoryStorage();
    const habit = await addHabit("  Read 30 min ", "📚", storage);
    expect(habit.name).toBe("Read 30 min");
    await expect(addHabit("read 30 min", "📚", storage)).rejects.toThrow(/already exists/);
    await expect(addHabit("   ", "📚", storage)).rejects.toThrow(/name/);
    await removeHabit(habit.id, storage);
    expect(await listHabits(storage)).toHaveLength(0);
  });

  it("tracks check-offs by date", async () => {
    const storage = createMemoryStorage();
    const habit = await addHabit("Walk", "🚶", storage);
    await toggleHabitDay(habit.id, "2026-08-10", storage);
    const stats = habitStreak((await listHabits(storage))[0]!, new Date(2026, 7, 10));
    expect(stats.doneToday).toBe(true);
    expect(stats.total).toBe(1);
    await toggleHabitDay(habit.id, "2026-08-10", storage); // uncheck
    expect(habitStreak((await listHabits(storage))[0]!, new Date(2026, 7, 10)).doneToday).toBe(false);
  });

  it("computes consecutive streaks", async () => {
    const storage = createMemoryStorage();
    const habit = await addHabit("Meditate", "🧘", storage);
    // Checked 0,1,2 days ago; today (day 0) not yet — streak alive at 3.
    for (const ago of [1, 2, 3]) await toggleHabitDay(habit.id, keyFor(ago), storage);
    const stats = habitStreak((await listHabits(storage))[0]!, new Date(2026, 7, 10));
    expect(stats.streak).toBe(3);
    expect(stats.doneToday).toBe(false);
    expect(stats.last7).toBe(3);

    // A gap breaks the streak.
    await toggleHabitDay(habit.id, keyFor(5), storage);
    const broken = habitStreak((await listHabits(storage))[0]!, new Date(2026, 7, 10));
    expect(broken.streak).toBe(3); // 1,2,3 days ago still consecutive
    expect(broken.total).toBe(4);
  });

  it("streak counts today when checked", async () => {
    const storage = createMemoryStorage();
    const habit = await addHabit("Pushups", "💪", storage);
    await toggleHabitDay(habit.id, keyFor(0), storage);
    await toggleHabitDay(habit.id, keyFor(1), storage);
    const stats = habitStreak((await listHabits(storage))[0]!, new Date(2026, 7, 10));
    expect(stats.streak).toBe(2);
    expect(stats.doneToday).toBe(true);
  });

  it("provides the last-7 date keys and weekday labels", () => {
    const keys = last7Keys(new Date(2026, 7, 10));
    expect(keys).toHaveLength(7);
    expect(keys[6]).toBe("2026-08-10");
    expect(weekdayLabel("2026-08-10")).toMatch(/Mon/i);
  });
});
