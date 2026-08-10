// @vitest-environment node
import { describe, expect, it } from "vitest";
import { barcodeDataUrl, barcodePatterns, barcodeSvg, barcodeSymbol, encode128 } from "../src/core/barcode";

describe("encode128", () => {
  it("starts with the Code B start marker", () => {
    expect(encode128("HELLO")[0]).toBe(104);
  });
  it("encodes ASCII characters", () => {
    const values = encode128("HELLO");
    expect(values.length).toBeGreaterThanOrEqual(6);
  });
  it("rejects non-ASCII", () => {
    expect(() => encode128("héllo")).toThrow(/ASCII/);
    expect(() => encode128("")).toThrow(/Nothing/);
  });
});

describe("barcodeSymbol", () => {
  it("appends a valid checksum", () => {
    const { values, checksum } = barcodeSymbol("TEST1234");
    expect(values[values.length - 1]).toBe(checksum);
    expect(checksum).toBeGreaterThanOrEqual(0);
    expect(checksum).toBeLessThan(103);
  });
});

describe("barcodePatterns", () => {
  it("ends with the stop pattern", () => {
    const patterns = barcodePatterns("ABC123");
    expect(patterns[patterns.length - 1]).toBe("2331112");
  });
});

describe("barcodeSvg / barcodeDataUrl", () => {
  it("renders a valid SVG", () => {
    const { svg, widthPx, heightPx } = barcodeSvg("ONKIT-77", 60);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<rect");
    expect(widthPx).toBeGreaterThan(50);
    expect(heightPx).toBe(60);
  });
  it("produces a data URL", () => {
    expect(barcodeDataUrl("42")).toContain("data:image/svg+xml");
  });
});
