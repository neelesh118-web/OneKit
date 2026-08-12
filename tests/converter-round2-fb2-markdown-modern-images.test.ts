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
          const bytes = mime === "image/webp"
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

describe("round 2: FB2 and Markdown modern image outputs", () => {
  it("advertises all six demand-ranked pairs", () => {
    for (const source of ["fb2", "markdown"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    }
  });

  const sources = [
    ["fb2", encode('<?xml version="1.0"?><FictionBook><description><title-info><book-title>Local story</book-title></title-info></description><body><section><p>Readable FB2 prose.</p></section></body></FictionBook>'), "story.fb2"],
    ["markdown", encode("# Local notes\n\nReadable Markdown prose."), "notes.md"]
  ] as const;
  const targets = [
    ["image-gif", "gif", "image/gif", "GIF89a"],
    ["image-svg", "svg", "image/svg+xml", "<svg"],
    ["image-webp", "webp", "image/webp", "RIFF"]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${name.replace(/\.[^.]+$/, "")}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
      });
    }
  }

  it("rejects FB2 without a readable body", async () => {
    await expect(convertFile({ bytes: encode("<FictionBook></FictionBook>"), name: "empty.fb2" }, "image-svg", canvasOptions())).rejects.toThrow(/no body/);
  });

  it("rejects blank Markdown instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode(" \n "), name: "empty.md" }, "image-gif", canvasOptions())).rejects.toThrow(/no readable text/);
  });
});
