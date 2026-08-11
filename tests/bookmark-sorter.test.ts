import { describe, expect, it } from "vitest";
import { buildBookmarkPlan, categoryForHostname, folderNameForUrl } from "../src/core/bookmark-sorter";

const tree = [
  {
    id: "root",
    title: "",
    children: [
      {
        id: "bar",
        title: "Bookmarks bar",
        children: [
          { id: "b1", title: "NYT", url: "https://www.nytimes.com/section/world" },
          { id: "b2", title: "Reddit", url: "https://www.reddit.com/r/chrome_extensions" },
          { id: "b3", title: "GitHub", url: "https://github.com/onekit" },
          { id: "b4", title: "NYT again", url: "https://www.nytimes.com/section/world" },
          { id: "empty", title: "Empty folder", children: [] }
        ]
      },
      {
        id: "other",
        title: "Other bookmarks",
        children: [
          { id: "b5", title: "Gmail", url: "https://mail.google.com/" }
        ]
      }
    ]
  }
];

describe("bookmark sorter", () => {
  it("categories hosts and names folders", () => {
    expect(categoryForHostname("www.nytimes.com")).toBe("News");
    expect(categoryForHostname("github.com")).toBe("Dev & docs");
    expect(categoryForHostname("example.org")).toBeNull();
    expect(folderNameForUrl("https://www.nytimes.com/x").name).toBe("News — nytimes.com");
    expect(folderNameForUrl("https://example.org/x").name).toBe("example.org");
  });

  it("groups bookmarks by domain and merges duplicates", () => {
    const plan = buildBookmarkPlan(tree);
    // 5 unique URLs across 4 domains (nytimes duplicated → 1 duplicate)
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]!.dup.id).toBe("b4");
    const nyt = plan.folders.find((f) => f.key === "nytimes.com");
    expect(nyt?.entries).toHaveLength(1);
    expect(plan.folders.some((f) => f.key === "reddit.com")).toBe(true);
    expect(plan.folders.some((f) => f.key === "github.com")).toBe(true);
    expect(plan.folders.some((f) => f.key === "google.com")).toBe(true);
  });

  it("counts moved bookmarks and lists empty folders", () => {
    const plan = buildBookmarkPlan(tree);
    expect(plan.totalMoved).toBe(4); // 5 unique entries, the duplicate is excluded
    expect(plan.emptyFolders).toHaveLength(1);
    expect(plan.emptyFolders[0]!.title).toContain("Empty folder");
  });

  it("handles an empty tree", () => {
    const plan = buildBookmarkPlan([]);
    expect(plan.folders).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(0);
    expect(plan.totalMoved).toBe(0);
  });
});
