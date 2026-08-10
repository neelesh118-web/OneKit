// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractToc, tocIndent, tocStats, tocToMarkdown } from "../src/core/page-toc";

describe("page toc", () => {
  it("extracts headings in document order with levels", () => {
    document.body.innerHTML = "<h1>Title</h1><p>skip</p><h2>Section</h2><h3>Sub</h3>";
    const entries = extractToc(document.body);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ level: 1, text: "Title" });
    expect(entries[1]!.level).toBe(2);
    expect(entries[2]!.level).toBe(3);
  });

  it("skips empty and hidden headings", () => {
    document.body.innerHTML = "<h1></h1><h2 style='display:none'>Hidden</h2><h2>Real</h2>";
    const entries = extractToc(document.body);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("Real");
  });

  it("assigns unique ids to duplicate headings", () => {
    document.body.innerHTML = "<h2>Intro</h2><h2>Intro</h2><h2>Intro</h2>";
    const entries = extractToc(document.body);
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("computes indentation relative to the shallowest heading", () => {
    const indents = tocIndent([
      { level: 2, text: "a", id: "a", index: 0 },
      { level: 4, text: "b", id: "b", index: 1 },
      { level: 3, text: "c", id: "c", index: 2 }
    ]);
    expect(indents).toEqual([0, 2, 1]);
  });

  it("renders markdown and stats", () => {
    document.body.innerHTML = "<h1>A</h1><h2>B</h2>";
    const entries = extractToc(document.body);
    expect(tocToMarkdown(entries)).toContain("- A");
    expect(tocStats(entries)).toEqual({ headings: 2, deepestLevel: 2 });
    expect(tocStats([])).toEqual({ headings: 0, deepestLevel: 0 });
  });
});
