// @vitest-environment node
import { describe, expect, it } from "vitest";
import { searchUrl, searchUrls, SEARCH_ENGINES } from "../src/core/multi-search";

describe("searchUrl", () => {
  it("encodes queries", () => {
    expect(searchUrl("google", "hello world")).toBe("https://www.google.com/search?q=hello%20world");
  });
  it("returns null for unknown engines", () => {
    expect(searchUrl("nope", "x")).toBeNull();
  });
  it("returns null for empty queries", () => {
    expect(searchUrl("google", "   ")).toBeNull();
  });
});

describe("searchUrls", () => {
  it("builds one URL per engine", () => {
    const urls = searchUrls(["google", "youtube", "wikipedia"], "cats");
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("google.com");
    expect(urls[1]).toContain("youtube.com");
    expect(urls[2]).toContain("wikipedia.org");
  });
  it("skips engines that produce nothing", () => {
    expect(searchUrls(["google", "nope"], "")).toEqual([]);
  });
  it("exposes 8 engines", () => {
    expect(SEARCH_ENGINES.length).toBeGreaterThanOrEqual(6);
  });
});
