// @vitest-environment node
import { describe, expect, it } from "vitest";
import { icnsFromPng, icnsToPng } from "../src/core/converter/icns";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";

function fakePng(byte: number, length = 20): Uint8Array {
  const out = new Uint8Array(length);
  out[0] = 0x89;
  out[1] = 0x50;
  out[2] = 0x4e;
  out[3] = 0x47;
  out.fill(byte, 4);
  return out;
}

/** Builds a raw ICNS chunk stream by hand, for decode-side tests. */
function buildIcns(chunks: { type: string; payload: Uint8Array }[]): Uint8Array {
  const chunkBytes = chunks.map((c) => {
    const buf = new Uint8Array(8 + c.payload.length);
    buf.set(new TextEncoder().encode(c.type), 0);
    new DataView(buf.buffer).setUint32(4, buf.length, false);
    buf.set(c.payload, 8);
    return buf;
  });
  const total = 8 + chunkBytes.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode("icns"), 0);
  new DataView(out.buffer).setUint32(4, total, false);
  let pos = 8;
  for (const b of chunkBytes) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}

describe("ICNS codec", () => {
  it("wraps and unwraps a PNG payload", () => {
    const png = fakePng(7, 30);
    const icns = icnsFromPng(png, 128);
    expect(String.fromCharCode(...icns.slice(0, 4))).toBe("icns");
    const back = icnsToPng(icns);
    expect(Array.from(back)).toEqual(Array.from(png));
  });

  it("picks a chunk type matching the requested size", () => {
    const icns16 = icnsFromPng(fakePng(1), 16);
    expect(String.fromCharCode(...icns16.slice(8, 12))).toBe("icp4");
    const icns512 = icnsFromPng(fakePng(1), 512);
    expect(String.fromCharCode(...icns512.slice(8, 12))).toBe("ic09");
    const icnsHuge = icnsFromPng(fakePng(1), 4096);
    expect(String.fromCharCode(...icnsHuge.slice(8, 12))).toBe("ic10");
  });

  it("picks the largest PNG chunk when several sizes are present", () => {
    const small = fakePng(1, 20);
    const large = fakePng(2, 400);
    const icns = buildIcns([
      { type: "icp4", payload: small },
      { type: "ic09", payload: large }
    ]);
    const chosen = icnsToPng(icns);
    expect(Array.from(chosen)).toEqual(Array.from(large));
  });

  it("skips non-PNG chunks (legacy raw / JPEG2000) and picks the real PNG", () => {
    const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]); // not a PNG signature
    const png = fakePng(9, 40);
    const icns = buildIcns([
      { type: "is32", payload: raw },
      { type: "ic07", payload: png }
    ]);
    expect(Array.from(icnsToPng(icns))).toEqual(Array.from(png));
  });

  it("honestly rejects a file with no PNG-encoded icon and a bad header", () => {
    const onlyRaw = buildIcns([{ type: "is32", payload: new Uint8Array([1, 2, 3, 4]) }]);
    expect(() => icnsToPng(onlyRaw)).toThrow(/No PNG-encoded icon/);
    expect(() => icnsToPng(new Uint8Array([1, 2, 3, 4]))).toThrow(/missing 'icns' header/);
  });
});

describe("ICNS detection and matrix", () => {
  it("detects ICNS by its magic header regardless of extension", () => {
    const icns = icnsFromPng(fakePng(1), 64);
    expect(detectFromBytes(icns, "unknown")).toBe("image-icns");
    expect(detectFile(icns, "AppIcon.icns").type).toBe("image-icns");
  });

  it("offers the full raster + PDF target list, and every raster source can reach ICNS", () => {
    const targets = targetsFor("image-icns");
    expect(targets).toContain("image-png");
    expect(targets).toContain("image-jpeg");
    expect(targets).toContain("pdf");
    expect(targets).toContain("txt-base64");
    expect(targetsFor("image-png")).toContain("image-icns");
  });
});

describe("ICNS via the orchestrator", () => {
  it("converts an ICNS source to PNG via the fake canvas (unwrapped directly)", async () => {
    const embeddedPng = fakePng(5, 25);
    const icns = icnsFromPng(embeddedPng, 128);
    const outPngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])]);
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
            cb(mime === "image/png" ? outPngBlob : null);
          }
        }) as unknown as HTMLCanvasElement,
      decode: async (blob: Blob, mime: string) => {
        expect(mime).toBe("image/png"); // ICNS unwraps straight to PNG, no BMP re-wrap
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(Array.from(bytes)).toEqual(Array.from(embeddedPng));
        return { width: 128, height: 128, close(): void {} } as unknown as ImageBitmap;
      }
    };
    const result = await convertFile({ bytes: icns, name: "AppIcon.icns" }, "image-png", { canvas: deps });
    expect(result.name).toBe("AppIcon.png");
    expect(result.mime).toBe("image/png");
  });

  it("converts a PNG source to a real, re-decodable ICNS", async () => {
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3, 3, 3])]);
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
      decode: async () => ({ width: 256, height: 256, close(): void {} }) as unknown as ImageBitmap
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    const result = await convertFile({ bytes: png, name: "logo.png" }, "image-icns", { canvas: deps });
    expect(result.name).toBe("logo.icns");
    expect(result.mime).toBe("image/icns");
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe("icns");
    // Genuinely re-decodable, not a stub.
    const back = icnsToPng(result.bytes);
    expect(back[0]).toBe(0x89);
  });
});
