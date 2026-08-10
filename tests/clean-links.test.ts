import { describe, expect, it } from "vitest";
import { cleanLink, cleanUrl, isTrackingParam } from "../src/core/clean-links";

describe("clean-links", () => {
  it("strips utm_* parameters", () => {
    const result = cleanUrl(
      "https://example.com/page?utm_source=newsletter&utm_medium=email&id=42"
    );
    expect(result.url).toBe("https://example.com/page?id=42");
    expect(result.removed).toEqual(["utm_source", "utm_medium"]);
    expect(result.changed).toBe(true);
  });

  it("strips social/click-id parameters", () => {
    const url = cleanLink(
      "https://example.com/post?fbclid=abc123&gclid=xyz&msclkid=mmm&igshid=aaa"
    );
    expect(url).toBe("https://example.com/post");
  });

  it("strips a full UTM+referrer cluster and keeps the hash", () => {
    const url = cleanLink(
      "https://example.com/article?utm_campaign=launch&ref=twitter&utm_term=cat#section-2"
    );
    expect(url).toBe("https://example.com/article#section-2");
  });

  it("leaves a clean URL untouched", () => {
    const result = cleanUrl("https://example.com/plain?keep=1&also=2");
    expect(result.changed).toBe(false);
    expect(result.url).toBe("https://example.com/plain?keep=1&also=2");
    expect(result.removed).toEqual([]);
  });

  it("returns the input unchanged when the URL cannot be parsed", () => {
    const input = "not a url at all";
    expect(cleanLink(input)).toBe(input);
    expect(cleanUrl(input).changed).toBe(false);
  });

  it("does not touch non-http(s) schemes", () => {
    expect(cleanLink("mailto:hi@example.com?utm_source=x")).toBe("mailto:hi@example.com?utm_source=x");
  });

  it("handles uppercase parameter names", () => {
    expect(cleanLink("https://example.com/?UTM_SOURCE=x&Keep=1")).toBe("https://example.com/?Keep=1");
  });

  it("isTrackingParam covers prefixes", () => {
    expect(isTrackingParam("utm_campaign")).toBe(true);
    expect(isTrackingParam("utm_future_thing")).toBe(true);
    expect(isTrackingParam("fbclid")).toBe(true);
    expect(isTrackingParam("keepme")).toBe(false);
  });
});
