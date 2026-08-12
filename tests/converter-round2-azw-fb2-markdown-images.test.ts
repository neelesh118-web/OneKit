// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildMobi(html: string): Uint8Array {
  const body = encode(html);
  const record0 = new Uint8Array(248);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, 1, false);
  recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false);
  recordView.setUint16(10, 4096, false);
  record0.set(encode("MOBI"), 16);
  recordView.setUint32(20, 232, false);
  recordView.setUint32(24, 2, false);
  recordView.setUint32(28, 65001, false);
  const headerSize = 94;
  const out = new Uint8Array(headerSize + record0.length + body.length);
  const view = new DataView(out.buffer);
  out.set(encode("OneKitBook"), 0);
  out.set(encode("BOOKMOBI"), 60);
  view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false);
  view.setUint32(86, headerSize + record0.length, false);
  out.set(record0, headerSize);
  out.set(body, headerSize + record0.length);
  return out;
}

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1,
        height: 1,
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/jpeg"
            ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])
            : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
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

describe("round 2: AZW, FB2, and Markdown raster outputs", () => {
  it("advertises all six demand-ranked pairs", () => {
    for (const source of ["azw", "fb2", "markdown"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    }
  });

  const sources = [
    ["azw", buildMobi("<html><body><h1>Local AZW book</h1><p>Readable chapter.</p></body></html>"), "book.azw"],
    ["fb2", encode('<?xml version="1.0"?><FictionBook><description><title-info><book-title>Local FB2</book-title></title-info></description><body><section><title><p>Chapter</p></title><p>Readable story.</p></section></body></FictionBook>'), "story.fb2"],
    ["markdown", encode("# Local Markdown\n\nReadable paragraph."), "notes.md"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real bytes and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${name.replace(/\.[^.]+$/, "")}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
      });
    }
  }

  it.each([
    ["fb2", encode('<?xml version="1.0"?><FictionBook></FictionBook>'), "empty.fb2"],
    ["markdown", encode(" \n "), "empty.md"]
  ] as const)("rejects empty %s instead of emitting an image shell", async (_source, bytes, name) => {
    await expect(convertFile({ bytes, name }, "image-png", canvasOptions())).rejects.toThrow(/no body|no readable text/);
  });

  it("rejects corrupt AZW instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode("not an ebook"), name: "bad.azw" }, "image-png", canvasOptions())).rejects.toThrow(/MOBI/);
  });
});
