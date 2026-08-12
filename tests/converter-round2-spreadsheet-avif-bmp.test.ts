// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { csvToXls, csvToXlsx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) { data[i] = 20; data[i + 1] = 100; data[i + 2] = 180; data[i + 3] = 255; }
      return { width, height, data, colorSpace: "srgb" } as ImageData;
    }
  };
  return { canvas: {
    canvasFactory: () => ({
      get width() { return width; }, set width(value: number) { width = value; },
      get height() { return height; }, set height(value: number) { height = value; },
      getContext: () => context,
      toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
        const bytes = mime === "image/avif"
          ? new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])
          : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        callback(new Blob([bytes], { type: mime ?? "image/png" }));
      }
    }) as unknown as HTMLCanvasElement,
    decode: async (blob) => { const svg = await blob.text(); return { width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1), height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1), close(): void {} } as unknown as ImageBitmap; }
  } };
}

describe("round 2: XLS/XLSX AVIF and BMP", () => {
  it("advertises all four ranked pairs", () => {
    for (const source of ["xls", "xlsx"] as const) expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-avif", "image-bmp"]));
  });

  const sources = [
    ["xls", async () => csvToXls("name,score\nAda,99"), "scores.xls"],
    ["xlsx", async () => csvToXlsx("name,score\nAda,99"), "scores.xlsx"]
  ] as const;

  for (const [source, make, name] of sources) {
    it(`${source} converts to AVIF with real file-type signature`, async () => {
      const result = await convertFile({ bytes: await make(), name }, "image-avif", canvasOptions());
      expect(result.name).toBe("scores.avif");
      expect(result.mime).toBe("image/avif");
      expect(new TextDecoder().decode(result.bytes.slice(4, 12))).toBe("ftypavif");
    });
    it(`${source} converts to BMP with encoded bitmap header`, async () => {
      const result = await convertFile({ bytes: await make(), name }, "image-bmp", canvasOptions());
      expect(result.name).toBe("scores.bmp");
      expect(result.mime).toBe("image/bmp");
      expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x42, 0x4d]);
      expect(new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength).getUint32(2, true)).toBe(result.bytes.length);
    });
  }

  it("rejects an empty workbook for a newly exposed target", async () => {
    await expect(convertFile({ bytes: await csvToXlsx(""), name: "empty.xlsx" }, "image-bmp", canvasOptions())).rejects.toThrow(/no table data/);
  });
});
