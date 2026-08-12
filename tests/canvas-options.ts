// Shared fake-canvas mock for raster conversions under the node test
// environment (matches the pattern the converter suite already uses).
import type { ConvertOptions } from "../src/core/converter/convert";

/**
 * pdfjs-compatible canvas mock for pdf → raster/cbz tests: pdf.js drives
 * a Proxy context that answers every call with a no-op, then reads the
 * rendered page via toBlob (PNG bytes).
 */
export function pdfCanvasOptions(): ConvertOptions {
  let ctx: Record<string, unknown>;
  const canvas = {
    width: 200,
    height: 200,
    toDataURL: () => "data:image/png;base64,AAAA",
    toBlob(cb: (b: Blob | null) => void): void {
      cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }));
    },
    getContext: () => ctx,
  };
  const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  ctx = new Proxy<Record<string, unknown>>(
    {},
    {
      get(_target, prop) {
        if (prop === "canvas") return canvas;
        if (prop === "getTransform") return () => transform;
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
  return {
    canvas: {
      canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    },
  };
}

export function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 24; data[i + 1] = 96; data[i + 2] = 180; data[i + 3] = 255;
      }
      return { width, height, data, colorSpace: "srgb" } as ImageData;
    },
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
        },
      }) as unknown as HTMLCanvasElement,
      decode: async (blob: Blob) => {
        const svg = await blob.text();
        return {
          width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1),
          height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1),
          close(): void {},
        } as unknown as ImageBitmap;
      },
    },
  };
}
