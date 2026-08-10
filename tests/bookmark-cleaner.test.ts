import { describe, expect, it } from "vitest";
import {
  analyzeBookmarks,
  isStructurallyInvalidUrl,
  normalizeBookmarkUrl,
  removableCount,
  type BookmarkNodeLike
} from "../src/core/bookmark-cleaner";

const node = (id: string, overrides: Partial<BookmarkNodeLike> = {}): BookmarkNodeLike => ({
  id,
  title: `bookmark ${id}`,
  ...overrides
});

const tree = (...children: BookmarkNodeLike[]): BookmarkNodeLike => ({
  id: "root",
  title: "",
  children
});

describe("normalizeBookmarkUrl", () => {
  it("normalizes fragments, trailing slashes, and case", () => {
    expect(normalizeBookmarkUrl("https://example.com/a#section")).toBe("https://example.com/a");
    expect(normalizeBookmarkUrl("https://example.com/a/")).toBe("https://example.com/a");
    expect(normalizeBookmarkUrl("https://EXAMPLE.com/a?q=1#x")).toBe("https://example.com/a?q=1");
  });

  it("returns '' for non-http(s) schemes and garbage", () => {
    expect(normalizeBookmarkUrl("javascript:alert(1)")).toBe("");
    expect(normalizeBookmarkUrl("not a url")).toBe("");
  });
});

describe("isStructurallyInvalidUrl", () => {
  it("flags empty, javascript:, and garbage URLs", () => {
    expect(isStructurallyInvalidUrl(undefined)).toBe(true);
    expect(isStructurallyInvalidUrl("")).toBe(true);
    expect(isStructurallyInvalidUrl("javascript:alert(1)")).toBe(true);
    expect(isStructurallyInvalidUrl("data:text/html,x")).toBe(true);
    expect(isStructurallyInvalidUrl("https://example.com/")).toBe(false);
    expect(isStructurallyInvalidUrl("file:///c:/x.html")).toBe(false);
  });
});

describe("analyzeBookmarks", () => {
  it("finds URL duplicates and keeps the first", () => {
    const analysis = analyzeBookmarks(
      tree(
        node("a", { url: "https://example.com/page" }),
        node("b", { url: "https://example.com/page#frag" }),
        node("c", { url: "https://example.com/other" })
      )
    );
    expect(analysis.total).toBe(3);
    expect(analysis.urlDuplicates).toHaveLength(1);
    expect(analysis.urlDuplicates[0]!.keepId).toBe("a");
    expect(analysis.urlDuplicates[0]!.removeIds).toEqual(["b"]);
    expect(analysis.invalid).toHaveLength(0);
  });

  it("finds broken URLs", () => {
    const analysis = analyzeBookmarks(
      tree(
        node("a", { url: "https://example.com/ok" }),
        node("b", { url: "javascript:void(0)" }),
        node("c", { url: "not a url" })
      )
    );
    expect(analysis.invalid.map((i) => i.id)).toEqual(["b", "c"]);
    // Folders (no url at all) are never flagged.
    const withFolder = analyzeBookmarks(
      tree(node("folder", { children: [node("a", { url: "https://example.com/ok" })] }))
    );
    expect(withFolder.invalid).toHaveLength(0);
  });

  it("finds same-title duplicates in different folders", () => {
    const analysis = analyzeBookmarks(
      tree(
        node("a", { title: "Same Page", url: "https://example.com/x" }),
        node("b", { title: "Same Page", url: "https://example.com/x" }),
        node("c", { title: "Same Page", url: "https://example.com/y" })
      )
    );
    // b is both a URL duplicate of a and a title duplicate; c shares only the title.
    expect(analysis.titleDuplicates.length).toBeGreaterThanOrEqual(1);
  });

  it("counts removable bookmarks without double-counting", () => {
    const analysis = analyzeBookmarks(
      tree(
        node("a", { url: "https://example.com/x" }),
        node("b", { url: "https://example.com/x" }),
        node("c", { url: "https://example.com/x" }),
        node("d", { url: "javascript:void(0)" })
      )
    );
    expect(removableCount(analysis)).toBe(3); // b + c duplicates + d invalid
  });

  it("handles nested folders and empty trees", () => {
    const analysis = analyzeBookmarks(
      tree(
        node("a", { url: "https://example.com/1" }),
        node("folder", { children: [node("b", { url: "https://example.com/1" })] })
      )
    );
    expect(analysis.urlDuplicates).toHaveLength(1);
    expect(removableCount(analyzeBookmarks(tree()))).toBe(0);
  });
});
