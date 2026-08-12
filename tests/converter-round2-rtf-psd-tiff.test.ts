// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function canvasOptions(): ConvertOptions {
  let canvas: HTMLCanvasElement;
  const context = new Proxy<Record<string, unknown>>({}, {
    get(_target, property) {
      if (property === "canvas") return canvas;
      if (property === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (property === "getImageData") return (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4); data.fill(255);
        return { width, height, data };
      };
      return () => {};
    },
    set() { return true; }
  });
  return { canvas: {
    canvasFactory: () => (canvas = { width: 1, height: 1, getContext: () => context } as unknown as HTMLCanvasElement),
    decode: async () => ({ width: 3, height: 2, close(): void {} }) as unknown as ImageBitmap
  } };
}

describe("round 2: RTF to native raster containers", () => {
  it("advertises PSD and TIFF", () => {
    expect(targetsFor("rtf")).toEqual(expect.arrayContaining(["image-psd", "image-tiff"]));
  });

  it.each([
    ["image-psd", "psd", "image/vnd.adobe.photoshop", [0x38, 0x42, 0x50, 0x53]],
    ["image-tiff", "tiff", "image/tiff", [0x49, 0x49, 0x2a, 0x00]]
  ] as const)("renders readable RTF to genuine %s bytes", async (target, extension, mime, signature) => {
    const source = encode("{\\rtf1\\ansi\\b Local report\\b0\\par Revenue grew.}");
    const result = await convertFile({ bytes: source, name: "report.rtf" }, target, canvasOptions());
    expect(result).toMatchObject({ name: `report.${extension}`, mime });
    expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
    expect(result.bytes.length).toBeGreaterThan(20);
  });

  it("rejects corrupt and empty RTF rather than emitting an image shell", async () => {
    await expect(convertFile({ bytes: encode("not rtf"), name: "bad.rtf" }, "image-psd", canvasOptions())).rejects.toThrow(/RTF/);
    await expect(convertFile({ bytes: encode("{\\rtf1\\ansi   }"), name: "empty.rtf" }, "image-tiff", canvasOptions())).rejects.toThrow(/no readable text/i);
  });
});
