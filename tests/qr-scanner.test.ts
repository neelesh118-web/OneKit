import { describe, expect, it } from "vitest";
import {
  decodeQrFromRgba,
  summarizeScan,
  type QrScanResult
} from "../src/core/qr-scanner";

describe("qr scanner", () => {
  it("returns invalid-image for a too-small buffer", () => {
    const result = decodeQrFromRgba(new Uint8ClampedArray(4), 10, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid-image");
  });

  it("returns invalid-image for zero dimensions", () => {
    const result = decodeQrFromRgba(new Uint8ClampedArray(0), 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid-image");
  });

  it("returns no-qr for a solid (non-QR) buffer", () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const result = decodeQrFromRgba(data, width, height);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no-qr");
  });

  it("classifies URL vs text payloads in the summary", () => {
    const urlResult: QrScanResult = { text: "https://example.com", byteLength: 19, isUrl: true };
    const textResult: QrScanResult = { text: "hello world", byteLength: 11, isUrl: false };
    expect(summarizeScan(urlResult)).toContain("URL");
    expect(summarizeScan(textResult)).toContain("11 bytes of text");
  });

  it("truncates long payloads in the summary", () => {
    const long = "x".repeat(100);
    const result: QrScanResult = { text: long, byteLength: 100, isUrl: false };
    const summary = summarizeScan(result);
    expect(summary.length).toBeLessThan(100);
    expect(summary).toContain("…");
  });
});
