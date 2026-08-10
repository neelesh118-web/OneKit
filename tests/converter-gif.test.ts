// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeGif } from "../src/core/converter/gif";

function solidPixels(width: number, height: number, r: number, g: number, b: number): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

const gifMagic = (bytes: Uint8Array): string =>
  String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);

describe("converter gif", () => {
  it("encodes a real GIF89a from pixels", () => {
    const gif = encodeGif(solidPixels(8, 8, 200, 40, 40));
    expect(gifMagic(gif)).toBe("GIF89a");
    expect(gif.length).toBeGreaterThan(40);
    // GIF header ends with the logical screen descriptor — version + screen size.
    expect(gif[3]).toBe(0x38);
  });

  it("encodes a larger gradient image without error", () => {
    const { width, height, data } = solidPixels(32, 32, 10, 120, 240);
    for (let i = 0; i < width * height; i++) data[i * 4] = (i * 7) % 256;
    const gif = encodeGif({ width, height, data });
    expect(gifMagic(gif)).toBe("GIF89a");
    expect(gif.length).toBeGreaterThan(100);
  });

  it("rejects empty images honestly", () => {
    expect(() => encodeGif({ width: 0, height: 1, data: new Uint8ClampedArray(0) })).toThrow(/empty image|empty frame/);
    expect(() => encodeGif({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).toThrow(/empty image|empty frame/);
  });
});
