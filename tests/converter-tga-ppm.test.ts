// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodePpm, decodeTga, encodePpm, encodeTga, type RgbaImage } from "../src/core/converter/raster";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 7) & 0xff;
    data[i * 4 + 1] = (i * 13) & 0xff;
    data[i * 4 + 2] = (i * 29) & 0xff;
    data[i * 4 + 3] = i % 3 === 0 ? 128 : 255;
  }
  return { width, height, data };
}

describe("TGA codec", () => {
  it("round-trips RGBA pixels through encode/decode", () => {
    const img = gradient(6, 4);
    const tga = encodeTga(img);
    const decoded = decodeTga(tga);
    expect(decoded.width).toBe(6);
    expect(decoded.height).toBe(4);
    expect(Array.from(decoded.data)).toEqual(Array.from(img.data));
  });

  it("writes a valid TGA header (type 2, 32bpp, top-left origin)", () => {
    const tga = encodeTga(gradient(3, 2));
    expect(tga[2]).toBe(2); // uncompressed true-color
    expect(tga[16]).toBe(32); // bpp
    expect(tga[17]! & 0x20).toBe(0x20); // top-left origin bit
    const view = new DataView(tga.buffer);
    expect(view.getUint16(12, true)).toBe(3);
    expect(view.getUint16(14, true)).toBe(2);
  });

  it("decodes RLE-compressed true-color TGA", () => {
    // Hand-build a 4x1 RLE TGA: one run of 4 identical BGRA pixels.
    const header = new Uint8Array(18);
    const view = new DataView(header.buffer);
    header[2] = 10; // RLE true-color
    view.setUint16(12, 4, true);
    view.setUint16(14, 1, true);
    header[16] = 32;
    header[17] = 0x20; // top-left
    const body = new Uint8Array([0x83, 10, 20, 30, 255]); // run header (count 4) + BGRA
    const tga = new Uint8Array(header.length + body.length);
    tga.set(header, 0);
    tga.set(body, header.length);
    const decoded = decodeTga(tga);
    expect(decoded.width).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(decoded.data[i * 4]).toBe(30); // R
      expect(decoded.data[i * 4 + 1]).toBe(20); // G
      expect(decoded.data[i * 4 + 2]).toBe(10); // B
      expect(decoded.data[i * 4 + 3]).toBe(255);
    }
  });

  it("honestly rejects palette/greyscale TGA and truncated files", () => {
    const paletteHeader = new Uint8Array(18);
    const view = new DataView(paletteHeader.buffer);
    paletteHeader[2] = 1; // color-mapped
    view.setUint16(12, 1, true);
    view.setUint16(14, 1, true);
    expect(() => decodeTga(paletteHeader)).toThrow(/palette or greyscale/);
    expect(() => decodeTga(new Uint8Array(5))).toThrow(/too short/);
  });

  it("detects TGA by its v2 footer regardless of extension, else by extension", () => {
    const footer = new TextEncoder().encode("TRUEVISION-XFILE.\0");
    const withFooter = new Uint8Array(30 + footer.length);
    withFooter.set(footer, 30);
    expect(detectFromBytes(withFooter, "unknown")).toBe("image-tga");
    const plain = new Uint8Array(20);
    expect(detectFile(plain, "photo.tga").type).toBe("image-tga");
  });
});

describe("PPM codec", () => {
  it("round-trips through binary P6 (alpha composited on white)", () => {
    const img = gradient(5, 3);
    const ppm = encodePpm(img);
    expect(new TextDecoder().decode(ppm.slice(0, 2))).toBe("P6");
    const decoded = decodePpm(ppm);
    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(3);
    // Fully opaque pixels round-trip exactly; alpha is composited on white
    // for translucent ones, so only spot-check an opaque pixel (index 1,
    // since gradient() makes every third pixel — index 0 included — 50%
    // translucent).
    expect(decoded.data[4]).toBe(img.data[4]);
    expect(decoded.data[5]).toBe(img.data[5]);
    expect(decoded.data[6]).toBe(img.data[6]);
    expect(decoded.data[7]).toBe(255); // PPM has no alpha channel
  });

  it("decodes ASCII P3", () => {
    const ppm = new TextEncoder().encode("P3\n# a comment\n2 1\n255\n255 0 0 0 255 0\n");
    const decoded = decodePpm(ppm);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(decoded.data.slice(4, 8))).toEqual([0, 255, 0, 255]);
  });

  it("honestly rejects a non-PPM header and an unsupported maxval", () => {
    expect(() => decodePpm(new TextEncoder().encode("XX\n1 1\n255\n"))).toThrow(/P3 or P6/);
    expect(() => decodePpm(new TextEncoder().encode("P6\n1 1\n65535\n"))).toThrow(/8-bit/);
  });

  it("detects PPM by its P6/P3 magic", () => {
    expect(detectFromBytes(new TextEncoder().encode("P6\n1 1\n255\n\0\0\0"), "unknown")).toBe("image-ppm");
    expect(detectFile(new TextEncoder().encode("P3\n1 1\n255\n0 0 0\n"), "x.ppm").type).toBe("image-ppm");
  });
});

describe("TGA/PPM via the orchestrator", () => {
  it("offers the full raster + PDF target list for both new sources", () => {
    for (const type of ["image-tga", "image-ppm"] as const) {
      const targets = targetsFor(type);
      expect(targets).toContain("image-png");
      expect(targets).toContain("image-jpeg");
      expect(targets).toContain("pdf");
      expect(targets).toContain("txt-base64");
    }
    // And every existing raster source can now reach TGA/PPM too.
    expect(targetsFor("image-png")).toContain("image-tga");
    expect(targetsFor("image-png")).toContain("image-ppm");
  });

  it("converts a TGA source to PNG via the fake canvas (decoded through BMP)", async () => {
    const tga = encodeTga(gradient(4, 4));
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
        expect(mime).toBe("image/bmp"); // TGA is re-wrapped as BMP for the canvas
        return { width: 4, height: 4, close(): void {} } as unknown as ImageBitmap;
      }
    };
    const result = await convertFile({ bytes: tga, name: "photo.tga" }, "image-png", { canvas: deps });
    expect(result.name).toBe("photo.png");
    expect(result.mime).toBe("image/png");
  });

  it("converts a PNG source to a real TGA and PPM (fake canvas encode path)", async () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
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
    const tga = await convertFile({ bytes: png, name: "logo.png" }, "image-tga", { canvas: deps });
    expect(tga.name).toBe("logo.tga");
    expect(tga.bytes[2]).toBe(2); // TGA uncompressed true-color
    const ppm = await convertFile({ bytes: png, name: "logo.png" }, "image-ppm", { canvas: deps });
    expect(ppm.name).toBe("logo.ppm");
    expect(new TextDecoder().decode(ppm.bytes.slice(0, 2))).toBe("P6");
  });
});
