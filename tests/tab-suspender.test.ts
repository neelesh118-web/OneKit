import { describe, expect, it } from "vitest";
import { thresholdLabel, tabsToSuspend } from "../src/core/tab-suspender";
import type { TabLike } from "../src/core/tab-tools";

const tab = (id: number, overrides: Partial<TabLike> = {}): TabLike => ({
  id,
  url: "https://example.com/",
  title: `tab ${id}`,
  lastAccessed: 1_000_000,
  ...overrides
});

const NOW = 2_000_000;

describe("tabsToSuspend", () => {
  it("suspends idle http(s) tabs older than the threshold", () => {
    const tabs = [
      tab(1, { lastAccessed: NOW - 20 * 60 * 1000 }),
      tab(2, { lastAccessed: NOW - 5 * 60 * 1000 })
    ];
    const ids = tabsToSuspend(tabs, { thresholdMs: 10 * 60 * 1000, now: NOW });
    expect(ids).toEqual([1]);
  });

  it("never suspends the active tab, pinned tabs, or audible tabs", () => {
    const tabs = [
      tab(1, { active: true, lastAccessed: NOW - 999 }),
      tab(2, { pinned: true, lastAccessed: NOW - 999 }),
      tab(3, { audible: true, lastAccessed: NOW - 999 }),
      tab(4, { lastAccessed: NOW - 999 })
    ];
    const ids = tabsToSuspend(tabs, {
      thresholdMs: 1,
      activeTabId: 5,
      now: NOW
    });
    expect(ids).toEqual([4]);
  });

  it("skips non-http(s) pages", () => {
    const tabs = [
      tab(1, { url: "chrome://extensions", lastAccessed: 0 }),
      tab(2, { url: "about:blank", lastAccessed: 0 }),
      tab(3, { url: "https://ok.com/", lastAccessed: 0 })
    ];
    expect(tabsToSuspend(tabs, { thresholdMs: 0, now: NOW })).toEqual([3]);
  });

  it("skips tabs with no id and returns [] for empty input", () => {
    expect(tabsToSuspend([], { thresholdMs: 0, now: NOW })).toEqual([]);
    expect(
      tabsToSuspend([{ url: "https://x.com/", lastAccessed: 0 }], { thresholdMs: 0, now: NOW })
    ).toEqual([]);
  });

  it("labels thresholds human-readably", () => {
    expect(thresholdLabel(10)).toBe("10 min");
    expect(thresholdLabel(60)).toBe("1 hour");
    expect(thresholdLabel(180)).toBe("3 hours");
  });
});
