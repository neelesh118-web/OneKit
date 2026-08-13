// @vitest-environment node
// Batch: SVG (and its gzipped twin SVGZ, which shares the same target
// list) → the Office document variants the raster path already reaches
// (DOCM/DOTX via DOCX, POTX/PPSX/PPTM via PPTX) plus TEX from the SVG's
// own text. 12 new pairs: svg→docm/dotx/potx/ppsx/pptm/tex and the same
// six for svgz.
import { describe, expect, it } from "vitest";
import { gzipSync } from "fflate/browser";
import { convertFile, MIME_BY_TARGET, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="100%" height="100%" fill="#6366f1"/><text x="2" y="12" font-size="10">SVG label</text></svg>'
);
const SVGZ_BYTES = gzipSync(SVG_BYTES);

// A real PNG header (signature + IHDR with width=32, height=16) so
// embedders that read dimensions (pngSize) accept the mock raster.
const PNG_32x16 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk header
  0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x10  // width=32, height=16
]);

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
            ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
            : PNG_32x16;
          callback(new Blob([bytes], { type: mime ?? "image/png" }));
        }
      }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 32, height: 16, close(): void {} }) as unknown as ImageBitmap
    }
  };
}

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const NEW_TARGETS = ["docm", "dotx", "potx", "ppsx", "pptm", "tex"] as const;

describe("batch: SVG → Office document variants + TEX", () => {
  it("advertises the six new pairs from both the image-svg and svgz rows", () => {
    for (const src of ["image-svg", "svgz"] as const) {
      const targets = targetsFor(src);
      for (const t of NEW_TARGETS) {
        expect(targets).toContain(t);
      }
    }
  });

  it.each(["docm", "dotx", "potx", "ppsx", "pptm"] as const)(
    "svg → %s produces a real OOXML zip",
    async (target) => {
      const result = await convertFile({ bytes: SVG_BYTES, name: "logo.svg" }, target, canvasOptions());
      expect(result.name).toBe(`logo.${target}`);
      expect(result.mime).toBe(MIME_BY_TARGET[target]);
      expect(Array.from(result.bytes.slice(0, 4))).toEqual(ZIP);
    }
  );

  it.each(["docm", "dotx", "potx", "ppsx", "pptm"] as const)(
    "svgz → %s produces a real OOXML zip",
    async (target) => {
      const result = await convertFile({ bytes: SVGZ_BYTES, name: "logo.svgz" }, target, canvasOptions());
      expect(result.name).toBe(`logo.${target}`);
      expect(result.mime).toBe(MIME_BY_TARGET[target]);
      expect(Array.from(result.bytes.slice(0, 4))).toEqual(ZIP);
    }
  );

  it.each(["svg", "svgz"] as const)("%s → tex renders the SVG's own text as LaTeX without OCR", async (src) => {
    const result = await convertFile(
      { bytes: src === "svg" ? SVG_BYTES : SVGZ_BYTES, name: `logo.${src}` },
      "tex"
    );
    expect(result.name).toBe("logo.tex");
    const text = new TextDecoder().decode(result.bytes);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/%|documentclass|\\begin/);
  });
});
