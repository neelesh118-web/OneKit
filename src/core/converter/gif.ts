/**
 * GIF encoding via gifenc — a 256-color palette encoder, pure and
 * testable in Node. GIF is inherently limited to 256 colors; the UI says
 * so honestly (great for screenshots and simple graphics, photos lose
 * depth). Decoding uses our own spec-compliant GIF89a parser so frames
 * can be split, re-timed, or re-encoded — all 100% local.
 */
import * as gifencNs from "gifenc";
import { decodeGif, type GifDecodedFrame } from "./gif-decode";
import { detectFromBytes, type FileType } from "./detect";

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface AnimatedFrame {
  pixels: PixelSource;
  /** How long this frame stays on screen, in milliseconds. */
  delayMs: number;
}

type GifEncoderCtor = (opts?: { auto?: boolean }) => {
  writeFrame(
    index: Uint8Array,
    width: number,
    height: number,
    opts: { palette: number[][]; delay: number }
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
  return encodeAnimatedGif([{ pixels, delayMs: 0 }]);
}

/** Encodes multiple frames into one animated GIF (gifenc, 256 colors). */
export function encodeAnimatedGif(frames: AnimatedFrame[]): Uint8Array {
  if (frames.length === 0) throw new Error("No frames to encode.");
  const gif = gifenc.GIFEncoder();
  for (const { pixels, delayMs } of frames) {
    const { width, height, data } = pixels;
    if (width < 1 || height < 1 || data.length < width * height * 4) {
      throw new Error("Can't encode a GIF from an empty frame.");
    }
    const palette = gifenc.quantize(data, 256);
    const index = gifenc.applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay: Math.max(0, Math.round(delayMs)) });
  }
  gif.finish();
  return gif.bytes();
}

/** Decodes a GIF into full composited RGBA frames (our own parser). */
export function decodeGifFrames(bytes: Uint8Array): GifDecodedFrame[] {
  return decodeGif(bytes).frames;
}

/** Number of animation frames in a GIF (1 for a still image). */
export function gifFrameCount(bytes: Uint8Array): number {
  return decodeGifFrames(bytes).length;
}

interface ImageDecodeDeps {
  canvasFactory?: () => HTMLCanvasElement;
  decode?: (blob: Blob, mime: string) => Promise<ImageBitmap>;
}

function decodeImageToPixels(
  bytes: Uint8Array,
  name: string,
  deps: ImageDecodeDeps
): Promise<PixelSource> {
  const source = detectFromBytes(bytes, "unknown");
  const canvasFactory = deps.canvasFactory ?? (() => document.createElement("canvas"));
  const decode =
    deps.decode ??
    ((blob: Blob) => {
      if (typeof createImageBitmap !== "function") {
        throw new Error("Image decoding isn't available in this browser.");
      }
      return createImageBitmap(blob);
    });
  return (async () => {
    const mime: Record<string, string> = {
      "image-png": "image/png", "image-jpeg": "image/jpeg", "image-webp": "image/webp",
      "image-gif": "image/gif", "image-bmp": "image/bmp", "image-avif": "image/avif", "image-svg": "image/svg+xml"
    };
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: mime[source] ?? "application/octet-stream"
    });
    let bitmap: ImageBitmap;
    try {
      bitmap = await decode(blob, blob.type);
    } catch {
      throw new Error(`Couldn't decode ${name} — the image may be corrupt.`);
    }
    try {
      const canvas = canvasFactory();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas drawing isn't available in this browser.");
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
      };
    } finally {
      bitmap.close?.();
    }
  })();
}

/**
 * GIF maker: turns a batch of images into one animated GIF, one frame
 * per image. The UI exposes a per-frame delay control; the browser path
 * decodes via canvas, tests inject a fake.
 */
export async function imagesToAnimatedGif(
  files: { bytes: Uint8Array; name: string }[],
  opts: { delayMs?: number; deps?: ImageDecodeDeps } = {}
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("Pick at least one image to make a GIF.");
  const delayMs = opts.delayMs ?? 250;
  const frames: AnimatedFrame[] = [];
  for (const file of files) {
    const pixels = await decodeImageToPixels(file.bytes, file.name, opts.deps ?? {});
    frames.push({ pixels, delayMs });
  }
  return encodeAnimatedGif(frames);
}

/**
 * Splits an animated GIF into individual still images (PNG or JPEG).
 * Multi-frame GIFs produce one file per frame; a still GIF produces one
 * image. The canvas encode is thin browser glue; decoding is our parser.
 */
export async function splitGifToImages(
  bytes: Uint8Array,
  format: "png" | "jpeg",
  deps: ImageDecodeDeps = {}
): Promise<{ bytes: Uint8Array; name: string }[]> {
  const frames = decodeGifFrames(bytes);
  const canvasFactory = deps.canvasFactory ?? (() => document.createElement("canvas"));
  const out: { bytes: Uint8Array; name: string }[] = [];
  const ext = format === "png" ? "png" : "jpg";
  const mime = format === "png" ? "image/png" : "image/jpeg";
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const canvas = canvasFactory();
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas drawing isn't available in this browser.");
    const imageData = ctx.createImageData(frame.width, frame.height);
    imageData.data.set(frame.data);
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, 0.92);
    });
    if (!blob) throw new Error(`This browser couldn't encode ${mime}.`);
    out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), name: `frame-${String(i + 1).padStart(2, "0")}.${ext}` });
  }
  return out;
}

export function isGifType(type: FileType): boolean {
  return type === "image-gif";
}
