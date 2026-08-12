// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { textToPdf } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  let canvas: HTMLCanvasElement;
  const context = new Proxy<Record<string, unknown>>({}, {
    get(_target, property) {
      if (property === "canvas") return canvas;
      if (property === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (property === "getImageData") return (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(Math.max(1, width * height) * 4);
        data.fill(255);
        return { width, height, data };
      };
      return () => {};
    },
    set() { return true; }
  });
  return {
    canvas: {
      canvasFactory: () => (canvas = {
        width: 1, height: 1,
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
          callback(new Blob([png], { type: mime ?? "image/png" }));
        }
      } as unknown as HTMLCanvasElement),
      decode: async () => ({ width: 2, height: 2, close(): void {} }) as unknown as ImageBitmap
    }
  };
}

describe("round 2: PDF first page to ICNS, PPM, and TGA", () => {
  it("advertises all three demand-ranked pairs", () => {
    expect(targetsFor("pdf")).toEqual(expect.arrayContaining(["image-icns", "image-ppm", "image-tga"]));
  });

  const targets = [
    ["image-icns", "icns", "image/icns"],
    ["image-ppm", "ppm", "image/x-portable-pixmap"],
    ["image-tga", "tga", "image/x-tga"]
  ] as const;

  for (const [target, extension, mime] of targets) {
    it(`converts the first PDF page to ${target} with native metadata`, async () => {
      const pdf = await textToPdf("Local PDF page");
      const result = await convertFile({ bytes: pdf, name: "page.pdf" }, target, canvasOptions());
      expect(result.name).toBe(`page.${extension}`);
      expect(result.mime).toBe(mime);
      if (target === "image-icns") expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe("icns");
      if (target === "image-ppm") expect(new TextDecoder().decode(result.bytes.slice(0, 2))).toBe("P6");
      if (target === "image-tga") {
        expect(result.bytes[2]).toBe(2);
        expect(result.bytes[16]).toBe(32);
      }
    });
  }

  it("rejects corrupt PDF instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: new TextEncoder().encode("not PDF"), name: "bad.pdf" }, "image-ppm", canvasOptions()))
      .rejects.toThrow();
  });
});
