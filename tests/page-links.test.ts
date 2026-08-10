import { describe, expect, it } from "vitest";
import { collectPageLinks } from "../src/core/page-links";

describe("open all links", () => {
  it("collects http(s) links and dedupes", () => {
    const result = collectPageLinks(
      ["https://a.com/1", "https://a.com/1", "https://a.com/2", "mailto:x@y.com", "/relative"],
      "https://page.com/",
      { max: 25 }
    );
    expect(result.links).toEqual(["https://a.com/1", "https://a.com/2", "https://page.com/relative"]);
    expect(result.dropped).toBe(1); // mailto
  });

  it("can exclude same-origin links", () => {
    const result = collectPageLinks(
      ["https://page.com/self", "https://other.com/x"],
      "https://page.com/",
      { excludeSameOrigin: true }
    );
    expect(result.links).toEqual(["https://other.com/x"]);
  });

  it("caps the batch and counts the dropped remainder", () => {
    const hrefs = Array.from({ length: 10 }, (_, i) => `https://a.com/${i}`);
    const result = collectPageLinks(hrefs, "https://page.com/", { max: 3 });
    expect(result.links).toHaveLength(3);
    expect(result.dropped).toBe(7);
  });

  it("skips garbage lines", () => {
    const result = collectPageLinks(["javascript:void(0)", "data:text/html,x", ""], "https://page.com/");
    expect(result.links).toHaveLength(0);
  });
});
