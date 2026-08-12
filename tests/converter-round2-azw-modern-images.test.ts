// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildAzw(html: string, encryption = 0): Uint8Array {
  const body = encode(html);
  const record0 = new Uint8Array(248);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, 1, false);
  recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false);
  recordView.setUint16(10, 4096, false);
  recordView.setUint16(12, encryption, false);
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

describe("round 2: AZW modern image outputs", () => {
  it("advertises all three demand-ranked targets", () => {
    expect(targetsFor("azw")).toEqual(expect.arrayContaining(["image-gif", "image-svg", "image-webp"]));
  });

  it.each([
    ["image-gif", "gif", "image/gif", "GIF89a"],
    ["image-svg", "svg", "image/svg+xml", "<svg"],
    ["image-webp", "webp", "image/webp", "RIFF"]
  ] as const)("converts readable AZW to %s with real signature and metadata", async (target, extension, mime, signature) => {
    const bytes = buildAzw("<html><body><h1>Local AZW</h1><p>Readable chapter.</p></body></html>");
    const result = await convertFile({ bytes, name: "book.azw" }, target, canvasOptions());
    expect(result.name).toBe(`book.${extension}`);
    expect(result.mime).toBe(mime);
    expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
  });

  it("rejects corrupt AZW instead of emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode("not an ebook"), name: "bad.azw" }, "image-svg", canvasOptions())).rejects.toThrow(/MOBI/);
  });

  it("rejects DRM-protected AZW for a new image target", async () => {
    const protectedBook = buildAzw("<html><body>Protected</body></html>", 1);
    await expect(convertFile({ bytes: protectedBook, name: "protected.azw" }, "image-webp", canvasOptions())).rejects.toThrow(/DRM-protected/);
  });
});
