/**
 * Image conversion — raster formats via the canvas API. The browser path
 * uses createImageBitmap + canvas.toBlob; the pixel pipeline itself can't
 * run under jsdom, so tests cover the validation guard, target mapping,
 * and honest error paths (the same split the screenshot tools use).
 */
import { detectFromBytes, type FileType } from "./detect";
import { encodeGif } from "./gif";
import { decodeDds, encodeDds } from "./dds";
import {
  decodeTga,
  decodeTiff,
  decodePpm,
  encodeBmp,
  encodePpm,
  encodeTga,
  encodeTiff,
  icoToDecodable,
  svgFromPng,
  type RgbaImage
} from "./raster";
import { decodePsd, encodePsd } from "./psd";
import { icnsFromPng, icnsToPng } from "./icns";

export type ImageTarget =
  | "image-png"
  | "image-jpeg"
  | "image-webp"
  | "image-avif"
  | "image-gif"
  | "image-ico"
  | "image-bmp"
  | "image-tiff"
  | "image-dds"
  | "image-svg"
  | "image-tga"
  | "image-ppm"
  | "image-psd"
  | "image-icns";

const IMAGE_SOURCES = new Set<FileType>([
  "image-png",
  "image-jpeg",
  "image-webp",
  "image-gif",
  "image-bmp",
  "image-avif",
  "image-svg",
  // Formats no browser decodes natively — raster.ts/dds.ts turn them into
  // a BMP the canvas can read, so they join the same pipeline.
  "image-tiff",
  "image-ico",
  "image-dds",
  "image-tga",
  "image-ppm",
  "image-psd",
  "image-icns"
]);

export function imageTargetMime(target: ImageTarget): string {
  switch (target) {
    case "image-png": return "image/png";
    case "image-jpeg": return "image/jpeg";
    case "image-webp": return "image/webp";
    case "image-avif": return "image/avif";
    case "image-gif": return "image/gif";
    case "image-ico": return "image/x-icon";
    case "image-bmp": return "image/bmp";
    case "image-tiff": return "image/tiff";
    case "image-dds": return "image/vnd-ms.dds";
    case "image-svg": return "image/svg+xml";
    case "image-tga": return "image/x-tga";
    case "image-ppm": return "image/x-portable-pixmap";
    case "image-psd": return "image/vnd.adobe.photoshop";
    case "image-icns": return "image/icns";
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
 * Hands back bytes the canvas can decode. TIFF, DDS and ICO have no
 * browser decoder, so their pixels are decoded here and re-wrapped as a
 * BMP — which every browser reads — instead of needing a second pipeline.
 */
function toDecodableSource(bytes: Uint8Array, source: FileType): { bytes: Uint8Array; mime: string } {
  if (source === "image-tiff") return { bytes: encodeBmp(decodeTiff(bytes), { alpha: true }), mime: "image/bmp" };
  if (source === "image-dds") return { bytes: encodeBmp(decodeDds(bytes), { alpha: true }), mime: "image/bmp" };
  if (source === "image-tga") return { bytes: encodeBmp(decodeTga(bytes), { alpha: true }), mime: "image/bmp" };
  if (source === "image-ppm") return { bytes: encodeBmp(decodePpm(bytes), { alpha: true }), mime: "image/bmp" };
  if (source === "image-psd") return { bytes: encodeBmp(decodePsd(bytes), { alpha: true }), mime: "image/bmp" };
  if (source === "image-ico") return icoToDecodable(bytes);
  if (source === "image-icns") return { bytes: icnsToPng(bytes), mime: "image/png" };
  return { bytes, mime: sourceImageMime(source) };
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
  settings?: ImageConvertSettings,
  // The caller already ran full detection (name + magic bytes) once; pass
  // it through rather than re-sniffing from bytes alone. That matters for
  // formats without a reliable magic signature — old-style TGA has none,
  // and its header can collide with ICO/CUR's — so a blind magic-only
  // re-detection here could misidentify it.
  knownSource?: FileType
): Promise<Uint8Array> {
  const source = knownSource ?? detectFromBytes(bytes, "unknown");
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

  const decodable = toDecodableSource(bytes, source);
  const mime = decodable.mime;
  const blob = new Blob([decodable.bytes as unknown as BlobPart], { type: mime });
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
    if (
      target === "image-bmp" || target === "image-tiff" || target === "image-dds" ||
      target === "image-tga" || target === "image-ppm" || target === "image-psd"
    ) {
      // Formats the browser can't write — encode them from the pixels.
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const image: RgbaImage = {
        width: canvas.width,
        height: canvas.height,
        data: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength)
      };
      if (target === "image-tiff") return encodeTiff(image);
      if (target === "image-dds") return encodeDds(image);
      if (target === "image-tga") return encodeTga(image);
      if (target === "image-ppm") return encodePpm(image);
      if (target === "image-psd") return encodePsd(image);
      return encodeBmp(image);
    }
    if (target === "image-ico" || target === "image-svg" || target === "image-icns") {
      // All three wrap a PNG: ICO in its icon directory, SVG in an
      // <image>, ICNS in its chunk container.
      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!pngBlob) throw new Error("This browser couldn't encode the image.");
      const png = new Uint8Array(await pngBlob.arrayBuffer());
      if (target === "image-svg") return svgFromPng(png, canvas.width, canvas.height);
      if (target === "image-icns") return icnsFromPng(png, Math.max(canvas.width, canvas.height));
      return icoFromPng(png, Math.max(canvas.width, canvas.height));
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
