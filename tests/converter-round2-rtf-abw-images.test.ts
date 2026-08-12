// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

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
          const bytes = mime === "image/jpeg"
            ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
            : mime === "image/webp"
              ? new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
              : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
          callback(new Blob([bytes], { type: mime ?? "image/png" }));
        }
      }) as unknown as HTMLCanvasElement,
      decode: async (blob) => {
        const svg = await blob.text();
        return { width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1), height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1), close(): void {} } as unknown as ImageBitmap;
      }
    }
  };
}

describe("round 2: RTF modern images and ABW raster images", () => {
  it("advertises all five demand-ranked pairs", () => {
    expect(targetsFor("rtf")).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    expect(targetsFor("abw")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
  });

  const conversions = [
    ["rtf", encode("{\\rtf1\\ansi Local RTF readable prose.}"), "local.rtf", "image-gif", "gif", "image/gif", "GIF89a"],
    ["rtf", encode("{\\rtf1\\ansi Local RTF readable prose.}"), "local.rtf", "image-svg", "svg", "image/svg+xml", "<svg"],
    ["rtf", encode("{\\rtf1\\ansi Local RTF readable prose.}"), "local.rtf", "image-webp", "webp", "image/webp", "RIFF"],
    ["abw", encode('<?xml version="1.0"?><abiword><section><p style="Normal">Readable AbiWord prose.</p></section></abiword>'), "local.abw", "image-png", "png", "image/png", String.fromCharCode(0x89, 0x50, 0x4e, 0x47)],
    ["abw", encode('<?xml version="1.0"?><abiword><section><p style="Normal">Readable AbiWord prose.</p></section></abiword>'), "local.abw", "image-jpeg", "jpg", "image/jpeg", String.fromCharCode(0xff, 0xd8, 0xff, 0xe0)]
  ] as const;

  for (const [source, bytes, name, target, extension, mime, signature] of conversions) {
    it(`${source} converts to ${target} with real signature and metadata`, async () => {
      const result = await convertFile({ bytes, name }, target, canvasOptions());
      expect(result.name).toBe(`local.${extension}`);
      expect(result.mime).toBe(mime);
      expect(String.fromCharCode(...result.bytes.slice(0, 12))).toContain(signature);
    });
  }

  it("rejects corrupt RTF for a new image target", async () => {
    await expect(convertFile({ bytes: encode("not rtf"), name: "bad.rtf" }, "image-svg", canvasOptions())).rejects.toThrow(/RTF/);
  });

  it("rejects ABW without readable paragraphs", async () => {
    await expect(convertFile({ bytes: encode("<abiword><section/></abiword>"), name: "empty.abw" }, "image-png", canvasOptions())).rejects.toThrow(/no readable document text/);
  });
});
