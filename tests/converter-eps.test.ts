// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate/browser";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { extractEpsPreviewTiff } from "../src/core/converter/eps";
import { convertFile } from "../src/core/converter/convert";

const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

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

/** Builds a minimal but fully decodable single-strip uncompressed RGB TIFF. */
function tinyTiff(width: number, height: number): Uint8Array {
  const samples = 3;
  const body = new Uint8Array(width * height * samples);
  for (let i = 0; i < width * height; i++) {
    body[i * 3] = 10;
    body[i * 3 + 1] = 20;
    body[i * 3 + 2] = 30;
  }
  const tags: [number, number, number[]][] = [
    [256, 3, [width]],
    [257, 3, [height]],
    [258, 3, [8, 8, 8]],
    [259, 3, [1]],
    [262, 3, [2]],
    [273, 4, [0]], // StripOffsets — patched below
    [277, 3, [samples]],
    [278, 4, [height]],
    [279, 4, [body.length]],
    [284, 3, [1]]
  ];
  const ifdSize = 2 + tags.length * 12 + 4;
  const head = new Uint8Array(8 + ifdSize);
  const view = new DataView(head.buffer);
  view.setUint16(0, 0x4949, true); // "II"
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  const extras: { at: number; bytes: Uint8Array }[] = [];
  let extraOffset = 8 + ifdSize;
  const stripEntryAt: number[] = [];
  tags.forEach(([tag, type, values], i) => {
    const at = 10 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, values.length, true);
    if (tag === 273) {
      stripEntryAt.push(at);
      return;
    }
    const size = type === 3 ? 2 : 4;
    if (size * values.length <= 4) {
      values.forEach((v, k) => {
        if (type === 3) view.setUint16(at + 8 + k * 2, v, true);
        else view.setUint32(at + 8 + k * 4, v, true);
      });
    } else {
      const buf = new Uint8Array(size * values.length);
      const bufView = new DataView(buf.buffer);
      values.forEach((v, k) => {
        if (type === 3) bufView.setUint16(k * 2, v, true);
        else bufView.setUint32(k * 4, v, true);
      });
      view.setUint32(at + 8, extraOffset, true);
      extras.push({ at: extraOffset, bytes: buf });
      extraOffset += buf.length;
    }
  });
  const dataOffset = extraOffset;
  for (const at of stripEntryAt) view.setUint32(at + 8, dataOffset, true);
  const out = new Uint8Array(dataOffset + body.length);
  out.set(head, 0);
  for (const extra of extras) out.set(extra.bytes, extra.at);
  out.set(body, dataOffset);
  return out;
}

/** Wraps a TIFF preview in the "DOS EPS" binary header (C5 D0 D3 C6 + section offsets). */
function binaryEps(tiff: Uint8Array, opts: { psLength?: number } = {}): Uint8Array {
  const psLength = opts.psLength ?? 20;
  const ps = toBytes("%!PS-Adobe-3.0 EPSF-3.0\n").slice(0, psLength);
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0xc6d3d0c5, true); // written LE so the bytes read C5 D0 D3 C6
  view.setUint32(4, 30, true); // PS offset
  view.setUint32(8, ps.length, true); // PS length
  view.setUint32(12, 0, true); // no WMF section
  view.setUint32(16, 0, true);
  view.setUint32(20, 30 + ps.length, true); // TIFF offset
  view.setUint32(24, tiff.length, true); // TIFF length
  return concat(header, ps, tiff);
}

/** CRC-32 (PNG chunk checksums), table-based — fflate doesn't export one. */
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A real, valid 1×1 RGB PNG — what a genuine canvas.toBlob("image/png") would return. */
function tinyPng(): Uint8Array {
  const encoder = new TextEncoder();
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length, false);
    out.set(encoder.encode(type), 4);
    out.set(body, 8);
    new DataView(out.buffer).setUint32(8 + body.length, crc32(new Uint8Array([...encoder.encode(type), ...body])), false);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1, false);
  new DataView(ihdr.buffer).setUint32(4, 1, false);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = new Uint8Array([0, 5, 6, 7]);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", zlibSync(raw)),
    ...chunk("IEND", new Uint8Array(0))
  ]);
}

