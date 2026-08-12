// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

async function realPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([100, 80]);
  return document.save();
}

function canvasOptions(): ConvertOptions {
  let canvas: HTMLCanvasElement;
  const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const context = new Proxy<Record<string, unknown>>({}, {
    get(_target, property) {
      if (property === "canvas") return canvas;
      if (property === "getTransform") return () => transform;
      if (property === "getImageData") {
        return (_x: number, _y: number, width: number, height: number) => {
          const data = new Uint8ClampedArray(Math.max(1, width * height) * 4);
          for (let index = 0; index < data.length; index += 4) {
            data[index] = 40; data[index + 1] = 120; data[index + 2] = 220; data[index + 3] = 255;
          }
          return { width, height, data };
        };
      }
      return () => {};
    },
    set() { return true; }
  });
  const canvasFactory = (): HTMLCanvasElement => {
    canvas = {
      width: 1,
      height: 1,
      getContext: () => context,
      toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
        const bytes = mime === "image/avif"
          ? new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])
          : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        callback(new Blob([bytes], { type: mime ?? "image/png" }));
      }
    } as unknown as HTMLCanvasElement;
    return canvas;
  };
  return {
    canvas: {
      canvasFactory,
      decode: async () => ({ width: 2, height: 2, close(): void {} }) as unknown as ImageBitmap
    }
  };
}

describe("round 2 batch 11: additional PDF raster targets", () => {
  it("advertises all five demand-ranked targets", () => {
    expect(targetsFor("pdf")).toEqual(expect.arrayContaining(["image-avif", "image-bmp", "image-ico", "image-psd", "image-tiff"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1304);
  });

  it.each([
    ["image-avif", "avif", "image/avif", [0x66, 0x74, 0x79, 0x70], 4],
    ["image-bmp", "bmp", "image/bmp", [0x42, 0x4d], 0],
    ["image-ico", "ico", "image/x-icon", [0x00, 0x00, 0x01, 0x00], 0],
    ["image-psd", "psd", "image/vnd.adobe.photoshop", [0x38, 0x42, 0x50, 0x53], 0],
    ["image-tiff", "tiff", "image/tiff", [0x49, 0x49, 0x2a, 0x00], 0]
  ] as const)("converts a real PDF page to %s", async (target, extension, mime, signature, offset) => {
    const result = await convertFile({ bytes: await realPdf(), name: "drawing.pdf" }, target, canvasOptions());
    expect(result.name).toBe(`drawing.${extension}`);
    expect(result.mime).toBe(mime);
    expect(Array.from(result.bytes.slice(offset, offset + signature.length))).toEqual(signature);
    expect(result.bytes.length).toBeGreaterThan(signature.length);
  });

  it("rejects a corrupt PDF through a newly exposed target", async () => {
    const corrupt = new TextEncoder().encode("%PDF-not-real");
    await expect(convertFile({ bytes: corrupt, name: "bad.pdf" }, "image-tiff", canvasOptions())).rejects.toThrow(/Could not render this PDF/);
  });
});
