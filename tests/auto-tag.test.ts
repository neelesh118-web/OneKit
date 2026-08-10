import { describe, expect, it } from "vitest";
import {
  filterByTag,
  tagCloud,
  tagFromDomain,
  tagsForItem,
  tagsFromText,
  wordTags
} from "../src/core/auto-tag";

describe("auto-tag", () => {
  it("derives a domain tag from hostnames (incl. compound TLDs)", () => {
    expect(tagFromDomain("github.com")).toBe("github");
    expect(tagFromDomain("www.bbc.co.uk")).toBe("bbc");
    expect(tagFromDomain("news.google.com.au")).toBe("google");
    expect(tagFromDomain("localhost")).toBe("localhost");
  });

  it("matches keyword rules in titles (whole words only)", () => {
    expect(tagsFromText("How to bake bread — a tutorial")).toContain("tutorials");
    expect(tagsFromText("React guide for beginners")).toContain("tutorials");
    expect(tagsFromText("The best Python libraries for ML")).toContain("coding");
    // "plain" contains "ai" — whole-word matching must not tag it.
    expect(tagsFromText("plain title")).toEqual([]);
  });

  it("extracts meaningful word tags, skipping stop words", () => {
    const tags = wordTags("The Complete Guide to Modern Web Development");
    expect(tags).not.toContain("the");
    expect(tags).toContain("guide");
  });

  it("combines domain + keyword + word tags, deduped and sorted", () => {
    const tags = tagsForItem("https://css-tricks.com/a-python-tutorial/", "Python tutorial for beginners");
    expect(tags).toContain("css-tricks");
    expect(tags).toContain("tutorials");
    expect(tags).toContain("coding");
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("filters and builds a tag cloud", () => {
    const items = [
      { url: "https://a.com/x", title: "Python tutorial" },
      { url: "https://b.com/y", title: "JavaScript guide" },
      { url: "https://c.com/z", title: "boring" }
    ];
    expect(filterByTag(items, "coding")).toHaveLength(2);
    const cloud = tagCloud(items);
    const coding = cloud.find((c) => c.tag === "coding");
    expect(coding?.count).toBe(2);
  });
});
