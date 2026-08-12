// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { htmlToPptx } from "../src/core/converter/documents";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1, height: 1,
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/jpeg" ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]) : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
          callback(new Blob([bytes], { type: mime ?? "application/octet-stream" }));
        }
      }) as unknown as HTMLCanvasElement,
      decode: async (blob) => {
        const svg = await blob.text();
        return { width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1), height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1), close(): void {} } as unknown as ImageBitmap;
      }
    }
  };
}

describe("round 2 batch 8: PPTX and TXT raster images", () => {
  it("advertises all four demand-ranked pairs", () => {
    expect(targetsFor("pptx")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(targetsFor("text")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1294);
  });

  const sources = [
    ["pptx", htmlToPptx("<h1>Quarterly deck</h1><p>Readable slide content.</p>"), "deck.pptx"],
    ["text", encode("Plain local text\nwith a second readable line."), "notes.txt"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${source === "pptx" ? "deck" : "notes"}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
      });
    }
  }

  it("rejects empty text instead of emitting a blank image", async () => {
    await expect(convertFile({ bytes: encode("  \n"), name: "empty.txt" }, "image-png", canvasOptions())).rejects.toThrow(/no readable text/);
  });

  it("rejects corrupt PPTX instead of emitting an image shell", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corrupt, name: "bad.pptx" }, "image-png", canvasOptions())).rejects.toThrow(/pptx|PowerPoint|presentation|ZIP/i);
  });
});
