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
          const bytes = mime === "image/avif"
            ? new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])
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

describe("round 2: AZW AVIF and BMP outputs", () => {
  it("advertises both demand-ranked targets", () => {
    expect(targetsFor("azw")).toEqual(expect.arrayContaining(["image-avif", "image-bmp"]));
  });

  it("converts readable AZW to a real AVIF container", async () => {
    const result = await convertFile({ bytes: buildAzw("<html><body>Readable chapter</body></html>"), name: "book.azw" }, "image-avif", canvasOptions());
    expect(result.name).toBe("book.avif");
    expect(result.mime).toBe("image/avif");
    expect(new TextDecoder().decode(result.bytes.slice(4, 12))).toBe("ftypavif");
  });

  it("converts readable AZW to a structurally sized BMP", async () => {
    const result = await convertFile({ bytes: buildAzw("<html><body>Readable chapter</body></html>"), name: "book.azw" }, "image-bmp", canvasOptions());
    expect(result.name).toBe("book.bmp");
    expect(result.mime).toBe("image/bmp");
    expect(new TextDecoder().decode(result.bytes.slice(0, 2))).toBe("BM");
    expect(new DataView(result.bytes.buffer, result.bytes.byteOffset).getUint32(2, true)).toBe(result.bytes.length);
  });

  it("rejects corrupt and DRM-protected AZW", async () => {
    await expect(convertFile({ bytes: encode("not an ebook"), name: "bad.azw" }, "image-avif", canvasOptions())).rejects.toThrow(/MOBI/);
    await expect(convertFile({ bytes: buildAzw("<html>Protected</html>", 1), name: "protected.azw" }, "image-bmp", canvasOptions())).rejects.toThrow(/DRM-protected/);
  });
});
