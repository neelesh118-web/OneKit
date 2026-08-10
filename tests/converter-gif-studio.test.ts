// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decodeGifFrames,
  encodeAnimatedGif,
  encodeGif,
  gifFrameCount,
  imagesToAnimatedGif,
  splitGifToImages,
  type PixelSource
} from "../src/core/converter/gif";

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function solidPixels(width: number, height: number, r: number, g: number, b: number): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

const gifMagic = (bytes: Uint8Array): string =>
  String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);

/**
 * Fake canvas for the maker path: the "decoded" image is a fixed
 * solid-color bitmap; getImageData serves the pixels drawn onto it.
 */
function makerDeps(color: [number, number, number]) {
  const rgba = solidPixels(6, 6, color[0], color[1], color[2]).data;
  return {
    canvasFactory: () => {
      const ctx = {
        drawImage(): void {},
        getImageData(_x: number, _y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
          return { width: w, height: h, data: rgba };
        }
      };
      return {
        width: 6,
        height: 6,
        getContext: (kind: string) => (kind === "2d" ? ctx : null)
      } as unknown as HTMLCanvasElement;
    },
    decode: async () => ({ width: 6, height: 6, close: () => {} }) as unknown as ImageBitmap
  };
}

/** Fake canvas for the splitter path: accepts pixels, emits a fake blob. */
function splitterDeps() {
  return {
    canvasFactory: () => {
      let stored: Uint8ClampedArray | null = null;
      const ctx = {
        createImageData(w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(imageData: { data: Uint8ClampedArray }): void {
          stored = imageData.data;
        }
      };
      return {
        width: 0,
        height: 0,
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
        toBlob(cb: (b: Blob | null) => void, _mime?: string): void {
          void stored;
          cb(new Blob([new Uint8Array([0x01, 0x02, 0x03])], { type: "image/png" }));
        }
      } as unknown as HTMLCanvasElement;
    }
  };
}

describe("converter gif studio — animated maker", () => {
  it("turns several images into one animated GIF with a frame delay", async () => {
    const gif = await imagesToAnimatedGif(
      [
        { bytes: pngHeader, name: "a.png" },
        { bytes: pngHeader, name: "b.png" }
      ],
      { delayMs: 500, deps: makerDeps([200, 40, 40]) }
    );
    expect(gifMagic(gif)).toBe("GIF89a");
    const frames = decodeGifFrames(gif);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.delayMs).toBe(500);
  });

  it("defaults to a 250ms delay", async () => {
    const gif = await imagesToAnimatedGif([{ bytes: pngHeader, name: "a.png" }], { deps: makerDeps([10, 10, 10]) });
    expect(decodeGifFrames(gif)[0]!.delayMs).toBe(250);
  });

  it("rejects an empty batch", async () => {
    await expect(imagesToAnimatedGif([], { deps: makerDeps([0, 0, 0]) })).rejects.toThrow(/at least one image/);
  });
});

describe("converter gif studio — frame splitter", () => {
  it("splits a 2-frame GIF into named PNG files", async () => {
    const gif = encodeAnimatedGif([
      { pixels: solidPixels(4, 4, 200, 40, 40), delayMs: 100 },
      { pixels: solidPixels(4, 4, 40, 200, 40), delayMs: 100 }
    ]);
    const files = await splitGifToImages(gif, "png", splitterDeps());
    expect(files).toHaveLength(2);
    expect(files[0]!.name).toBe("frame-01.png");
    expect(files[1]!.name).toBe("frame-02.png");
    expect(files[0]!.bytes.length).toBeGreaterThan(0);
  });

  it("names JPEG splits .jpg", async () => {
    const gif = encodeAnimatedGif([{ pixels: solidPixels(4, 4, 10, 10, 10), delayMs: 0 }]);
    const files = await splitGifToImages(gif, "jpeg", splitterDeps());
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("frame-01.jpg");
  });

  it("counts frames honestly (still GIF = 1)", () => {
    expect(gifFrameCount(encodeGif(solidPixels(2, 2, 5, 5, 5)))).toBe(1);
    expect(
      gifFrameCount(
        encodeAnimatedGif([
          { pixels: solidPixels(2, 2, 5, 5, 5), delayMs: 50 },
          { pixels: solidPixels(2, 2, 6, 6, 6), delayMs: 50 }
        ])
      )
    ).toBe(2);
  });
});
