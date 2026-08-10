import { describe, expect, it } from "vitest";
import {
  groupByPage,
  highlightExportFilename,
  highlightStats,
  highlightsToMarkdown,
  type HighlightLike
} from "../src/core/highlight-export";

function h(id: string, url: string, text: string, createdAt: number): HighlightLike {
  return { id, url, text, color: "#fef08a", createdAt };
}

describe("highlight export", () => {
  it("groups highlights by page", () => {
    const groups = groupByPage(
      [
        h("1", "https://a.com/1", "first", 1000),
        h("2", "https://a.com/1", "second", 2000),
        h("3", "https://b.com/2", "other", 1500)
      ],
      { "https://a.com/1": "Page A" }
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.title).toBe("Page A");
    expect(groups[0]!.highlights).toHaveLength(2);
  });

  it("renders Markdown with blockquotes", () => {
    const md = highlightsToMarkdown([
      { url: "https://a.com/1", title: "Page A", highlights: [h("1", "u", "Great line", 1000)] }
    ]);
    expect(md).toContain("# Highlights");
    expect(md).toContain("## Page A");
    expect(md).toContain("> Great line");
  });

  it("handles an empty export honestly", () => {
    const md = highlightsToMarkdown([]);
    expect(md).toContain("No highlights yet");
    expect(highlightStats([])).toEqual({ pages: 0, total: 0 });
  });

  it("produces a dated filename", () => {
    expect(highlightExportFilename(new Date("2026-08-11T00:00:00Z"))).toMatch(/^onekit-highlights-2026-08-11\.md$/);
  });
});
