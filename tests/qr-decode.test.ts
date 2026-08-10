// @vitest-environment node
import { describe, expect, it } from "vitest";
import qrcode from "qrcode-generator";
import { decodeQrImage, MIN_QR_PIXELS } from "../src/core/qr-decode";
import { parseOtpauthUri } from "../src/core/totp";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const TOTP_URI =
  "otpauth://totp/GitHub:alice?secret=" + RFC_SECRET + "&issuer=GitHub&digits=6&period=30";

/** Renders a QR into raw RGBA pixels (no canvas needed) using the bundled
 * qrcode-generator, scaled to `scale` px per module with a `quiet`-module
 * quiet zone — the same pixels jsQR would see from a real screenshot. */
function qrPixels(
  text: string,
  scale = 6,
  quiet = 4
): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const size = (modules + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  data.fill(255); // white background, opaque
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!qr.isDark(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (quiet + row) * scale + dy;
          const x = (quiet + col) * scale + dx;
          const idx = (y * size + x) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }
      }
    }
  }
  return { data, width: size, height: size };
}

describe("QR decode round-trip", () => {
  it("decodes a TOTP otpauth:// QR back to the exact URI", () => {
    const { data, width, height } = qrPixels(TOTP_URI);
    const decoded = decodeQrImage(data, width, height);
    expect(decoded).toBe(TOTP_URI);
  });

  it("decoded URI feeds the existing otpauth parser", () => {
    const { data, width, height } = qrPixels(TOTP_URI);
    const decoded = decodeQrImage(data, width, height)!;
    const parsed = parseOtpauthUri(decoded);
    expect(parsed.secret).toBe(RFC_SECRET);
    expect(parsed.label).toBe("GitHub:alice");
    expect(parsed.issuer).toBe("GitHub");
  });

  it("decodes a plain-text QR (so the controller can refuse non-TOTP honestly)", () => {
    const { data, width, height } = qrPixels("hello world");
    expect(decodeQrImage(data, width, height)).toBe("hello world");
    expect(() => parseOtpauthUri("hello world")).toThrow(/otpauth/);
  });
});

describe("QR decode error handling", () => {
  it("returns null for a blank image", () => {
    const size = 200;
    const blank = new Uint8ClampedArray(size * size * 4).fill(255);
    expect(decodeQrImage(blank, size, size)).toBeNull();
  });

  it("returns null for a flat-color image (no finder patterns)", () => {
    const size = 200;
    const flat = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      flat[i * 4] = 200;
      flat[i * 4 + 1] = 100;
      flat[i * 4 + 2] = 50;
      flat[i * 4 + 3] = 255;
    }
    expect(decodeQrImage(flat, size, size)).toBeNull();
  });

  it("returns null when the image is too small to hold a QR", () => {
    const tiny = new Uint8ClampedArray(MIN_QR_PIXELS * MIN_QR_PIXELS * 4).fill(0);
    expect(decodeQrImage(tiny, MIN_QR_PIXELS - 1, MIN_QR_PIXELS - 1)).toBeNull();
  });
});
