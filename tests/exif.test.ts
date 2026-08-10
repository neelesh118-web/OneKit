import { describe, expect, it } from "vitest";
import { readImageInfo, readImageInfoFromFile } from "../src/core/exif";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

describe("exif viewer", () => {
  it("reads PNG dimensions and format", () => {
    const png = new Uint8Array(32);
    png.set(hexToBytes("89504e470d0a1a0a"), 0);
    // IHDR width/height at offsets 16/20
    const view = new DataView(png.buffer);
    view.setUint32(16, 640);
    view.setUint32(20, 480);
    const info = readImageInfo(png);
    expect(info.format).toBe("PNG");
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
  });

  it("reads GIF dimensions", () => {
    const gif = new Uint8Array(10);
    gif.set(hexToBytes("474946383961"), 0);
    const view = new DataView(gif.buffer);
    view.setUint16(6, 320, true);
    view.setUint16(8, 200, true);
    const info = readImageInfo(gif);
    expect(info.format).toBe("GIF");
    expect(info.width).toBe(320);
    expect(info.height).toBe(200);
  });

  it("reads JPEG dimensions from SOF markers", () => {
    // SOI + SOF0 (0xC0): length 11, precision 8, height 0x012c (300), width 0x0190 (400)
    const bytes = hexToBytes("ffd8ffc0000b08012c0190012211000301");
    const info = readImageInfo(bytes);
    expect(info.format).toBe("JPEG");
    expect(info.height).toBe(300);
    expect(info.width).toBe(400);
  });

  it("returns Unknown with zero dimensions for garbage", () => {
    const info = readImageInfo(new Uint8Array(16).fill(7));
    expect(info.format).toBe("Unknown");
    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
  });

  it("parses EXIF DateTimeOriginal from a minimal JPEG", () => {
    // Build a JPEG: SOI, APP1 (Exif), SOF0, EOI.
    const exifHeader = hexToBytes("457869660000"); // "Exif\0\0"
    const tiff = new Uint8Array(128);
    // Little-endian TIFF header
    tiff[0] = 0x49;
    tiff[1] = 0x49;
    tiff.set([0x2a, 0x00], 2); // magic 42
    tiff.set([0x08, 0x00, 0x00, 0x00], 4); // IFD0 at offset 8
    // IFD0: 1 entry (12 bytes) + next-IFD pointer
    const ifd = 8;
    tiff.set([0x01, 0x00], ifd); // 1 entry
    // Entry: tag 0x0132 (DateTime), type 2 (ASCII), count 20
    tiff.set([0x32, 0x01], ifd + 2);
    tiff.set([0x02, 0x00], ifd + 4);
    tiff.set([0x14, 0x00, 0x00, 0x00], ifd + 6);
    // Value pointer (TIFF-relative) -> 40
    tiff.set([0x28, 0x00, 0x00, 0x00], ifd + 10);
    tiff.set([0x00, 0x00, 0x00, 0x00], ifd + 14); // next IFD = 0
    const date = "2024:05:06 07:08:09\0";
    for (let i = 0; i < date.length; i++) tiff[40 + i] = date.charCodeAt(i);

    const app1 = new Uint8Array(2 + 2 + exifHeader.length + tiff.length);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    const segLen = app1.length - 2;
    app1[2] = (segLen >> 8) & 0xff;
    app1[3] = segLen & 0xff;
    app1.set(exifHeader, 4);
    app1.set(tiff, 4 + exifHeader.length);

    const jpeg = new Uint8Array(4 + app1.length + 4);
    jpeg.set([0xff, 0xd8], 0);
    jpeg.set(app1, 2);
    jpeg.set([0xff, 0xd9], 2 + app1.length);

    const info = readImageInfo(jpeg);
    expect(info.format).toBe("JPEG");
    expect(info.exif.DateTime).toBe("2024:05:06 07:08:09");
  });

  it("reads info from a Blob", async () => {
    const png = new Uint8Array(32);
    png.set(hexToBytes("89504e470d0a1a0a"), 0);
    const view = new DataView(png.buffer);
    view.setUint32(16, 100);
    view.setUint32(20, 50);
    const blob = new Blob([png], { type: "image/png" });
    const info = await readImageInfoFromFile(blob);
    expect(info.format).toBe("PNG");
    expect(info.width).toBe(100);
    expect(info.height).toBe(50);
  });
});
