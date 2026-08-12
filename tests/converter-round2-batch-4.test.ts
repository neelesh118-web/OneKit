// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { csvToSvg } from "../src/core/converter/documents";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

const encoder = new TextEncoder();

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
        const width = Number(svg.match(/width="(\d+)"/)?.[1] ?? 1);
        const height = Number(svg.match(/height="(\d+)"/)?.[1] ?? 1);
        return { width, height, close(): void {} } as unknown as ImageBitmap;
      }
    }
  };
}

describe("round 2 batch 4: CSV to raster images", () => {
  it("creates a styled, escaped SVG table", () => {
    const svg = new TextDecoder().decode(csvToSvg('name,note\nAda,"A & B < C"'));
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("font-weight=\"700\"");
    expect(svg).toContain("A &amp; B &lt; C");
    expect(svg).not.toContain("A & B < C");
  });

  it("advertises both demand-ranked image pairs", () => {
    expect(targetsFor("csv")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1282);
  });

  it.each([
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const)("converts CSV to real %s bytes", async (target, extension, mime, signature) => {
    const result = await convertFile({ bytes: encoder.encode("name,score\nAda,99\nBob,42"), name: "scores.csv" }, target, canvasOptions());
    expect(result.name).toBe(`scores.${extension}`);
    expect(result.mime).toBe(mime);
    expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
  });

  it("rejects an empty CSV instead of returning a blank image", async () => {
    await expect(convertFile({ bytes: encoder.encode("\n"), name: "empty.csv" }, "image-png", canvasOptions()))
      .rejects.toThrow(/no table data/);
  });
});
