// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { epubFromHtml } from "../src/core/converter/documents";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1,
        height: 1,
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/jpeg"
            ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])
            : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
          callback(new Blob([bytes], { type: mime ?? "application/octet-stream" }));
        }
      }) as unknown as HTMLCanvasElement,
      decode: async (blob) => {
        const svg = await blob.text();
        return {
          width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1),
          height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1),
          close(): void {}
        } as unknown as ImageBitmap;
      }
    }
  };
}

describe("round 2 batch 6: EPUB to raster images", () => {
  it("advertises both demand-ranked image pairs", () => {
    expect(targetsFor("epub")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1286);
  });

  it.each([
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const)("converts a real EPUB package to %s bytes", async (target, extension, mime, signature) => {
    const epub = epubFromHtml("Local Book", "<h1>Chapter One</h1><p>Readable EPUB content.</p>");
    const result = await convertFile({ bytes: epub, name: "book.epub" }, target, canvasOptions());
    expect(result.name).toBe(`book.${extension}`);
    expect(result.mime).toBe(mime);
    expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
  });

  it("rejects a corrupt EPUB instead of emitting an image shell", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corrupt, name: "bad.epub" }, "image-png", canvasOptions()))
      .rejects.toThrow(/Could not read this EPUB/);
  });
});
