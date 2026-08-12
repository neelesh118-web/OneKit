// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { epubFromHtml, textToDocx } from "../src/core/converter/documents";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < data.length; index += 4) {
        data[index] = 25; data[index + 1] = 75; data[index + 2] = 125; data[index + 3] = 255;
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

describe("round 2 batch 13: DOCX and EPUB extended image outputs", () => {
  it("advertises all six demand-ranked pairs and the matrix milestone", () => {
    for (const source of ["docx", "epub"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    }
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1314);
  });

  const sources = [
    ["DOCX", "report.docx", () => textToDocx("Quarterly report\nRevenue grew locally.")],
    ["EPUB", "book.epub", () => epubFromHtml("Local Book", "<h1>Chapter One</h1><p>Readable EPUB content.</p>")]
  ] as const;

  it.each(sources)("converts a real %s to GIF, SVG, and WebP bytes", async (_label, name, makeBytes) => {
    const input = { bytes: makeBytes(), name };
    const gif = await convertFile(input, "image-gif", canvasOptions());
    const svg = await convertFile(input, "image-svg");
    const webp = await convertFile(input, "image-webp", canvasOptions());

    expect(gif).toMatchObject({ name: name.replace(/\.[^.]+$/, ".gif"), mime: "image/gif" });
    expect(new TextDecoder().decode(gif.bytes.slice(0, 6))).toBe("GIF89a");
    expect(svg).toMatchObject({ name: name.replace(/\.[^.]+$/, ".svg"), mime: "image/svg+xml" });
    expect(new TextDecoder().decode(svg.bytes.slice(0, 200))).toContain("<svg");
    expect(webp).toMatchObject({ name: name.replace(/\.[^.]+$/, ".webp"), mime: "image/webp" });
    expect(new TextDecoder().decode(webp.bytes.slice(0, 12))).toContain("RIFF");
    expect(new TextDecoder().decode(webp.bytes.slice(0, 12))).toContain("WEBP");
  });

  it("rejects text-free DOCX and corrupt EPUB image renders", async () => {
    await expect(convertFile({ bytes: textToDocx("   "), name: "empty.docx" }, "image-svg"))
      .rejects.toThrow(/no readable text/);
    const corruptEpub = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corruptEpub, name: "bad.epub" }, "image-svg"))
      .rejects.toThrow(/Could not read this EPUB/);
  });
});
