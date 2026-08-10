import { describe, expect, it } from "vitest";
import { dayKey } from "../src/core/date-utils";
import {
  clearScreenTime,
  originOf,
  recordActiveTime,
  screenTimeStats
} from "../src/core/screen-time";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

const day = (offsetFromAug9: number, hour = 12): Date => {
  const d = new Date(2026, 7, 9 + offsetFromAug9, hour, 0, 0, 0);
  return d;
};

describe("screen-time", () => {
  it("extracts origins from urls only for http(s)", () => {
    expect(originOf("https://a.com/page#x")).toBe("https://a.com");
    expect(originOf("http://b.com/")).toBe("http://b.com");
    expect(originOf("chrome://extensions")).toBe("");
    expect(originOf("not a url")).toBe("");
  });

  it("accumulates per site per day", async () => {
    const s = storage();
    await recordActiveTime(s, "https://a.com/", 30, day(1)); // Mon
    await recordActiveTime(s, "https://a.com/", 60, day(1));
    await recordActiveTime(s, "https://b.com/", 120, day(1));
    await recordActiveTime(s, "https://a.com/", 45, day(2)); // Tue

    const stats = await screenTimeStats(s, day(1, 18));
    expect(stats.todaySeconds).toBe(30 + 60 + 120);
    expect(stats.todaySites[0]?.origin).toBe("https://b.com");
    expect(stats.todaySites[0]?.seconds).toBe(120);

    const tue = await screenTimeStats(s, day(2, 18));
    expect(tue.todaySeconds).toBe(45);
  });

  it("reports last-7-day totals including today", async () => {
    const s = storage();
    await recordActiveTime(s, "https://a.com/", 600, day(-3));
    await recordActiveTime(s, "https://a.com/", 300, day(1));
    const stats = await screenTimeStats(s, day(1, 18));
    expect(stats.last7Days).toHaveLength(7);
    const total = stats.last7Days.reduce((n, d) => n + d.seconds, 0);
    expect(total).toBe(900);
    expect(stats.last7Seconds).toBe(900);
    // Day older than the window is excluded.
    await recordActiveTime(s, "https://a.com/", 999999, day(-90));
    const after = await screenTimeStats(s, day(1, 18));
    expect(after.last7Seconds).toBe(900);
  });

  it("prunes days older than the retention window", async () => {
    const s = storage();
    // Record the ancient day first, then a current day — the current record's
    // prune (relative to its own timestamp) must evict the ancient entry.
    await recordActiveTime(s, "https://a.com/", 9999, day(-95));
    await recordActiveTime(s, "https://a.com/", 60, day(0));
    // Recording prunes: the -95 day entry must be gone.
    const raw = await s.get("ok.screenTime");
    const map = raw["ok.screenTime"] as Record<string, Record<string, number>>;
    const days = map["https://a.com"] ?? {};
    expect(Object.keys(days)).not.toContain(dayKey(day(-95)));
    expect(days[dayKey(day(0))]).toBe(60);
  });

  it("clears everything", async () => {
    const s = storage();
    await recordActiveTime(s, "https://a.com/", 60, day(1));
    await clearScreenTime(s);
    const stats = await screenTimeStats(s, day(1, 18));
    expect(stats.todaySeconds).toBe(0);
    expect(stats.todaySites).toHaveLength(0);
  });
});
