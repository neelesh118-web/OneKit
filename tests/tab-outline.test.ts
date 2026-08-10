// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildTabOutline, filterTabOutline } from "../src/core/tab-outline";

const tabs = [
  { id: 1, title: "News — Home", url: "https://news.example.com/", index: 0, active: true, windowId: 1 },
  { id: 2, title: "News — World", url: "https://news.example.com/world", index: 1, active: false, windowId: 1 },
  { id: 3, title: "Mail", url: "https://mail.example.com/inbox", index: 2, active: false, windowId: 1 },
  { id: 4, title: "Settings", url: "chrome://settings/", index: 0, active: true, windowId: 2 }
];

describe("tab outline", () => {
  it("groups tabs by host and sorts groups by size", () => {
    const outline = buildTabOutline(tabs);
    expect(outline.totalTabs).toBe(4);
    expect(outline.windows).toBe(2);
    expect(outline.groups[0]!.host).toBe("news.example.com");
    expect(outline.groups[0]!.tabs).toHaveLength(2);
    expect(outline.groups[1]!.host).toBe("mail.example.com");
  });

  it("labels a group with the first tab's title", () => {
    const outline = buildTabOutline(tabs);
    expect(outline.groups[0]!.label).toBe("News — Home");
  });

  it("dedupes duplicate tab ids and keeps tabs in order", () => {
    const outline = buildTabOutline([...tabs, { id: 1, title: "dup", url: "https://news.example.com/" }]);
    expect(outline.totalTabs).toBe(4);
    expect(outline.groups[0]!.tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it("filters by host or title", () => {
    const outline = buildTabOutline(tabs);
    expect(filterTabOutline(outline, "world").groups[0]!.tabs).toHaveLength(1);
    expect(filterTabOutline(outline, "mail").groups[0]!.host).toBe("mail.example.com");
    expect(filterTabOutline(outline, "").groups).toHaveLength(outline.groups.length);
    expect(filterTabOutline(outline, "zzz").groups).toHaveLength(0);
  });
});
