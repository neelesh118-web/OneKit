// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function realPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.addPage([120, 80]).drawText("OneKit PDF raster batch", { font, size: 10 });
  return document.save();
}

function conversionOptions(): ConvertOptions {
  let canvas: HTMLCanvasElement;
  const pixels = new Uint8ClampedArray([220, 40, 80, 255]);
  const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const context = new Proxy<Record<string, unknown>>({}, {
    get(_target, property) {
      if (property === "canvas") return canvas;
      if (property === "getTransform") return () => transform;
      if (property === "getImageData") {
        return (_x: number, _y: number, width: number, height: number) => ({
          width,
          height,
          data: new Uint8ClampedArray(Math.max(1, width * height) * 4).fill(255)
        });
      }
      return () => {};
    },
    set() { return true; }
  });
  const factory = (): HTMLCanvasElement => {
    canvas = {
      width: 1,
      height: 1,
      getContext: () => context,
      toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
        const bytes = mime === "image/webp"
          ? new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
          : png;
        callback(new Blob([bytes], { type: mime ?? "image/png" }));
      }
    } as unknown as HTMLCanvasElement;
    return canvas;
  };
  return {
    canvas: {
      canvasFactory: factory,
      decode: async () => ({ width: 1, height: 1, close(): void {} }) as unknown as ImageBitmap
    }
  };
}

describe("round 2 batch 1: PDF raster targets", () => {
  it("advertises the three demand-ranked pairs", () => {
    expect(targetsFor("pdf")).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1278);
  });

  it.each([
    ["image-gif", "gif", "image/gif", "GIF89a"],
    ["image-svg", "svg", "image/svg+xml", "<?xml"],
    ["image-webp", "webp", "image/webp", "RIFF"]
  ] as const)("converts real PDF bytes to %s bytes", async (target, extension, mime, signature) => {
    const result = await convertFile({ bytes: await realPdf(), name: "report.pdf" }, target, conversionOptions());
    expect(result.name).toBe(`report.${extension}`);
    expect(result.mime).toBe(mime);
    const prefix = new TextDecoder().decode(result.bytes.slice(0, 200));
    expect(prefix).toContain(signature);
    if (target === "image-svg") expect(prefix).toContain("<svg");
    expect(result.bytes.length).toBeGreaterThan(4);
  });

  it("rejects corrupt PDF bytes instead of emitting an image stub", async () => {
    await expect(convertFile({ bytes: new TextEncoder().encode("%PDF-not-real"), name: "bad.pdf" }, "image-webp", conversionOptions()))
      .rejects.toThrow(/Could not render this PDF/);
  });
});
