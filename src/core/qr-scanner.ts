/**
 * QR scanner — decode a QR code from an image file or the visible tab,
 * entirely on-device with jsQR (already bundled for TOTP QR upload).
 *
 * jsQR needs a raw RGBA buffer, so callers pass image data; the pure
 * decode lives here. Honest about limits: blurry/small/crooked QRs may
 * not decode — we surface that message instead of inventing a result.
 */

import jsQR from "jsqr";

export interface QrScanResult {
  text: string;
  /** Bytes of the decoded payload. */
  byteLength: number;
  isUrl: boolean;
}

export interface QrDecodeFailure {
  ok: false;
  error: "no-qr" | "invalid-image";
}

export interface QrDecodeSuccess {
  ok: true;
  result: QrScanResult;
}

export type QrDecode = QrDecodeSuccess | QrDecodeFailure;

/** Decodes a QR from an RGBA pixel buffer. */
export function decodeQrFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number
): QrDecode {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { ok: false, error: "invalid-image" };
  }
  const code = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  if (!code?.data) return { ok: false, error: "no-qr" };
  const text = code.data;
  return {
    ok: true,
    result: {
      text,
      byteLength: new TextEncoder().encode(text).length,
      isUrl: /^https?:\/\/.+/i.test(text)
    }
  };
}

/** Decodes a QR from an HTMLImageElement's loaded pixels. */
export function decodeQrFromImage(img: HTMLImageElement): QrDecode {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, error: "invalid-image" };
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decodeQrFromRgba(imageData.data, canvas.width, canvas.height);
}

/** Reads a picked file into an HTMLImageElement (content-script/popup side). */
export function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file."));
    };
    img.src = url;
  });
}

/** Short summary of a scan result for status lines. */
export function summarizeScan(result: QrScanResult): string {
  const kind = result.isUrl ? "URL" : `${result.byteLength} bytes of text`;
  return result.text.length > 80 ? `${kind} — ${result.text.slice(0, 77)}…` : `${kind} — ${result.text}`;
}
