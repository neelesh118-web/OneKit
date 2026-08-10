import { describe, expect, it } from "vitest";
import { groupNameForHostname, planTabGroups, GROUP_COLORS } from "../src/core/tab-grouping";
import type { TabLike } from "../src/core/tab-tools";

const tab = (id: number, url: string, overrides: Partial<TabLike> = {}): TabLike => ({
  id,
  url,
  title: `tab ${id}`,
  index: id,
  windowId: 1,
  ...overrides
});

describe("groupNameForHostname", () => {
  it("strips www and picks the registrable label", () => {
    expect(groupNameForHostname("www.example.com")).toBe("example");
    expect(groupNameForHostname("example.com")).toBe("example");
    expect(groupNameForHostname("api.github.com")).toBe("github");
    expect(groupNameForHostname("sub.deep.example.co.uk")).toBe("example");
  });

  it("falls back safely", () => {
    expect(groupNameForHostname("localhost")).toBe("localhost");
    expect(groupNameForHostname("")).toBe("other");
  });
});

describe("planTabGroups", () => {
  it("groups http(s) tabs by site, skipping singletons", () => {
    const plans = planTabGroups([
      tab(1, "https://example.com/a"),
      tab(2, "https://example.com/b"),
      tab(3, "https://github.com/one"),
      tab(4, "https://www.example.com/c"),
      tab(5, "https://github.com/two"),
      tab(6, "https://lonely-site.com/")
    ]);
    expect(plans).toHaveLength(2);
    const example = plans.find((p) => p.name === "example");
    const github = plans.find((p) => p.name === "github");
    expect(example?.tabIds.sort()).toEqual([1, 2, 4]);
    expect(github?.tabIds.sort()).toEqual([3, 5]);
    expect(plans.every((p) => GROUP_COLORS.includes(p.color))).toBe(true);
  });

  it("skips tabs already in a group, non-http(s), and id-less tabs", () => {
    const plans = planTabGroups([
      tab(1, "https://example.com/a", { groupId: 7 }),
      tab(2, "https://example.com/b", { groupId: 7 }),
      tab(3, "chrome://extensions"),
      { title: "no id", url: "https://example.com/c" } as unknown as TabLike
    ]);
    expect(plans).toHaveLength(0);
  });

  it("sorts plans by leftmost tab position", () => {
    const plans = planTabGroups([
      tab(5, "https://b.com/x", { windowId: 1, index: 5 }),
      tab(1, "https://a.com/x", { windowId: 1, index: 1 }),
      tab(2, "https://a.com/y", { windowId: 1, index: 2 }),
      tab(6, "https://b.com/y", { windowId: 1, index: 6 })
    ]);
    expect(plans[0]!.name).toBe("a");
    expect(plans[1]!.name).toBe("b");
  });

  it("returns [] for empty input", () => {
    expect(planTabGroups([])).toEqual([]);
  });
});
