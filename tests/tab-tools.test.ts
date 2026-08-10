import { describe, expect, it } from "vitest";
import {
  duplicateTabIdsToClose,
  filterTabs,
  groupDuplicateTabs,
  normalizeTabUrl,
  type TabLike
} from "../src/core/tab-tools";

const tab = (id: number, url: string, extra: Partial<TabLike> = {}): TabLike => ({
  id,
  url,
  title: url,
  windowId: 1,
  index: id,
  ...extra
});

describe("tab-tools", () => {
  it("normalizes urls for grouping", () => {
    expect(normalizeTabUrl("https://example.com/page/#frag")).toBe("https://example.com/page");
    expect(normalizeTabUrl("https://example.com/page/")).toBe("https://example.com/page");
    expect(normalizeTabUrl("chrome://newtab/")).toBe("");
    expect(normalizeTabUrl("about:blank")).toBe("");
  });

  it("groups duplicate tabs by normalized url", () => {
    const tabs = [
      tab(1, "https://a.com/x"),
      tab(2, "https://a.com/x#top"),
      tab(3, "https://b.com/y"),
      tab(4, "https://a.com/x"),
      tab(5, "https://b.com/y")
    ];
    const groups = groupDuplicateTabs(tabs);
    expect(groups).toHaveLength(2);
    const aGroup = groups.find((g) => g[0]?.id === 1)!;
    expect(aGroup.map((t) => t.id)).toEqual([1, 2, 4]);
  });

  it("ignores single tabs and non-http tabs", () => {
    const groups = groupDuplicateTabs([
      tab(1, "https://a.com/solo"),
      tab(2, "chrome://extensions"),
      tab(3, "about:blank")
    ]);
    expect(groups).toHaveLength(0);
  });

  it("keeps the leftmost tab and returns the rest for closing", () => {
    const tabs = [
      tab(1, "https://a.com/x"),
      tab(2, "https://a.com/x"),
      tab(3, "https://a.com/x")
    ];
    const ids = duplicateTabIdsToClose(groupDuplicateTabs(tabs));
    expect(ids).toEqual([2, 3]);
  });

  it("filters tabs by title or url case-insensitively", () => {
    const tabs = [tab(1, "https://github.com/foo", { title: "GitHub Repo" }), tab(2, "https://maps.google.com", { title: "Maps" })];
    expect(filterTabs(tabs, "github")).toHaveLength(1);
    expect(filterTabs(tabs, "MAPS")).toHaveLength(1);
    expect(filterTabs(tabs, "")).toHaveLength(2);
    expect(filterTabs(tabs, "zzz")).toHaveLength(0);
  });
});
