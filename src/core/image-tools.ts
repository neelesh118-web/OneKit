/**
 * Image toolbox — local image convert/resize/compress via canvas. The
 * canvas rasterization itself is thin browser glue in the popup; this
 * module holds the pure, testable parts: validation, dimension math, and
 * format metadata.
 */

export type ImageFormat = "png" | "jpeg" | "webp";

export const IMAGE_FORMATS: ImageFormat[] = ["png", "jpeg", "webp"];

export const FORMAT_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

export const FORMAT_EXT: Record<ImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp"
};

/** Decodes a data URL prefix like "data:image/png;base64," → mime. */
export function dataUrlMime(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl);
  return match?.[1]?.toLowerCase() ?? null;
}

export function isSupportedImageMime(mime: string | null): mime is `image/${string}` {
  return !!mime && mime.startsWith("image/");
}

/** Computes the output dimensions given an input and an optional max size. */
export function outputDimensions(
  width: number,
  height: number,
  maxSizePx: number | null
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  if (!maxSizePx || maxSizePx <= 0) return { width: safeW, height: safeH };
  const scale = Math.min(1, maxSizePx / Math.max(safeW, safeH));
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale))
  };
}

/** Human summary of a transformation for the status line. */
export function describeChange(
  input: { width: number; height: number; bytes: number },
  output: { width: number; height: number },
  format: ImageFormat
): string {
  const dims =
    input.width === output.width && input.height === output.height
      ? `${output.width}×${output.height}`
      : `${input.width}×${input.height} → ${output.width}×${output.height}`;
  return `${format.toUpperCase()} · ${dims} · original ${(input.bytes / 1024).toFixed(1)} KB`;
}
