import { describe, expect, it } from "vitest";
import {
  colorConversions,
  hexToRgb,
  loremIpsum,
  randomUsername,
  rgbToHex,
  rgbToHsl,
  uuidV4
} from "../src/core/generators";

describe("generator pack", () => {
  it("produces a valid uuid v4", () => {
    const uuid = uuidV4();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidV4()).not.toBe(uuidV4());
  });

  it("generates lorem ipsum with the requested word count", () => {
    const seeded = () => 0.1;
    const text = loremIpsum(5, seeded);
    expect(text.split(" ")).toHaveLength(5);
    expect(text.charAt(0)).toBe(text.charAt(0).toUpperCase());
    expect(loremIpsum(0, seeded).split(" ")).toHaveLength(1);
    expect(loremIpsum(10000, seeded).split(" ")).toHaveLength(500); // capped
  });

  it("generates usernames in the pattern adjective-noun-number", () => {
    const username = randomUsername(() => 0.2);
    expect(username).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
  });

  it("converts hex to rgb", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("00ff80")).toEqual({ r: 0, g: 255, b: 128 });
    expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#gggggg")).toBeNull();
  });

  it("round-trips rgb to hex", () => {
    expect(rgbToHex(255, 0, 128)).toBe("#ff0080");
    expect(rgbToHex(300, -5, 0)).toBe("#ff0000"); // clamped
  });

  it("converts rgb to hsl", () => {
    expect(rgbToHsl(255, 0, 0)).toBe("0°, 100%, 50%");
    expect(rgbToHsl(0, 0, 0)).toBe("0°, 0%, 0%");
    expect(rgbToHsl(128, 128, 128)).toBe("0°, 0%, 50%");
  });

  it("returns all three formats together", () => {
    const conversions = colorConversions("#ff0000");
    expect(conversions).toEqual({ hex: "#ff0000", rgb: "rgb(255, 0, 0)", hsl: "0°, 100%, 50%" });
    expect(colorConversions("nope")).toBeNull();
  });
});
