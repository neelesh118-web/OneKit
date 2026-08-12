/**
 * Apple Icon Image (ICNS) — read and write. Modern .icns files are just a
 * container: a 4-byte-type/4-byte-length chunk stream, and the sizeable
 * icon entries (128px and up, plus the @2x set added later) store a plain
 * PNG directly. That makes both directions genuine, full-fidelity
 * conversions, no different in kind from the ICO handling already in
 * raster.ts — just a different container shape.
 *
 * Scope: PNG-encoded chunks only. The legacy raw ARGB/mask chunk types
 * (is32/il32/it32 + s8mk/l8mk/t8mk, pre-10.7) and JPEG2000-encoded chunks
 * are real ICNS shapes this reader doesn't reach into — honestly rejected
 * rather than misread.
 */

/** Chunk types known to carry a PNG payload directly, largest nominal size first. */
const PNG_CHUNK_SIZES: Record<string, number> = {
  ic10: 1024,
  ic09: 512,
  ic14: 512,
  ic08: 256,
  ic13: 256,
  ic07: 128,
  icp6: 64,
  ic12: 64,
  icp5: 32,
  ic11: 32,
  icp4: 16
};

function fourCc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

/**
 * Unwraps the largest PNG-encoded icon in an .icns file into raw PNG
 * bytes the canvas can decode directly — the same shape `icoToDecodable`
 * hands back for .ico.
 */
export function icnsToPng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8 || fourCc(bytes, 0) !== "icns") {
    throw new Error("Not an ICNS file (missing 'icns' header).");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalLength = view.getUint32(4, false);
  const end = Math.min(bytes.length, totalLength || bytes.length);
  let pos = 8;
  let best: Uint8Array | null = null;
  let bestSize = -1;
  while (pos + 8 <= end) {
    const type = fourCc(bytes, pos);
    const length = view.getUint32(pos + 4, false);
    if (length < 8 || pos + length > end) break;
    const payload = bytes.subarray(pos + 8, pos + length);
    const isPng = payload.length >= 4 && payload[0] === 0x89 && payload[1] === 0x50 && payload[2] === 0x4e && payload[3] === 0x47;
    if (isPng) {
      const nominalSize = PNG_CHUNK_SIZES[type] ?? 0;
      // Prefer known larger nominal sizes; fall back to payload length for
      // unrecognized-but-PNG chunk types so nothing is silently skipped.
      const score = nominalSize * 1_000_000 + payload.length;
      if (score > bestSize) {
        bestSize = score;
        best = payload;
      }
    }
    pos += length;
  }
  if (!best) {
    throw new Error(
      "No PNG-encoded icon was found in this ICNS file — it may use the legacy raw format or JPEG2000, neither of which is supported."
    );
  }
  return best.slice();
}

/** Picks the smallest standard ICNS chunk type whose nominal size covers the image. */
function chunkTypeFor(maxDimension: number): string {
  if (maxDimension <= 16) return "icp4";
  if (maxDimension <= 32) return "icp5";
  if (maxDimension <= 64) return "icp6";
  if (maxDimension <= 128) return "ic07";
  if (maxDimension <= 256) return "ic08";
  if (maxDimension <= 512) return "ic09";
  return "ic10";
}

/**
 * Wraps PNG bytes in a single-icon ICNS container. `size` is the image's
 * longest side, used only to pick the closest-fitting standard chunk type
 * — real ICNS readers scale the PNG itself, so an inexact match still
 * displays correctly.
 */
export function icnsFromPng(png: Uint8Array, size: number): Uint8Array {
  const type = chunkTypeFor(size);
  const chunkLength = 8 + png.length;
  const totalLength = 8 + chunkLength;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("icns"), 0);
  view.setUint32(4, totalLength, false);
  out.set(new TextEncoder().encode(type), 8);
  view.setUint32(12, chunkLength, false);
  out.set(png, 16);
  return out;
}
