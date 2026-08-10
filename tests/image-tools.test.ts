import { describe, expect, it } from "vitest";
import {
  dataUrlMime,
  describeChange,
  isSupportedImageMime,
  outputDimensions
} from "../src/core/image-tools";

describe("dataUrlMime", () => {
  it("extracts the mime from a data URL prefix", () => {
    expect(dataUrlMime("data:image/png;base64,AAAA")).toBe("image/png");
    expect(dataUrlMime("data:image/webp;base64,AAAA")).toBe("image/webp");
    expect(dataUrlMime("data:image/jpeg;base64,AAAA")).toBe("image/jpeg");
  });

  it("returns null for non-data URLs", () => {
    expect(dataUrlMime("https://example.com/x.png")).toBeNull();
    expect(dataUrlMime("")).toBeNull();
  });
});

describe("isSupportedImageMime", () => {
  it("accepts image/* and rejects everything else", () => {
    expect(isSupportedImageMime("image/png")).toBe(true);
    expect(isSupportedImageMime("image/gif")).toBe(true);
    expect(isSupportedImageMime("text/html")).toBe(false);
    expect(isSupportedImageMime(null)).toBe(false);
  });
});

describe("outputDimensions", () => {
  it("keeps dimensions when no max is set", () => {
    expect(outputDimensions(800, 600, null)).toEqual({ width: 800, height: 600 });
    expect(outputDimensions(800, 600, 0)).toEqual({ width: 800, height: 600 });
  });

  it("downscales the longer side to the max, keeping aspect ratio", () => {
    expect(outputDimensions(2000, 1000, 1000)).toEqual({ width: 1000, height: 500 });
    expect(outputDimensions(1000, 2000, 1000)).toEqual({ width: 500, height: 1000 });
    expect(outputDimensions(400, 300, 1000)).toEqual({ width: 400, height: 300 });
  });

  it("never returns zero dimensions", () => {
    expect(outputDimensions(0, 0, 100)).toEqual({ width: 1, height: 1 });
    expect(outputDimensions(-5, 10, null)).toEqual({ width: 1, height: 10 });
  });
});

describe("describeChange", () => {
  it("reports format, dimensions, and original size honestly", () => {
    const out = describeChange(
      { width: 2000, height: 1000, bytes: 2048 * 1024 },
      { width: 1000, height: 500 },
      "jpeg"
    );
    expect(out).toContain("JPEG");
    expect(out).toContain("2000×1000 → 1000×500");
    expect(out).toContain("2048.0 KB");
  });

  it("omits the arrow when dimensions are unchanged", () => {
    const out = describeChange(
      { width: 800, height: 600, bytes: 10 * 1024 },
      { width: 800, height: 600 },
      "png"
    );
    expect(out).toContain("800×600");
    expect(out).not.toContain("→");
  });
});
