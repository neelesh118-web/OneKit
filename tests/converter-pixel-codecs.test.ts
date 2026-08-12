import { describe, it, expect } from "vitest";
import { decodeFarbfeld, decodePcx, decodeQoi, encodeFarbfeld, encodePcx, encodeQoi, isPcx } from "../src/core/converter/pixel-codecs";
import type { RgbaImage } from "../src/core/converter/raster";

function makeImage(w: number, h: number, seed: (x: number, y: number) => [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = seed(x, y);
      const d = (y * w + x) * 4;
      data[d] = r; data[d + 1] = g; data[d + 2] = b; data[d + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

const gradient = (x: number, y: number): [number, number, number, number] => [
  (x * 7) & 0xff,
  (y * 13) & 0xff,
  (x + y) & 0xff,
  255
];

const withAlpha = (x: number, y: number): [number, number, number, number] => [
  x & 0xff,
  y & 0xff,
  128,
  0x80 + ((x + y) & 0x7f)
];

const flat = (_x: number, _y: number): [number, number, number, number] => [10, 20, 30, 255];

describe("QOI", () => {
  it("round-trips a gradient with every opcode exercised", () => {
    const img = makeImage(33, 29, gradient);
    const decoded = decodeQoi(encodeQoi(img));
    expect(decoded.width).toBe(33);
    expect(decoded.height).toBe(29);
    expect([...decoded.data]).toEqual([...img.data]);
  });

  it("round-trips alpha values", () => {
    const img = makeImage(17, 11, withAlpha);
    const decoded = decodeQoi(encodeQoi(img));
    expect([...decoded.data]).toEqual([...img.data]);
  });

  it("round-trips flat runs (RUN chunks)", () => {
    const img = makeImage(300, 1, flat);
    const decoded = decodeQoi(encodeQoi(img));
    expect([...decoded.data]).toEqual([...img.data]);
  });

  it("decodes an RGB-channels (channels=3) file", () => {
    // Hand-built QOI: header + one RGBA pixel + end marker.
    const bytes = new Uint8Array(14 + 5 + 8);
    const v = new DataView(bytes.buffer);
    v.setUint32(0, 0x716f6966, false); // "qoif"
    v.setUint32(4, 1, false);
    v.setUint32(8, 1, false);
    bytes[12] = 3; // RGB
    bytes[13] = 0;
    bytes[14] = 0xfe; bytes[15] = 0x12; bytes[16] = 0x34; bytes[17] = 0x56;
    for (let i = 0; i < 8; i++) bytes[18 + i] = i === 7 ? 1 : 0;
    const decoded = decodeQoi(bytes);
    expect(decoded.width).toBe(1);
    expect(decoded.data[0]).toBe(0x12);
    expect(decoded.data[1]).toBe(0x34);
    expect(decoded.data[2]).toBe(0x56);
    expect(decoded.data[3]).toBe(255);
  });

  it("rejects a truncated pixel stream", () => {
    const bytes = new Uint8Array(14);
    const v = new DataView(bytes.buffer);
    v.setUint32(0, 0x716f6966, false);
    v.setUint32(4, 10, false);
    v.setUint32(8, 10, false);
    bytes[12] = 4;
    expect(() => decodeQoi(bytes)).toThrow();
  });

  it("rejects a missing magic", () => {
    expect(() => decodeQoi(new Uint8Array(20))).toThrow(/magic|short|valid/i);
  });
});

describe("Farbfeld", () => {
  it("round-trips pixels through 16-bit channels", () => {
    const img = makeImage(21, 15, withAlpha);
    const decoded = decodeFarbfeld(encodeFarbfeld(img));
    expect(decoded.width).toBe(21);
    expect(decoded.height).toBe(15);
    expect([...decoded.data]).toEqual([...img.data]);
  });

  it("rejects a wrong magic", () => {
    expect(() => decodeFarbfeld(new Uint8Array(32))).toThrow(/magic|Farbfeld/i);
  });

  it("rejects truncated pixel data", () => {
    const img = makeImage(4, 4, gradient);
    const bytes = encodeFarbfeld(img);
    expect(() => decodeFarbfeld(bytes.slice(0, 20))).toThrow();
  });
});

describe("PCX", () => {
  it("recognizes the ZSoft header", () => {
    expect(isPcx(encodePcx(makeImage(8, 8, flat)))).toBe(true);
    expect(isPcx(new Uint8Array(128))).toBe(false);
  });

  it("round-trips a truecolor image (RLE intact)", () => {
    const img = makeImage(64, 48, gradient);
    const decoded = decodePcx(encodePcx(img));
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(48);
    expect([...decoded.data]).toEqual([...img.data]);
  });

  it("round-trips a flat image with long runs", () => {
    const img = makeImage(300, 200, flat);
    const decoded = decodePcx(encodePcx(img));
    expect([...decoded.data]).toEqual([...img.data]);
  });

  it("decodes an 8-bit palette PCX", () => {
    // Build a tiny 2x2 8-bit palette PCX by hand: header + 4 RLE bytes + palette.
    const header = new Uint8Array(128);
    header[0] = 0x0a; header[1] = 5; header[2] = 1; header[3] = 8;
    header[8] = 1; // xmax = 1 (2 px wide)
    header[10] = 1; // ymax = 1
    header[65] = 1; // one color plane
    header[66] = 2; // bytes per line
    const body = [0x00, 0x01, 0x00, 0x01]; // row 0: pixels 0,1 · row 1: pixels 0,1
    const palette = new Uint8Array(768);
    palette[0] = 255; palette[1] = 0; palette[2] = 0; // color 0 = red
    palette[3] = 0; palette[4] = 255; palette[5] = 0; // color 1 = green
    const bytes = new Uint8Array(128 + body.length + 1 + 768);
    bytes.set(header, 0);
    bytes.set(body, 128);
    bytes[128 + body.length] = 0x0c; // palette marker
    bytes.set(palette, 129 + body.length);
    const decoded = decodePcx(bytes);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.data[0]).toBe(255);
    expect(decoded.data[1]).toBe(0);
    expect(decoded.data[4]).toBe(0);
    expect(decoded.data[5]).toBe(255);
    expect(decoded.data[3]).toBe(255);
  });

  it("rejects a non-PCX buffer", () => {
    expect(() => decodePcx(new Uint8Array(140))).toThrow(/PCX/);
  });
});
