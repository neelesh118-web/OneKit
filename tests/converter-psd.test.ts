// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodePsd, encodePsd } from "../src/core/converter/psd";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";
import type { RgbaImage } from "../src/core/converter/raster";

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 7) & 0xff;
    data[i * 4 + 1] = (i * 13) & 0xff;
    data[i * 4 + 2] = (i * 29) & 0xff;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Builds a raw (uncompressed) RGB(+A) PSD by hand, for decode-side tests. */
function buildPsd(opts: {
  width: number;
  height: number;
  channels: number;
  colorMode: number;
  depth?: number;
  version?: number;
  planes: Uint8Array[]; // one Uint8Array of width*height bytes per channel
}): Uint8Array {
  const { width, height, channels, colorMode, planes } = opts;
  const depth = opts.depth ?? 8;
  const version = opts.version ?? 1;
  const planeSize = width * height;
  const out = new Uint8Array(26 + 4 + 4 + 4 + 2 + planeSize * channels);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("8BPS"), 0);
  view.setUint16(4, version, false);
  view.setUint16(12, channels, false);
  view.setUint32(14, height, false);
  view.setUint32(18, width, false);
  view.setUint16(22, depth, false);
  view.setUint16(24, colorMode, false);
  view.setUint32(26, 0, false);
  view.setUint32(30, 0, false);
  view.setUint32(34, 0, false);
  view.setUint16(38, 0, false); // raw
  let pos = 40;
  for (let c = 0; c < channels; c++) {
    out.set(planes[c] ?? new Uint8Array(planeSize), pos);
    pos += planeSize;
  }
  return out;
}

describe("PSD codec", () => {
  it("round-trips RGBA pixels through encode/decode", () => {
    const img = gradient(5, 4);
    const psd = encodePsd(img);
    expect(String.fromCharCode(...psd.slice(0, 4))).toBe("8BPS");
    const decoded = decodePsd(psd);
    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(4);
    expect(Array.from(decoded.data)).toEqual(Array.from(img.data));
  });

  it("writes a minimal, spec-shaped header (RGB, 8-bit, 4 channels, no layers, raw)", () => {
    const psd = encodePsd(gradient(2, 2));
    const view = new DataView(psd.buffer);
    expect(view.getUint16(4, false)).toBe(1); // version
    expect(view.getUint16(12, false)).toBe(4); // channels
    expect(view.getUint16(22, false)).toBe(8); // depth
    expect(view.getUint16(24, false)).toBe(3); // RGB
    expect(view.getUint32(26, false)).toBe(0); // empty Color Mode Data
    expect(view.getUint32(30, false)).toBe(0); // empty Image Resources
    expect(view.getUint32(34, false)).toBe(0); // empty Layer and Mask Info
    expect(view.getUint16(38, false)).toBe(0); // raw compression
  });

  it("decodes a hand-built raw RGB PSD (3 channels, no alpha)", () => {
    const width = 2;
    const height = 2;
    const r = new Uint8Array([10, 20, 30, 40]);
    const g = new Uint8Array([50, 60, 70, 80]);
    const b = new Uint8Array([90, 100, 110, 120]);
    const psd = buildPsd({ width, height, channels: 3, colorMode: 3, planes: [r, g, b] });
    const decoded = decodePsd(psd);
    expect(decoded.data[0]).toBe(10);
    expect(decoded.data[1]).toBe(50);
    expect(decoded.data[2]).toBe(90);
    expect(decoded.data[3]).toBe(255); // no alpha channel present → opaque
    expect(decoded.data[4]).toBe(20);
  });

  it("decodes a hand-built raw Grayscale PSD with alpha", () => {
    const grey = new Uint8Array([0, 128, 255, 64]);
    const alpha = new Uint8Array([255, 200, 100, 0]);
    const psd = buildPsd({ width: 2, height: 2, channels: 2, colorMode: 1, planes: [grey, alpha] });
    const decoded = decodePsd(psd);
    expect(decoded.data[0]).toBe(0);
    expect(decoded.data[1]).toBe(0);
    expect(decoded.data[2]).toBe(0);
    expect(decoded.data[3]).toBe(255);
    expect(decoded.data[4]).toBe(128); // second pixel grey
    expect(decoded.data[7]).toBe(200); // second pixel alpha
  });

  it("decodes RLE (PackBits)-compressed image data", () => {
    // 1 row per channel, 4-pixel literal run: header byte (n-1 for n literals) + bytes.
    const width = 4;
    const height = 1;
    const rPacked = new Uint8Array([3, 1, 2, 3, 4]); // 4 literal bytes
    const gPacked = new Uint8Array([0x83, 9]); // run of 4 identical bytes (value 9)
    const out = new Uint8Array(26 + 4 + 4 + 4 + 2 + 2 * 2 * 2 + rPacked.length + gPacked.length);
    const view = new DataView(out.buffer);
    out.set(new TextEncoder().encode("8BPS"), 0);
    view.setUint16(4, 1, false);
    view.setUint16(12, 2, false); // 2 channels: treat as Grayscale + alpha
    view.setUint32(14, height, false);
    view.setUint32(18, width, false);
    view.setUint16(22, 8, false);
    view.setUint16(24, 1, false); // grayscale
    view.setUint32(26, 0, false);
    view.setUint32(30, 0, false);
    view.setUint32(34, 0, false);
    view.setUint16(38, 1, false); // RLE
    let pos = 40;
    view.setUint16(pos, rPacked.length, false);
    pos += 2;
    view.setUint16(pos, gPacked.length, false);
    pos += 2;
    out.set(rPacked, pos);
    pos += rPacked.length;
    out.set(gPacked, pos);
    const decoded = decodePsd(out);
    expect(decoded.width).toBe(4);
    expect(Array.from(decoded.data.filter((_, i) => i % 4 === 0))).toEqual([1, 2, 3, 4]); // grey channel
    expect(Array.from(decoded.data.filter((_, i) => i % 4 === 3))).toEqual([9, 9, 9, 9]); // alpha (run-length)
  });

  it("honestly rejects non-PSD bytes, ZIP compression, and unsupported colour modes/depth", () => {
    expect(() => decodePsd(new Uint8Array(30))).toThrow(/8BPS signature/);
    // PSB (version 2) is now a supported source — round-17 tests decode a
    // correctly-built large-document fixture end-to-end.
    const cmyk = buildPsd({ width: 1, height: 1, channels: 4, colorMode: 4, planes: [] });
    expect(() => decodePsd(cmyk)).toThrow(/RGB and Grayscale/);
    const depth16 = buildPsd({ width: 1, height: 1, channels: 3, colorMode: 3, depth: 16, planes: [] });
    expect(() => decodePsd(depth16)).toThrow(/8-bit-per-channel/);
    const zip = buildPsd({ width: 1, height: 1, channels: 3, colorMode: 3, planes: [new Uint8Array(1)] });
    zip[38] = 0;
    zip[39] = 2; // ZIP compression code, big-endian uint16 = 2
    expect(() => decodePsd(zip)).toThrow(/ZIP-compressed/);
  });
});

