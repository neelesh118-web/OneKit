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
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < data.length; index += 4) {
        data[index] = 20; data[index + 1] = 80; data[index + 2] = 160; data[index + 3] = 255;
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

describe("round 2: HTML, MOBI, and TXT modern image outputs", () => {
  it("advertises all nine demand-ranked pairs", () => {
    for (const source of ["html", "mobi", "text"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
    }
  });

  const sources = [
    ["html", encode("<!doctype html><html><body><h1>Local page</h1><p>Readable content.</p></body></html>"), "page.html"],
    ["mobi", buildMobi("<html><body><h1>Local book</h1><p>Readable content.</p></body></html>"), "book.mobi"],
    ["text", encode("Local notes\nwith readable content."), "notes.txt"]
  ] as const;
  const targets = [
    ["image-gif", "gif", "image/gif", "GIF89a"],
    ["image-svg", "svg", "image/svg+xml", "<svg"],
    ["image-webp", "webp", "image/webp", "RIFF"]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real bytes and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${name.replace(/\.[^.]+$/, "")}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
      });
    }
  }

  it.each([
    ["html", encode("<html><body></body></html>"), "empty.html"],
    ["text", encode(" \n "), "empty.txt"]
  ] as const)("rejects empty %s instead of emitting an image shell", async (_source, bytes, name) => {
    await expect(convertFile({ bytes, name }, "image-svg", canvasOptions())).rejects.toThrow(/no readable text/);
  });

  it("rejects corrupt MOBI instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode("not a mobi"), name: "bad.mobi" }, "image-svg", canvasOptions())).rejects.toThrow(/MOBI/);
  });
});
