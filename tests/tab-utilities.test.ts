import { describe, expect, it } from "vitest";
import {
  domainOf,
  sortedTabIdsByDomain,
  tabIdsToClose,
  tabIdsToMerge,
  utilitiesSummary
} from "../src/core/tab-utilities";
import type { TabLike } from "../src/core/tab-tools";

const make = (id: number, url: string, index: number, extra: Partial<TabLike> = {}): TabLike => ({
  id,
  url,
  title: url,
  index,
  windowId: 1,
  pinned: false,
  ...extra
});

describe("tab utilities", () => {
  it("extracts the registrable domain", () => {
    expect(domainOf("https://www.example.com/path")).toBe("example.com");
    expect(domainOf("https://blog.example.co.uk/x")).toBe("example.co.uk");
    expect(domainOf("https://localhost:8080/")).toBe("localhost");
    expect(domainOf("chrome://settings")).toBe("");
    expect(domainOf(undefined)).toBe("");
  });

  it("closes tabs to the left of the active tab", () => {
    const tabs = [
      make(1, "https://a.com", 0),
      make(2, "https://b.com", 1),
      make(3, "https://c.com", 2),
      make(4, "https://d.com", 3)
    ];
    const ids = tabIdsToClose(tabs, 3, "left");
    expect(ids.sort()).toEqual([1, 2]);
  });

  it("closes tabs to the right of the active tab", () => {
    const tabs = [
      make(1, "https://a.com", 0),
      make(2, "https://b.com", 1),
      make(3, "https://c.com", 2),
      make(4, "https://d.com", 3)
    ];
    // Active = id 2 at index 1 → everything after it (ids 3, 4) closes.
    const ids = tabIdsToClose(tabs, 2, "right");
    expect(ids.sort()).toEqual([3, 4]);
  });

  it("closes other tabs and never pinned ones", () => {
    const tabs = [
      make(1, "https://a.com", 0, { pinned: true }),
      make(2, "https://b.com", 1),
      make(3, "https://c.com", 2),
      make(4, "https://d.com", 3)
    ];
    // Active = id 3 at index 2; pinned id 1 stays, others (2, 4) close.
    const ids = tabIdsToClose(tabs, 3, "others");
    expect(ids.sort()).toEqual([2, 4]);
  });

  it("does nothing without an active tab id", () => {
    expect(tabIdsToClose([make(1, "https://a.com", 0)], undefined, "others")).toEqual([]);
  });

  it("sorts tabs by domain then title", () => {
    const tabs = [
      make(1, "https://zebra.com/x", 0, { title: "Z" }),
      make(2, "https://alpha.org/y", 1, { title: "A" }),
      make(3, "https://zebra.com/a", 2, { title: "A" })
    ];
    expect(sortedTabIdsByDomain(tabs)).toEqual([2, 3, 1]);
  });

  it("plans a merge of other windows into the current one", () => {
    const tabs = [
      make(1, "https://a.com", 0, { windowId: 1 }),
      make(2, "https://b.com", 0, { windowId: 2 }),
      make(3, "https://c.com", 0, { windowId: 3 })
    ];
    expect(tabIdsToMerge(tabs, 1).sort()).toEqual([2, 3]);
    expect(tabIdsToMerge(tabs, undefined)).toEqual([]);
  });

  it("summarizes what was done", () => {
    expect(utilitiesSummary(3, 0, 0)).toContain("3 closed");
    expect(utilitiesSummary(0, 4, 2)).toContain("4 sorted");
    expect(utilitiesSummary(0, 0, 0)).toBe("Nothing to do.");
  });
});
