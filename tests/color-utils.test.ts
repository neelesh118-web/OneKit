import { describe, expect, it } from "vitest";
import { hexToRgb, rgbCssString, rgbToHex, rgbToHsl } from "../src/core/color-utils";

describe("hexToRgb", () => {
  it("parses 6-digit and 3-digit hex", () => {
    expect(hexToRgb("#ff8040")).toEqual({ r: 255, g: 128, b: 64 });
    expect(hexToRgb("#f80")).toEqual({ r: 255, g: 136, b: 0 });
    expect(hexToRgb("ff8040")).toEqual({ r: 255, g: 128, b: 64 });
  });

  it("rejects malformed input", () => {
    expect(hexToRgb("red")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("formats and clamps channels", () => {
    expect(rgbToHex(255, 128, 64)).toBe("#ff8040");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
    expect(rgbToHex(-5, 300, 10)).toBe("#00ff0a");
  });
});

describe("rgbToHsl", () => {
  it("converts known colors", () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 });
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
  });
});

describe("rgbCssString", () => {
  it("formats a CSS color string", () => {
    expect(rgbCssString({ r: 1, g: 2, b: 3 })).toBe("rgb(1, 2, 3)");
  });
});
