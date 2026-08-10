/**
 * GIF encoding via gifenc — a 256-color palette encoder, pure and
 * testable in Node. GIF is inherently limited to 256 colors; the UI says
 * so honestly (great for screenshots and simple graphics, photos lose
 * depth).
 */
import * as gifencNs from "gifenc";

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

type GifEncoderCtor = (opts?: { auto?: boolean }) => {
  writeFrame(
    index: Uint8Array,
    width: number,
    height: number,
    opts: { palette: number[][] }
  ): void;
  finish(): void;
  bytes(): Uint8Array;
};
type QuantizeFn = (rgba: Uint8ClampedArray, maxColors: number) => number[][];
type ApplyPaletteFn = (rgba: Uint8ClampedArray, palette: number[][], format?: string) => Uint8Array;

// gifenc is CJS — normalize namespace vs default interop across bundlers,
// Node, and vitest (same guard pattern as the lamejs fork).
function loadGifenc(): { GIFEncoder: GifEncoderCtor; quantize: QuantizeFn; applyPalette: ApplyPaletteFn } {
  const mod = gifencNs as unknown as {
    GIFEncoder?: GifEncoderCtor;
    quantize?: QuantizeFn;
    applyPalette?: ApplyPaletteFn;
    default?: { GIFEncoder?: GifEncoderCtor; quantize?: QuantizeFn; applyPalette?: ApplyPaletteFn };
  };
  const GIFEncoder = mod.GIFEncoder ?? mod.default?.GIFEncoder;
  const quantize = mod.quantize ?? mod.default?.quantize;
  const applyPalette = mod.applyPalette ?? mod.default?.applyPalette;
  if (!GIFEncoder || !quantize || !applyPalette) {
    throw new Error("GIF encoder failed to load.");
  }
  return { GIFEncoder, quantize, applyPalette };
}

const gifenc = loadGifenc();

export function encodeGif(pixels: PixelSource): Uint8Array {
  const { width, height, data } = pixels;
  if (width < 1 || height < 1 || data.length < width * height * 4) {
    throw new Error("Can't encode a GIF from an empty image.");
  }
  const gif = gifenc.GIFEncoder();
  const palette = gifenc.quantize(data, 256);
  const index = gifenc.applyPalette(data, palette);
  gif.writeFrame(index, width, height, { palette });
  gif.finish();
  return gif.bytes();
}
