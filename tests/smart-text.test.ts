import { describe, expect, it } from "vitest";
import { cleanTypography } from "../src/core/smart-text";

describe("smart text cleaner", () => {
  it("converts curly quotes and apostrophes", () => {
    const r = cleanTypography("He said \u201Chello\u201D and it\u2019s fine.");
    expect(r.text).toBe('He said "hello" and it\'s fine.');
    expect(r.fixes.some((f) => f.type === "quotes")).toBe(true);
    expect(r.fixes.some((f) => f.type === "apostrophe")).toBe(true);
  });

  it("normalizes dashes and ellipsis", () => {
    const r = cleanTypography("one \u2014 two \u2013 three\u2026");
    expect(r.text).toBe("one -- two - three...");
    expect(r.fixes).toHaveLength(3);
  });

  it("collapses double spaces and trims lines", () => {
    const r = cleanTypography("  hello   world  \n\tsecond line  \n");
    expect(r.text).toBe("hello world\nsecond line");
  });

  it("strips invisible unicode and non-breaking spaces", () => {
    const r = cleanTypography("a\u200Bb\u00A0c\uFEFFd");
    expect(r.text).toBe("ab cd");
    expect(r.fixes.some((f) => f.type === "zeroWidth")).toBe(true);
    expect(r.fixes.some((f) => f.type === "nbsp")).toBe(true);
  });

  it("collapses repeated exclamation/question marks", () => {
    const r = cleanTypography("What!!! Are you sure??");
    expect(r.text).toBe("What!! Are you sure??");
  });

  it("is idempotent — a second pass reports zero fixes", () => {
    const first = cleanTypography("He said \u201Chey\u201D \u2014 ok\u2026");
    const second = cleanTypography(first.text);
    expect(second.fixes).toHaveLength(0);
    expect(second.text).toBe(first.text);
  });

  it("leaves clean text untouched", () => {
    const r = cleanTypography("The quick brown fox jumps over the lazy dog.");
    expect(r.text).toBe("The quick brown fox jumps over the lazy dog.");
    expect(r.fixes).toHaveLength(0);
  });
});
