// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { csvToXlsx, xlsxToCsv } from "../src/core/converter/documents";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

const encoder = new TextEncoder();

function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < data.length; index += 4) {
        data[index] = 30; data[index + 1] = 100; data[index + 2] = 200; data[index + 3] = 255;
      }
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
            ? new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
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

describe("round 2 batch 12: XLSM normalization and CSV image formats", () => {
  it("advertises all four demand-ranked pairs and the matrix milestone", () => {
    expect(targetsFor("xlsm")).toContain("xlsx");
    expect(targetsFor("csv")).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1308);
  });

  it("rewrites a real XLSM-named OOXML workbook as standard XLSX with intact data", async () => {
    const source = await csvToXlsx("name,score\nAda,99");
    const result = await convertFile({ bytes: source, name: "scores.xlsm" }, "xlsx");
    expect(result.name).toBe("scores.xlsx");
    expect(result.mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(Object.keys(unzipSync(result.bytes))).toContain("xl/workbook.xml");
    expect(await xlsxToCsv(result.bytes)).toContain("Ada,99");
  });

  it.each([
    ["image-gif", "gif", "image/gif", "GIF89a"],
    ["image-svg", "svg", "image/svg+xml", "<svg"],
    ["image-webp", "webp", "image/webp", "RIFF"]
  ] as const)("converts CSV to %s with real signature and metadata", async (target, extension, mime, signature) => {
    const result = await convertFile({ bytes: encoder.encode("name,score\nAda,99"), name: "scores.csv" }, target, canvasOptions());
    expect(result.name).toBe(`scores.${extension}`);
    expect(result.mime).toBe(mime);
    expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
  });

  it("rejects empty CSV for a newly exposed image target", async () => {
    await expect(convertFile({ bytes: encoder.encode("\n"), name: "empty.csv" }, "image-svg"))
      .rejects.toThrow(/no table data/);
  });

  it("rejects corrupt XLSM instead of emitting an XLSX shell", async () => {
    await expect(convertFile({ bytes: encoder.encode("not OOXML"), name: "bad.xlsm" }, "xlsx"))
      .rejects.toThrow(/not a valid OOXML package/);
  });
});
