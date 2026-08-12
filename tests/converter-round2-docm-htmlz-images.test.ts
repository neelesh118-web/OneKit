// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { textToDocx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1, height: 1, getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/jpeg"
            ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
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

describe("round 2: DOCM and HTMLZ raster images", () => {
  it("advertises all four demand-ranked pairs", () => {
    expect(targetsFor("docm")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(targetsFor("htmlz")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
  });

  const sources = [
    ["docm", textToDocx("Editable macro-enabled document prose."), "macro.docm"],
    ["htmlz", zipSync({ "index.html": encode("<!doctype html><html><body><h1>Local HTMLZ</h1><p>Readable book prose.</p></body></html>") }), "book.htmlz"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${name.replace(/\.[^.]+$/, "")}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
      });
    }
  }

  it("rejects corrupt DOCM instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode("not OOXML"), name: "bad.docm" }, "image-png", canvasOptions())).rejects.toThrow(/DOCX|zip|archive/i);
  });

  it("rejects HTMLZ without an HTML document", async () => {
    const noHtml = zipSync({ "readme.txt": encode("not a book") });
    await expect(convertFile({ bytes: noHtml, name: "empty.htmlz" }, "image-jpeg", canvasOptions())).rejects.toThrow(/contains no HTML document/);
  });
});
