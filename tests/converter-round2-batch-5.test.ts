// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { textToDocx, textToSvg } from "../src/core/converter/documents";
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

describe("round 2 batch 5: DOCX to raster images", () => {
  it("word-wraps and XML-escapes document text in SVG", () => {
    const svg = new TextDecoder().decode(textToSvg(`Heading\n${"word ".repeat(100)}A & B < C`));
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg.match(/<text /g)?.length).toBeGreaterThan(2);
    expect(svg).toContain("A &amp; B &lt; C");
  });

  it("advertises both demand-ranked image pairs", () => {
    expect(targetsFor("docx")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1284);
  });

  it.each([
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const)("converts a real DOCX to %s bytes", async (target, extension, mime, signature) => {
    const docx = textToDocx("Quarterly report\nRevenue grew locally.");
    const result = await convertFile({ bytes: docx, name: "report.docx" }, target, canvasOptions());
    expect(result.name).toBe(`report.${extension}`);
    expect(result.mime).toBe(mime);
    expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
  });

  it("rejects text-free documents instead of emitting a blank image", async () => {
    const docx = textToDocx("   ");
    await expect(convertFile({ bytes: docx, name: "empty.docx" }, "image-png", canvasOptions()))
      .rejects.toThrow(/no readable text/);
  });
});
