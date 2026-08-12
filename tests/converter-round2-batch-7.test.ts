// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildMobi(html: string): Uint8Array {
  const body = encode(html);
  const record0 = new Uint8Array(248);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, 1, false);
  recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false);
  recordView.setUint16(10, 4096, false);
  record0.set(encode("MOBI"), 16);
  recordView.setUint32(20, 232, false);
  recordView.setUint32(24, 2, false);
  recordView.setUint32(28, 65001, false);
  const headerSize = 94;
  const out = new Uint8Array(headerSize + record0.length + body.length);
  const view = new DataView(out.buffer);
  out.set(encode("OneKitBook"), 0);
  out.set(encode("BOOKMOBI"), 60);
  view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false);
  view.setUint32(86, headerSize + record0.length, false);
  out.set(record0, headerSize);
  out.set(body, headerSize + record0.length);
  return out;
}

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1, height: 1,
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/jpeg" ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]) : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
          callback(new Blob([bytes], { type: mime ?? "application/octet-stream" }));
        }
      }) as unknown as HTMLCanvasElement,
      decode: async (blob) => {
        const svg = await blob.text();
        return { width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1), height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1), close(): void {} } as unknown as ImageBitmap;
      }
    }
  };
}

describe("round 2 batch 7: HTML and MOBI raster images", () => {
  it("advertises all four demand-ranked pairs", () => {
    expect(targetsFor("html")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(targetsFor("mobi")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1290);
  });

  const sources = [
    ["html", encode("<!doctype html><html><body><h1>Local page</h1><p>Readable content.</p></body></html>"), "page.html"],
    ["mobi", buildMobi("<html><body><h1>Local book</h1><p>Readable content.</p></body></html>"), "book.mobi"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${source === "html" ? "page" : "book"}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
      });
    }
  }

  it("rejects empty HTML instead of emitting a blank image", async () => {
    await expect(convertFile({ bytes: encode("<html><body></body></html>"), name: "empty.html" }, "image-png", canvasOptions())).rejects.toThrow(/no readable text/);
  });

  it("rejects corrupt MOBI instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode("not a mobi"), name: "bad.mobi" }, "image-png", canvasOptions())).rejects.toThrow(/MOBI/);
  });
});
