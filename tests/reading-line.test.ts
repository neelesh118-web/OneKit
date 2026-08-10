import { describe, expect, it } from "vitest";
import { normalizeThickness, readingLineCss } from "../src/core/reading-line";

describe("reading line", () => {
  it("clamps thickness into 1-8", () => {
    expect(normalizeThickness(2)).toBe(2);
    expect(normalizeThickness(0)).toBe(1);
    expect(normalizeThickness(99)).toBe(8);
    expect(normalizeThickness(Number.NaN)).toBe(2);
  });

  it("builds overlay css with height and color", () => {
    const css = readingLineCss({ thickness: 3, color: "#123456" });
    expect(css).toContain("height:3px");
    expect(css).toContain("background:#123456");
    expect(css).toContain("position:fixed");
    expect(css).toContain("pointer-events:none");
  });

  it("defaults sensibly", () => {
    const css = readingLineCss();
    expect(css).toContain("height:2px");
    expect(css).toContain("background:#f59e0b");
  });
});
