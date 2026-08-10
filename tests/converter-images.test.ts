// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  convertImage,
  fitMaxDimension,
  imageTargetMime,
  isImageBytes,
  type ImageConvertDeps,
  type ImageTarget
} from "../src/core/converter/images";

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>');

/** A fake canvas whose 2d context serves known pixels and a fake blob. */
function fakeDeps(width: number, height: number, encodeTarget: ImageTarget): ImageConvertDeps {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 200;
    rgba[i * 4 + 1] = 40;
    rgba[i * 4 + 2] = 40;
    rgba[i * 4 + 3] = 255;
  }
  const ctx = {
    drawImage(): void {},
    translate(): void {},
    rotate(): void {},
    scale(): void {},
    getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
      return { width: w, height: h, data: rgba };
    }
  };
  const canvas = {
    width,
    height,
    getContext: (kind: string) => (kind === "2d" ? ctx : null),
    toBlob(cb: (b: Blob | null) => void, _mime?: string, _quality?: number): void {
      if (encodeTarget === "image-gif") {
        cb(null); // GIF must never reach toBlob
        return;
      }
      cb(new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], { type: "application/octet-stream" }));
    }
  };
  return {
    canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    decode: async () => ({ width, height, close(): void {} }) as unknown as ImageBitmap
  };
}

describe("converter images", () => {
  it("maps every image target to its MIME type", () => {
    expect(imageTargetMime("image-png")).toBe("image/png");
    expect(imageTargetMime("image-jpeg")).toBe("image/jpeg");
    expect(imageTargetMime("image-webp")).toBe("image/webp");
    expect(imageTargetMime("image-avif")).toBe("image/avif");
    expect(imageTargetMime("image-gif")).toBe("image/gif");
  });

  it("recognizes image magic bytes", () => {
    expect(isImageBytes(pngHeader)).toBe(true);
    expect(isImageBytes(jpegHeader)).toBe(true);
    expect(isImageBytes(svgBytes)).toBe(true);
    expect(isImageBytes(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });

  it("rejects garbage before touching the canvas", async () => {
    await expect(convertImage(new Uint8Array([0xde, 0xad]), "image-png", fakeDeps(4, 4, "image-png"))).rejects.toThrow(
      /Could not decode this image/
    );
  });

  it("routes raster targets through canvas.toBlob", async () => {
    const bytes = await convertImage(pngHeader, "image-jpeg", fakeDeps(4, 4, "image-jpeg"));
    expect(Array.from(bytes)).toEqual([0x00, 0x01, 0x02, 0x03]);
  });

  it("encodes GIF from pixels, never via toBlob", async () => {
    const bytes = await convertImage(pngHeader, "image-gif", fakeDeps(4, 4, "image-gif"));
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!)).toBe("GIF89a");
    expect(bytes.length).toBeGreaterThan(40);
  });
});

