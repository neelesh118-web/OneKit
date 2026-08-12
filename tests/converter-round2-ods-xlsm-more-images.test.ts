// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { csvToOds, csvToXlsx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      data.fill(255);
      return { width, height, data, colorSpace: "srgb" } as ImageData;
    }
  };
  return {
    canvas: {
      canvasFactory: () => ({
        get width() { return width; }, set width(value: number) { width = value; },
        get height() { return height; }, set height(value: number) { height = value; },
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/webp"
            ? new TextEncoder().encode("RIFF0000WEBP")
            : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
          callback(new Blob([bytes], { type: mime ?? "image/png" }));
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

describe("round 2: ODS and XLSM GIF/SVG/WebP", () => {
  it("advertises all six pairs", () => {
    for (const source of ["ods", "xlsm"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    }
  });

  const csv = "name,score\nAda,99\nBob,42";
  const sources = [
    ["ods", () => csvToOds(csv), "scores.ods"],
    ["xlsm", () => csvToXlsx(csv), "scores.xlsm"]
  ] as const;
  const targets = [
    ["image-gif", "gif", "image/gif", "GIF89a"],
    ["image-svg", "svg", "image/svg+xml", "<svg"],
    ["image-webp", "webp", "image/webp", "RIFF"]
  ] as const;

  for (const [source, makeBytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes: await makeBytes(), name }, target, canvasOptions());
        expect(result.name).toBe(`scores.${extension}`);
        expect(result.mime).toBe(mime);
        expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
      });
    }
  }

  it("rejects an empty ODS through the direct SVG path", async () => {
    await expect(convertFile({ bytes: await csvToOds(""), name: "empty.ods" }, "image-svg"))
      .rejects.toThrow(/no table data/);
  });

  it("rejects corrupt XLSM through a raster path", async () => {
    await expect(convertFile({ bytes: new TextEncoder().encode("not OOXML"), name: "bad.xlsm" }, "image-gif", canvasOptions()))
      .rejects.toThrow(/not a valid OOXML package/);
  });
});
