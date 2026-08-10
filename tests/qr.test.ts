import { describe, expect, it } from "vitest";
import { qrDataUrl, QR_MAX_INPUT_CHARS } from "../src/core/qr";

describe("qr", () => {
  it("generates an SVG data URL for a url", () => {
    const { dataUrl, sizePx, modules } = qrDataUrl("https://example.com");
    expect(dataUrl.startsWith("data:image/svg+xml")).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(200);
    expect(modules).toBeGreaterThan(20);
    expect(sizePx).toBeGreaterThan(0);
  });

  it("throws on empty input", () => {
    expect(() => qrDataUrl("   ")).toThrow(/Nothing to encode/);
  });

  it("throws on oversized input", () => {
    expect(() => qrDataUrl("x".repeat(QR_MAX_INPUT_CHARS + 1))).toThrow(/too long/i);
  });
});
