/**
 * Image conversion — raster formats via the canvas API. The browser path
 * uses createImageBitmap + canvas.toBlob; the pixel pipeline itself can't
 * run under jsdom, so tests cover the validation guard, target mapping,
 * and honest error paths (the same split the screenshot tools use).
 */
import { detectFromBytes, type FileType } from "./detect";
import { encodeGif } from "./gif";

export type ImageTarget =
  | "image-png"
  | "image-jpeg"
  | "image-webp"
  | "image-avif"
  | "image-gif"
  | "image-ico";

const IMAGE_SOURCES = new Set<FileType>([
  "image-png",
  "image-jpeg",
  "image-webp",
  "image-gif",
  "image-bmp",
  "image-avif",
  "image-svg"
]);

export function imageTargetMime(target: ImageTarget): string {
  switch (target) {
    case "image-png": return "image/png";
    case "image-jpeg": return "image/jpeg";
    case "image-webp": return "image/webp";
    case "image-avif": return "image/avif";
    case "image-gif": return "image/gif";
    case "image-ico": return "image/x-icon";
  }
}

/** JPEG/WebP benefit from a quality hint; PNG/AVIF/ICO are lossless. */
export function imageTargetQuality(target: ImageTarget): number | undefined {
  return target === "image-jpeg" || target === "image-webp" ? 0.92 : undefined;
}

export interface ImageConvertSettings {
  /** 0–1 quality for lossy encoders (JPEG/WebP). Defaults per target. */
  quality?: number;
  /** Downscale so the longest side is ≤ this many pixels. 0/undefined = keep. */
  maxDimension?: number;
  /** Clockwise rotation applied before encoding. */
  rotate?: 90 | 180 | 270;
  /** Mirror horizontally (after rotation). */
  flipH?: boolean;
  /** Mirror vertically (after rotation). */
  flipV?: boolean;
}

/** Proportional downscale math — never upscales, never shrinks below 1px. */
export function fitMaxDimension(
  width: number,
  height: number,
  maxDimension?: number
): { width: number; height: number } {
  if (!maxDimension || maxDimension <= 0) return { width, height };
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/** True when the bytes look like a decodable raster image or SVG. */
export function isImageBytes(bytes: Uint8Array): boolean {
  return IMAGE_SOURCES.has(detectFromBytes(bytes, "unknown"));
}

/** The MIME type to feed the decoder for a source image. */
export function sourceImageMime(type: FileType): string {
  switch (type) {
    case "image-png": return "image/png";
    case "image-jpeg": return "image/jpeg";
    case "image-webp": return "image/webp";
    case "image-gif": return "image/gif";
    case "image-bmp": return "image/bmp";
    case "image-avif": return "image/avif";
    case "image-svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

/**
 * Converts image bytes to another raster format. `deps` lets tests and
 * alternate hosts inject their own canvas; in the popup it defaults to
 * the real DOM canvas + createImageBitmap.
 */
export interface ImageConvertDeps {
  /** Returns a fresh canvas element. Defaults to document.createElement("canvas"). */
  canvasFactory?: () => HTMLCanvasElement;
  /** Decodes bytes to an ImageBitmap. Defaults to createImageBitmap. */
  decode?: (blob: Blob, mime: string) => Promise<ImageBitmap>;
}

export async function convertImage(
  bytes: Uint8Array,
  target: ImageTarget,
  deps?: ImageConvertDeps,
  settings?: ImageConvertSettings
): Promise<Uint8Array> {
  const source = detectFromBytes(bytes, "unknown");
  if (!IMAGE_SOURCES.has(source)) {
    throw new Error("Could not decode this image — the file is unsupported or corrupt.");
  }
  const canvasFactory = deps?.canvasFactory ?? (() => document.createElement("canvas"));
  const decode =
    deps?.decode ??
    ((blob: Blob) => {
      if (typeof createImageBitmap !== "function") {
        throw new Error("Image decoding isn't available in this browser.");
      }
      return createImageBitmap(blob);
    });

  const mime = sourceImageMime(source);
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(blob, mime);
  } catch {
    throw new Error("Could not decode this image — the file may be corrupt.");
  }
  try {
    const fitted = fitMaxDimension(bitmap.width, bitmap.height, settings?.maxDimension);
    const rotate = settings?.rotate ?? 0;
    const flipH = settings?.flipH === true;
    const flipV = settings?.flipV === true;
    const swapped = rotate === 90 || rotate === 270;
    const canvas = canvasFactory();
    canvas.width = swapped ? fitted.height : fitted.width;
    canvas.height = swapped ? fitted.width : fitted.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas drawing isn't available in this browser.");
    // Rotate around the center, then mirror — the freeconvert-style
    // transform applied to every image target, GIF path included.
    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (rotate) ctx.rotate((rotate * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(bitmap, -fitted.width / 2, -fitted.height / 2, fitted.width, fitted.height);
    if (target === "image-gif") {
      // Browsers can't toBlob a GIF — encode from pixels via gifenc.
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return encodeGif(imageData);
    }
    if (target === "image-ico") {
      // ICO containers hold a PNG payload — render to PNG then wrap it.
      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!pngBlob) throw new Error("This browser couldn't encode the icon.");
      return icoFromPng(new Uint8Array(await pngBlob.arrayBuffer()), Math.max(canvas.width, canvas.height));
    }
    const outMime = imageTargetMime(target);
    const quality = settings?.quality ?? imageTargetQuality(target);
    const outBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outMime, quality);
    });
    if (!outBlob) {
      throw new Error(`This browser couldn't encode ${outMime} — try a different target format.`);
    }
    return new Uint8Array(await outBlob.arrayBuffer());
  } finally {
    bitmap.close?.();
  }
}

/**
 * Wraps PNG bytes in a single-image ICO container (Vista+ style, which
 * stores the PNG directly). `size` is the declared dimension; 0 means 256
 * (the ICO convention for large icons), so anything ≥256 is stored as-is.
 */
export function icoFromPng(png: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(22 + png.length);
  const v = new DataView(out.buffer);
  // ICONDIR
  v.setUint16(0, 0, true); // reserved
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, 1, true); // image count
  // ICONDIRENTRY
  const dim = size >= 256 ? 0 : size;
  out[6] = dim; // width
  out[7] = dim; // height
  out[8] = 0; // colour count
  out[9] = 0; // reserved
  v.setUint16(10, 1, true); // planes
  v.setUint16(12, 32, true); // bit depth
  v.setUint32(14, png.length, true); // payload size
  v.setUint32(18, 22, true); // offset to payload
  out.set(png, 22);
  return out;
}
