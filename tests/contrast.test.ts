// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkContrast, contrastRatio, hexToRgb } from "../src/core/contrast";

describe("hexToRgb", () => {
  it("parses 6-digit hex with or without #", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });
  it("rejects bad input", () => {
    expect(hexToRgb("red")).toBeNull();
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("#gggggg")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("black on white is 21:1", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });
  it("same color is 1:1", () => {
    expect(contrastRatio({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBeCloseTo(1, 5);
  });
});

describe("checkContrast", () => {
  it("passes AA normal text for black/white", () => {
    const r = checkContrast("#000000", "#ffffff");
    if ("error" in r) throw new Error(r.error);
    expect(r.normalText.aa).toBe(true);
    expect(r.normalText.aaa).toBe(true);
  });
  it("fails AA for low contrast", () => {
    const r = checkContrast("#777777", "#ffffff");
    if ("error" in r) throw new Error(r.error);
    expect(r.ratio).toBeLessThan(4.5);
    expect(r.normalText.aa).toBe(false);
  });
  it("large text needs less contrast", () => {
    // #858585 on white ≈ 3.6:1 — passes AA large text, fails AA normal.
    const r = checkContrast("#858585", "#ffffff");
    if ("error" in r) throw new Error(r.error);
    expect(r.largeText.aa).toBe(true);
    expect(r.normalText.aa).toBe(false);
  });
  it("reports bad colors", () => {
    const r = checkContrast("nope", "#ffffff");
    expect("error" in r).toBe(true);
  });
});
