// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { csvToOds, csvToXlsx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1, height: 1,
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

describe("round 2: ODS and XLSM raster images", () => {
  it("advertises all four demand-ranked pairs", () => {
    expect(targetsFor("ods")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(targetsFor("xlsm")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
  });

  const csv = "name,score\nAda,99\nBob,42";
  const sources = [
    ["ods", () => csvToOds(csv), "scores.ods"],
    ["xlsm", () => csvToXlsx(csv), "scores.xlsm"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, makeBytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes: await makeBytes(), name }, target, canvasOptions());
        expect(result.name).toBe(`scores.${extension}`);
        expect(result.mime).toBe(mime);
        expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
      });
    }
  }

  it("rejects an empty ODS instead of emitting a blank image", async () => {
    await expect(convertFile({ bytes: await csvToOds(""), name: "empty.ods" }, "image-png", canvasOptions()))
      .rejects.toThrow(/no table data/);
  });

  it("rejects non-OOXML XLSM bytes before rendering", async () => {
    await expect(convertFile({ bytes: new TextEncoder().encode("not OOXML"), name: "bad.xlsm" }, "image-jpeg", canvasOptions()))
      .rejects.toThrow(/not a valid OOXML package/);
  });
});