describe("fitMaxDimension", () => {
  it("keeps images that fit", () => {
    expect(fitMaxDimension(100, 50, 200)).toEqual({ width: 100, height: 50 });
    expect(fitMaxDimension(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitMaxDimension(100, 50, 0)).toEqual({ width: 100, height: 50 });
  });

  it("downscales proportionally to the longest side", () => {
    expect(fitMaxDimension(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
    expect(fitMaxDimension(2000, 4000, 1000)).toEqual({ width: 500, height: 1000 });
  });

  it("never produces a zero-size image", () => {
    const fitted = fitMaxDimension(3, 3, 1);
    expect(fitted.width).toBeGreaterThanOrEqual(1);
    expect(fitted.height).toBeGreaterThanOrEqual(1);
  });
});

describe("convertImage settings", () => {
  it("applies max-dimension scaling and forwards quality to toBlob", async () => {
    let canvasW = 0;
    let canvasH = 0;
    let blobQuality: number | undefined;
    const ctx = {
      drawImage(): void {},
      translate(): void {},
      rotate(): void {},
      scale(): void {},
      getImageData(): { width: number; height: number; data: Uint8ClampedArray } {
        return { width: canvasW, height: canvasH, data: new Uint8ClampedArray(canvasW * canvasH * 4) };
      }
    };
    const deps: ImageConvertDeps = {
      canvasFactory: () =>
        ({
          get width() {
            return canvasW;
          },
          set width(v: number) {
            canvasW = v;
          },
          get height() {
            return canvasH;
          },
          set height(v: number) {
            canvasH = v;
          },
          getContext: (kind: string) => (kind === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void, _mime?: string, quality?: number): void {
            blobQuality = quality;
            cb(new Blob([new Uint8Array([9, 9, 9])]));
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 16, height: 16, close(): void {} }) as unknown as ImageBitmap
    };

    const bytes = await convertImage(pngHeader, "image-jpeg", deps, { quality: 0.5, maxDimension: 8 });
    expect(canvasW).toBe(8);
    expect(canvasH).toBe(8);
    expect(blobQuality).toBe(0.5);
    expect(Array.from(bytes)).toEqual([9, 9, 9]);
  });

  it("keeps original dimensions when maxDimension is unset", async () => {
    let canvasW = 0;
    let canvasH = 0;
    const ctx = {
      drawImage(): void {},
      translate(): void {},
      rotate(): void {},
      scale(): void {}
    };
    const deps: ImageConvertDeps = {
      canvasFactory: () =>
        ({
          get width() {
            return canvasW;
          },
          set width(v: number) {
            canvasW = v;
          },
          get height() {
            return canvasH;
          },
          set height(v: number) {
            canvasH = v;
          },
          getContext: (kind: string) => (kind === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void): void {
            cb(new Blob([new Uint8Array([1])]));
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 16, height: 16, close(): void {} }) as unknown as ImageBitmap
    };
    await convertImage(pngHeader, "image-png", deps, {});
    expect(canvasW).toBe(16);
    expect(canvasH).toBe(16);
  });

  it("applies rotate and flip transforms with swapped dimensions", async () => {
    const calls: string[] = [];
    let canvasW = 0;
    let canvasH = 0;
    const ctx = {
      drawImage(): void {
        calls.push("drawImage");
      },
      translate(): void {
        calls.push("translate");
      },
      rotate(): void {
        calls.push("rotate");
      },
      scale(): void {
        calls.push("scale");
      }
    };
    const deps: ImageConvertDeps = {
      canvasFactory: () =>
        ({
          get width() {
            return canvasW;
          },
          set width(v: number) {
            canvasW = v;
          },
          get height() {
            return canvasH;
          },
          set height(v: number) {
            canvasH = v;
          },
          getContext: (kind: string) => (kind === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void): void {
            cb(new Blob([new Uint8Array([1])]));
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 20, height: 10, close(): void {} }) as unknown as ImageBitmap
    };
    await convertImage(pngHeader, "image-png", deps, { rotate: 90, flipH: true });
    // 90° swaps the axes: a 20×10 image becomes a 10×20 canvas.
    expect(canvasW).toBe(10);
    expect(canvasH).toBe(20);
    expect(calls).toContain("translate");
    expect(calls).toContain("rotate");
    expect(calls).toContain("scale");
    expect(calls).toContain("drawImage");
  });

  it("does not rotate or flip when the settings are absent", async () => {
    const calls: string[] = [];
    const ctx = {
      drawImage(): void {
        calls.push("drawImage");
      },
      translate(): void {
        calls.push("translate");
      },
      rotate(): void {
        calls.push("rotate");
      },
      scale(): void {
        calls.push("scale");
      }
    };
    const deps: ImageConvertDeps = {
      canvasFactory: () =>
        ({
          width: 20,
          height: 10,
          getContext: (kind: string) => (kind === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void): void {
            cb(new Blob([new Uint8Array([1])]));
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 20, height: 10, close(): void {} }) as unknown as ImageBitmap
    };
    await convertImage(pngHeader, "image-png", deps, {});
    expect(calls).toContain("translate");
    expect(calls).not.toContain("rotate");
    expect(calls).not.toContain("scale");
  });
});
