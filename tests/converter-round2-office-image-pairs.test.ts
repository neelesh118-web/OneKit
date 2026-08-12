// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { csvToXls, csvToXlsx, htmlToPptx } from "../src/core/converter/documents";

function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 24; data[i + 1] = 96; data[i + 2] = 180; data[i + 3] = 255;
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

describe("round 2: presentation and spreadsheet image formats", () => {
  const csv = "name,score\nAda,99\nBob,42";
  const sources = [
    ["pptx", () => htmlToPptx("<h1>Quarterly deck</h1><p>Readable slide content.</p>"), "deck.pptx"],
    ["xls", () => csvToXls(csv), "scores.xls"],
    ["xlsx", () => csvToXlsx(csv), "scores.xlsx"]
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
        expect(result.name).toBe(`${source === "pptx" ? "deck" : "scores"}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
      });
    }
  }

  it("rejects an empty worksheet for a new image target", async () => {
    await expect(convertFile({ bytes: await csvToXlsx(""), name: "empty.xlsx" }, "image-svg"))
      .rejects.toThrow(/no table data/);
  });

  it("rejects a corrupt presentation for a new image target", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corrupt, name: "bad.pptx" }, "image-svg"))
      .rejects.toThrow(/pptx|PowerPoint|presentation|ZIP/i);
  });
});
