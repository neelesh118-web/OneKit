/**
 * QR decoding — 100% local (jsQR, pure JS, no wasm, no network).
 *
 * Lives in its own module so the Safety tab can import it lazily (only when
 * the user actually scans a QR), keeping jsQR out of the popup boot chunk.
 * `decodeQrImage` takes raw RGBA pixel data, so tests can synthesize images
 * without a canvas.
 */

import jsQR from "jsqr";

/** Smallest QR version is 21×21 modules; anything smaller can't be a QR. */
export const MIN_QR_PIXELS = 21;

/**
 * Decodes a QR code from RGBA pixel data. Returns the decoded text, or
 * `null` when no QR code is present in the image.
 */
export function decodeQrImage(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  if (width < MIN_QR_PIXELS || height < MIN_QR_PIXELS) return null;
  const result = jsQR(imageData, width, height, { inversionAttempts: "dontInvert" });
  return result?.data ?? null;
}
