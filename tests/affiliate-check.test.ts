import { describe, expect, it } from "vitest";
import { checkLink, checkLinks, summaryOf, tidyUrl } from "../src/core/affiliate-check";

describe("affiliate link inspector", () => {
  it("flags affiliate hosts missing rel=nofollow", () => {
    const r = checkLink({ url: "https://www.amazon.com/gp/aw/d/B0EXAMPLE" });
    expect(r.issues.some((i) => i.code === "rel-nofollow")).toBe(true);
  });

  it("accepts affiliate links with rel=nofollow", () => {
    const r = checkLink({ url: "https://www.amazon.com/dp/B0EXAMPLE", rel: "nofollow sponsored" });
    expect(r.issues.some((i) => i.code === "rel-nofollow")).toBe(false);
  });

  it("warns about missing UTM on referral-looking links", () => {
    const r = checkLink({ url: "https://example.com/product?partner=abc123" });
    expect(r.issues.some((i) => i.code === "missing-utm")).toBe(true);
  });

  it("flags tracking-param bloat", () => {
    const r = checkLink({
      url: "https://example.com/?utm_source=x&utm_medium=y&utm_campaign=z&fbclid=abc"
    });
    expect(r.issues.some((i) => i.code === "tracking-bloat")).toBe(true);
  });

  it("flags redirect wrappers and non-https", () => {
    const wrapped = checkLink({ url: "https://l.facebook.com/l.php?u=https://example.com" });
    expect(wrapped.issues.some((i) => i.code === "redirect-wrapper")).toBe(true);
    const http = checkLink({ url: "http://example.com/" });
    expect(http.issues.some((i) => i.code === "not-https")).toBe(true);
  });

  it("rejects invalid URLs and tidies trailing punctuation", () => {
    expect(tidyUrl("https://example.com/page.")).toBe("https://example.com/page");
    const r = checkLink({ url: "not a url" });
    expect(r.issues.some((i) => i.code === "invalid")).toBe(true);
  });

  it("returns every result so the summary is honest", () => {
    const results = checkLinks([
      { url: "https://www.amazon.com/dp/B0X" },
      { url: "https://example.com/clean" }
    ]);
    expect(results).toHaveLength(2);
    expect(summaryOf(results)).toEqual({ checked: 2, flagged: 1 });
  });
});
