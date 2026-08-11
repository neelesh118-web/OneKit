// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { extractRawPreviewJpeg } from "../src/core/converter/raw-photo";
import { convertFile } from "../src/core/converter/convert";

const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A minimal well-formed JPEG stream: SOI, a filler marker, EOI. */
function jpegStream(fillerByteCount: number): Uint8Array {
  const out = new Uint8Array(4 + fillerByteCount + 2);
  out[0] = 0xff;
  out[1] = 0xd8; // SOI
  out[2] = 0xff;
  out[3] = 0xdb; // some marker (DQT) — content doesn't matter for extraction
  for (let i = 0; i < fillerByteCount; i++) out[4 + i] = (i * 31) & 0xff;
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9; // EOI
  return out;
}

/** A little-endian TIFF/EP header (II*\0 + first-IFD offset), enough to pass byte-order sniffing. */
function tiffHeader(): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = 0x49;
  out[1] = 0x49;
  out[2] = 0x2a;
  out[3] = 0x00;
  out[4] = 0x08;
  out[5] = 0x00;
  out[6] = 0x00;
  out[7] = 0x00;
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("camera RAW detection", () => {
  it("detects TIFF-based RAW kinds by extension over the shared TIFF magic", () => {
    const bytes = concat(tiffHeader(), new Uint8Array(50));
    expect(detectFile(bytes, "photo.cr2").type).toBe("raw-cr2");
    expect(detectFile(bytes, "photo.nef").type).toBe("raw-nef");
    expect(detectFile(bytes, "photo.arw").type).toBe("raw-arw");
    expect(detectFile(bytes, "photo.dng").type).toBe("raw-dng");
    expect(detectFile(bytes, "photo.orf").type).toBe("raw-orf");
    expect(detectFile(bytes, "photo.pef").type).toBe("raw-pef");
    expect(detectFile(bytes, "photo.rw2").type).toBe("raw-rw2");
    expect(detectFile(bytes, "photo.dcr").type).toBe("raw-dcr");
    expect(detectFile(bytes, "photo.erf").type).toBe("raw-erf");
    expect(detectFile(bytes, "photo.3fr").type).toBe("raw-3fr");
    expect(detectFile(bytes, "photo.mos").type).toBe("raw-mos");
  });

  it("a plain .tiff file with the same magic still detects as image-tiff", () => {
    const bytes = concat(tiffHeader(), new Uint8Array(50));
    expect(detectFile(bytes, "picture.tiff").type).toBe("image-tiff");
    expect(detectFromBytes(bytes, "unknown")).toBe("image-tiff");
  });

  it("detects Fujifilm RAF by its own ASCII header, independent of extension", () => {
    const header = toBytes("FUJIFILMCCD-RAW 0201");
    const bytes = concat(header, new Uint8Array(50));
    expect(detectFile(bytes, "photo.raf").type).toBe("raw-raf");
    // Even under an unrelated name, the magic bytes win.
    expect(detectFromBytes(bytes, "unknown")).toBe("raw-raf");
  });

  it("offers the full photo target list for every RAW source", () => {
    for (const type of [
      "raw-cr2", "raw-nef", "raw-arw", "raw-dng", "raw-orf", "raw-pef",
      "raw-rw2", "raw-dcr", "raw-erf", "raw-3fr", "raw-mos", "raw-raf"
    ] as const) {
      const targets = targetsFor(type);
      expect(targets).toContain("image-png");
      expect(targets).toContain("image-jpeg");
      expect(targets).toContain("image-webp");
      expect(targets).toContain("pdf");
      expect(targets).toContain("txt-base64");
    }
  });
});

describe("extractRawPreviewJpeg", () => {
  it("picks the largest embedded JPEG stream (full preview over thumbnail)", () => {
    const thumb = jpegStream(20);
    const preview = jpegStream(400);
    const raw = concat(tiffHeader(), new Uint8Array(30), thumb, new Uint8Array(15), preview, new Uint8Array(10));
    const extracted = extractRawPreviewJpeg(raw);
    expect(extracted.length).toBe(preview.length);
    expect(extracted[0]).toBe(0xff);
    expect(extracted[1]).toBe(0xd8);
    expect(extracted[extracted.length - 2]).toBe(0xff);
    expect(extracted[extracted.length - 1]).toBe(0xd9);
  });

  it("throws an honest error when no embedded preview exists", () => {
    const raw = concat(tiffHeader(), new Uint8Array(100));
    expect(() => extractRawPreviewJpeg(raw)).toThrow(/embedded preview/);
  });

  it("doesn't hang on a large buffer with an unterminated false-positive SOI", () => {
    const junk = new Uint8Array(200_000);
    // Plant a real preview near the start...
    const preview = jpegStream(300);
    junk.set(preview, 100);
    // ...and an SOI-looking triplet near the end with no EOI following.
    junk[199_000] = 0xff;
    junk[199_001] = 0xd8;
    junk[199_002] = 0xff;
    const start = Date.now();
    const extracted = extractRawPreviewJpeg(junk);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(extracted.length).toBe(preview.length);
  });
});

describe("RAW → image via the orchestrator", () => {
  it("converts a CR2's embedded preview to PNG (fake canvas)", async () => {
    const preview = jpegStream(120);
    const raw = concat(tiffHeader(), new Uint8Array(40), preview);
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
        // The bytes handed to decode() must be the extracted JPEG, not the raw file.
        expect(mime).toBe("image/jpeg");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(bytes[0]).toBe(0xff);
        expect(bytes[1]).toBe(0xd8);
        return { width: 32, height: 24, close(): void {} } as unknown as ImageBitmap;
      }
    };
    const result = await convertFile({ bytes: raw, name: "photo.cr2" }, "image-png", { canvas: deps });
    expect(result.name).toBe("photo.png");
    expect(result.mime).toBe("image/png");
  });

  it("converts a RAF's embedded preview to a real PDF page", async () => {
    // A genuine tiny 1×1 JFIF JPEG (real bytes pdf-lib can decode and embed).
    const tinyJpegB64 =
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
    const bin = atob(tinyJpegB64);
    const preview = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) preview[i] = bin.charCodeAt(i);
    const header = toBytes("FUJIFILMCCD-RAW 0201");
    const raw = concat(header, new Uint8Array(40), preview);
    const result = await convertFile({ bytes: raw, name: "shot.raf" }, "pdf");
    expect(result.name).toBe("shot.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(result.bytes[0]).toBe(0x25); // %PDF
  });

  it("gives an honest error for a RAW file with no embedded preview", async () => {
    const raw = concat(tiffHeader(), new Uint8Array(100));
    await expect(convertFile({ bytes: raw, name: "empty.nef" }, "image-png")).rejects.toThrow(
      /embedded preview/
    );
  });
});
