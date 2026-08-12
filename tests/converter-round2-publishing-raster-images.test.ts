// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return { canvas: {
    canvasFactory: () => ({ width: 1, height: 1, getContext: () => context,
      toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
        const bytes = mime === "image/jpeg" ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        callback(new Blob([bytes], { type: mime ?? "image/png" }));
      }
    }) as unknown as HTMLCanvasElement,
    decode: async (blob) => { const svg = await blob.text(); return { width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1), height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1), close(): void {} } as unknown as ImageBitmap; }
  } };
}

describe("round 2: publishing formats to raster images", () => {
  it("advertises all ten demand-ranked pairs", () => {
    for (const source of ["oeb", "pml", "rst", "tex", "txtz"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    }
  });

  const sources = [
    ["oeb", encode("<package><body><p>Readable Open eBook prose.</p></body></package>"), "book.oeb"],
    ["pml", encode("\\x Chapter One\n\\pReadable Palm book prose."), "book.pml"],
    ["rst", encode("Local RST\n=========\n\nReadable reStructuredText prose."), "notes.rst"],
    ["tex", encode("\\documentclass{article}\n\\begin{document}\n\\section{Local TeX} Readable prose.\n\\end{document}"), "paper.tex"],
    ["txtz", zipSync({ "chapter.txt": encode("Readable compressed text ebook prose.") }), "book.txtz"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, bytes, name] of sources) for (const [target, extension, mime, signature] of targets) {
    it(`${source} converts to ${target} with real signature and metadata`, async () => {
      const result = await convertFile({ bytes, name }, target, canvasOptions());
      expect(result.name).toBe(`${name.replace(/\.[^.]+$/, "")}.${extension}`);
      expect(result.mime).toBe(mime);
      expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
    });
  }

  it.each([
    ["oeb", encode("<package><manifest/></package>"), "empty.oeb", /no embedded readable/],
    ["pml", encode("plain unmarked text"), "empty.pml", /no recognizable Palm markup/],
    ["rst", encode(" \n "), "empty.rst", /no readable text/],
    ["tex", encode(" \n "), "empty.tex", /no readable text/],
    ["txtz", zipSync({ "readme.html": encode("not text") }), "empty.txtz", /contains no text document/]
  ] as const)("rejects invalid or empty %s input", async (_source, bytes, name, error) => {
    await expect(convertFile({ bytes, name }, "image-png", canvasOptions())).rejects.toThrow(error);
  });
});
