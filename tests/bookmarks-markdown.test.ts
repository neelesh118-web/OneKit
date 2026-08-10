// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bookmarkStats, bookmarksToCsv, bookmarksToMarkdown, flattenBookmarks } from "../src/core/bookmarks-markdown";
import type { BookmarkNodeLike } from "../src/core/bookmark-cleaner";

const root: BookmarkNodeLike = {
  id: "root",
  title: "",
  children: [
    {
      id: "f1",
      title: "Work",
      children: [
        { id: "b1", title: "Docs [x]", url: "https://docs.example" },
        { id: "b2", title: "Mail", url: "https://mail.example" }
      ]
    },
    {
      id: "f2",
      title: "Reading",
      children: [
        { id: "b3", title: "News", url: "https://news.example" }
      ]
    },
    { id: "b4", title: "Unsorted link", url: "https://loose.example" }
  ]
};

describe("flattenBookmarks", () => {
  it("walks the tree with folder context", () => {
    const lines = flattenBookmarks(root);
    expect(lines).toHaveLength(4);
    expect(lines[0]!.folder).toBe("Work");
    // Root-level links have no folder context.
    expect(lines[3]!.folder).toBe("");
  });
});

describe("bookmarksToMarkdown", () => {
  it("groups by folder", () => {
    const md = bookmarksToMarkdown(root);
    expect(md).toContain("## Work");
    expect(md).toContain("## Reading");
    expect(md).toContain("[Docs x](https://docs.example)");
    expect(md).toContain("## Unsorted");
  });
});

describe("bookmarksToCsv", () => {
  it("emits folder,title,url rows", () => {
    const csv = bookmarksToCsv(root);
    expect(csv.split("\n")[0]).toBe('"folder","title","url"');
    expect(csv).toContain('"Work","Docs [x]","https://docs.example"');
  });
});

describe("bookmarkStats", () => {
  it("counts links and folders", () => {
    const stats = bookmarkStats(root);
    expect(stats.total).toBe(4);
    expect(stats.folders).toBe(2); // Work + Reading (root isn't a user folder)
  });
});
