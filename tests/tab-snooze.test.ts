import { describe, expect, it } from "vitest";
import {
  clearSnoozedTabs,
  dueSnoozedTabs,
  formatReopenLabel,
  isValidSnoozeUrl,
  listSnoozedTabs,
  snoozeTab,
  unsnoozeTab
} from "../src/core/tab-snooze";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();
const NOW = 1_000_000;

describe("tab snooze", () => {
  it("snoozes a tab and lists it sorted by reopen time", async () => {
    const s = storage();
    const later = await snoozeTab(s, { url: "https://example.com/a", title: "A", reopenAt: NOW + 3_600_000 }, NOW);
    const soon = await snoozeTab(s, { url: "https://example.com/b", title: "B", reopenAt: NOW + 60_000 }, NOW);
    expect(later?.id).toMatch(/^snooze-/);
    const list = await listSnoozedTabs(s);
    expect(list.map((t) => t.title)).toEqual(["B", "A"]);
    expect(soon?.id).toBeDefined();
  });

  it("rejects non-http(s) URLs", async () => {
    const s = storage();
    expect(await snoozeTab(s, { url: "chrome://settings", title: "x", reopenAt: NOW + 1000 }, NOW)).toBeNull();
    expect(await snoozeTab(s, { url: "not a url", title: "x", reopenAt: NOW + 1000 }, NOW)).toBeNull();
    expect(isValidSnoozeUrl("https://example.com/")).toBe(true);
    expect(isValidSnoozeUrl(undefined)).toBe(false);
  });

  it("reports due tabs only and lets you unsnooze", async () => {
    const s = storage();
    const a = await snoozeTab(s, { url: "https://a.com/", title: "a", reopenAt: NOW + 1000 }, NOW);
    await snoozeTab(s, { url: "https://b.com/", title: "b", reopenAt: NOW + 999_999 }, NOW);
    const due = await dueSnoozedTabs(s, NOW + 2000);
    expect(due.map((t) => t.title)).toEqual(["a"]);
    await unsnoozeTab(s, a!.id);
    expect(await listSnoozedTabs(s)).toHaveLength(1);
  });

  it("clears all snoozes", async () => {
    const s = storage();
    await snoozeTab(s, { url: "https://a.com/", title: "a", reopenAt: NOW + 1000 }, NOW);
    await clearSnoozedTabs(s);
    expect(await listSnoozedTabs(s)).toHaveLength(0);
  });

  it("labels reopen times human-readably", () => {
    expect(formatReopenLabel(NOW - 10, NOW)).toBe("due now");
    expect(formatReopenLabel(NOW + 5 * 60_000, NOW)).toBe("in 5 min");
    expect(formatReopenLabel(NOW + 2 * 3_600_000, NOW)).toBe("in 2 h");
    expect(formatReopenLabel(NOW + 3 * 86_400_000, NOW)).toBe("in 3 d");
  });
});