describe("PSD detection and matrix", () => {
  it("detects PSD by its 8BPS magic regardless of extension", () => {
    const psd = encodePsd(gradient(1, 1));
    expect(detectFromBytes(psd, "unknown")).toBe("image-psd");
    expect(detectFile(psd, "artwork.psd").type).toBe("image-psd");
  });

  it("offers the full raster + PDF target list, and every raster source can reach PSD", () => {
    const targets = targetsFor("image-psd");
    expect(targets).toContain("image-png");
    expect(targets).toContain("image-jpeg");
    expect(targets).toContain("pdf");
    expect(targets).toContain("txt-base64");
    expect(targetsFor("image-png")).toContain("image-psd");
  });
});

describe("PSD via the orchestrator", () => {
  it("converts a PSD source to PNG via the fake canvas (decoded through BMP)", async () => {
    const psd = encodePsd(gradient(4, 4));
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])]);
    const ctx = { drawImage(): void {}, translate(): void {}, rotate(): void {}, scale(): void {} };
    let w = 0;
    let h = 0;
    const deps = {
      canvasFactory: () =>
        ({
          get width() { return w; },
          set width(v: number) { w = v; },
          get height() { return h; },
          set height(v: number) { h = v; },
          getContext: (k: string) => (k === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void, mime?: string): void {
            cb(mime === "image/png" ? pngBlob : null);
          }
        }) as unknown as HTMLCanvasElement,
      decode: async (blob: Blob, mime: string) => {
        expect(mime).toBe("image/bmp");
        return { width: 4, height: 4, close(): void {} } as unknown as ImageBitmap;
      }
    };
    const result = await convertFile({ bytes: psd, name: "artwork.psd" }, "image-png", { canvas: deps });
    expect(result.name).toBe("artwork.png");
    expect(result.mime).toBe("image/png");
  });

  it("converts a PNG source to a real, re-decodable PSD", async () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(150);
    const ctx = {
      drawImage(): void {},
      translate(): void {},
      rotate(): void {},
      scale(): void {},
      getImageData: () => ({ data: rgba })
    };
    let w = 0;
    let h = 0;
    const deps = {
      canvasFactory: () =>
        ({
          get width() { return w; },
          set width(v: number) { w = v; },
          get height() { return h; },
          set height(v: number) { h = v; },
          getContext: (k: string) => (k === "2d" ? ctx : null)
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 4, height: 4, close(): void {} }) as unknown as ImageBitmap
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    const result = await convertFile({ bytes: png, name: "logo.png" }, "image-psd", { canvas: deps });
    expect(result.name).toBe("logo.psd");
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe("8BPS");
    // Genuinely re-decodable, not a stub — round-trips back to the same pixels.
    const back = decodePsd(result.bytes);
    expect(back.width).toBe(4);
    expect(back.data[0]).toBe(150);
  });
});
