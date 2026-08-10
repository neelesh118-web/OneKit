// @vitest-environment node
import { describe, expect, it } from "vitest";
import { tabStats, tabsToCsv, tabsToMarkdown } from "../src/core/tab-list";
import type { TabLike } from "../src/core/tab-tools";

const tabs: TabLike[] = [
  { id: 1, title: "Example [Site]", url: "https://example.com", active: true },
  { id: 2, title: 'He said "hi"', url: "https://example.com/2?q=a&b=c", active: false },
  { id: 3, title: "New Tab", url: "chrome://newtab/", active: false }
];

describe("tabsToMarkdown", () => {
  it("builds a numbered list", () => {
    const md = tabsToMarkdown(tabs);
    expect(md).toContain("1. [Example Site](https://example.com)");
    expect(md).toContain("2. [He said \"hi\"](https://example.com/2?q=a&b=c)");
    expect(md).toContain("3. [New Tab](chrome://newtab/)");
  });
  it("handles empty input", () => {
    expect(tabsToMarkdown([])).toContain("# Open tabs");
  });
});

describe("tabsToCsv", () => {
  it("escapes quotes and commas", () => {
    const csv = tabsToCsv(tabs);
    expect(csv).toContain('"He said ""hi"""');
    expect(csv.split("\n")[0]).toBe('"title","url"');
  });
});

describe("tabStats", () => {
  it("counts http and internal tabs", () => {
    const s = tabStats(tabs);
    expect(s.count).toBe(3);
    expect(s.http).toBe(2);
    expect(s.internal).toBe(1);
  });
});