/** A fake canvas whose "decode" accepts the BMP handed to it (real TIFF → BMP path) and whose toBlob("image/png") returns a real PNG. */
function fakeCanvasDeps(): {
  canvasFactory: () => HTMLCanvasElement;
  decode: (blob: Blob, mime: string) => Promise<ImageBitmap>;
} {
  const ctx = { drawImage(): void {}, translate(): void {}, rotate(): void {}, scale(): void {} };
  let w = 0;
  let h = 0;
  return {
    canvasFactory: () =>
      ({
        get width() { return w; },
        set width(v: number) { w = v; },
        get height() { return h; },
        set height(v: number) { h = v; },
        getContext: (k: string) => (k === "2d" ? ctx : null),
        toBlob(cb: (b: Blob | null) => void, mime?: string): void {
          cb(mime === "image/png" ? new Blob([tinyPng() as unknown as BlobPart]) : null);
        }
      }) as unknown as HTMLCanvasElement,
    decode: async (blob: Blob, mime: string) => {
      // The TIFF preview must already be re-wrapped as a decodable BMP by the time it reaches here.
      expect(mime).toBe("image/bmp");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(bytes[0]).toBe(0x42); // "B" — BMP signature
      return { width: 2, height: 2, close(): void {} } as unknown as ImageBitmap;
    }
  };
}

describe("EPS/PS detection", () => {
  it("detects the binary DOS EPS wrapper as eps by default", () => {
    const bytes = binaryEps(tinyTiff(2, 2));
    expect(detectFile(bytes, "art.eps").type).toBe("eps");
    expect(detectFromBytes(bytes, "unknown")).toBe("eps");
  });

  it("detects a .ps file with the same binary wrapper as ps, via the extension", () => {
    const bytes = binaryEps(tinyTiff(2, 2));
    expect(detectFile(bytes, "page.ps").type).toBe("ps");
  });

  it("detects plain ASCII PostScript by its %!PS-Adobe header", () => {
    const bytes = toBytes("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n");
    expect(detectFile(bytes, "vector.eps").type).toBe("eps");
    expect(detectFile(bytes, "page.ps").type).toBe("ps");
  });

  it("offers the same photo/document target list eps and ps share with other image sources", () => {
    for (const type of ["eps", "ps"] as const) {
      const targets = targetsFor(type);
      expect(targets).toContain("pdf");
      expect(targets).toContain("docx");
      expect(targets).toContain("pptx");
      expect(targets).toContain("image-png");
    }
  });
});

describe("extractEpsPreviewTiff", () => {
  it("extracts the exact embedded TIFF preview bytes", () => {
    const tiff = tinyTiff(3, 2);
    const eps = binaryEps(tiff);
    const extracted = extractEpsPreviewTiff(eps);
    expect(Array.from(extracted)).toEqual(Array.from(tiff));
  });

  it("throws an honest error for plain ASCII PostScript with no preview", () => {
    const bytes = toBytes("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n");
    expect(() => extractEpsPreviewTiff(bytes)).toThrow(/No embedded preview/);
  });

  it("throws an honest error when the binary wrapper declares no TIFF section", () => {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0xc6d3d0c5, true);
    view.setUint32(4, 30, true);
    view.setUint32(8, 10, true);
    // TIFF offset/length left at 0 — no preview section.
    expect(() => extractEpsPreviewTiff(header)).toThrow(/No embedded preview/);
  });
});

describe("EPS/PS → image via the orchestrator", () => {
  it("converts an EPS's embedded TIFF preview to a real PDF page", async () => {
    const eps = binaryEps(tinyTiff(2, 2));
    const result = await convertFile({ bytes: eps, name: "art.eps" }, "pdf", { canvas: fakeCanvasDeps() });
    expect(result.name).toBe("art.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(result.bytes[0]).toBe(0x25); // %PDF
  });

  it("converts a PS's embedded TIFF preview to a DOCX with a real embedded picture", async () => {
    const ps = binaryEps(tinyTiff(2, 2));
    const result = await convertFile({ bytes: ps, name: "page.ps" }, "docx", { canvas: fakeCanvasDeps() });
    expect(result.name).toBe("page.docx");
  });

  it("converts an EPS's embedded TIFF preview directly to PNG", async () => {
    const eps = binaryEps(tinyTiff(2, 2));
    const result = await convertFile({ bytes: eps, name: "art.eps" }, "image-png", { canvas: fakeCanvasDeps() });
    expect(result.name).toBe("art.png");
    expect(result.mime).toBe("image/png");
  });

  it("runs OCR on an EPS's embedded TIFF preview (rasterized first, then recognized)", async () => {
    const eps = binaryEps(tinyTiff(2, 2));
    const result = await convertFile({ bytes: eps, name: "art.eps" }, "text", {
      canvas: fakeCanvasDeps(),
      ocr: { recognize: async (dataUrl) => (dataUrl.startsWith("data:image/png;base64,") ? "scanned text" : "") }
    });
    expect(result.name).toBe("art.txt");
    expect(new TextDecoder().decode(result.bytes)).toBe("scanned text");
  });

  it("gives an honest error for a PostScript file with no embedded preview", async () => {
    const bytes = toBytes("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n");
    await expect(convertFile({ bytes, name: "vector.eps" }, "pdf")).rejects.toThrow(/No embedded preview/);
  });
});
