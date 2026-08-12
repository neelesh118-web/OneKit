/**
 * EPS (Encapsulated PostScript) preview extraction. EPS carries vector
 * PostScript — there's no local, pure-TS way to rasterize arbitrary
 * PostScript, so full EPS rendering is out of scope (same honest
 * boundary as real vectorisation). But the "DOS EPS" binary wrapper
 * Adobe/CorelDraw tools write embeds a low-res TIFF preview meant for
 * previewing without a PostScript interpreter — the exact same shape as
 * a camera RAW's embedded JPEG preview (see raw-photo.ts). When that
 * TIFF section is present, extracting and decoding it is a genuine
 * conversion of real bytes, not a placeholder.
 */

/** The four-byte signature marking a binary "DOS EPS" wrapper. */
const BINARY_EPS_MAGIC = [0xc5, 0xd0, 0xd3, 0xc6];

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

const NO_PREVIEW_MESSAGE =
  "No embedded preview image was found in this EPS file. This converter reads the low-res TIFF preview some EPS exporters (Illustrator, CorelDraw) embed for the binary \"DOS EPS\" wrapper — it can't rasterize PostScript directly.";

/**
 * Extracts the embedded TIFF preview bytes from a "DOS EPS" binary
 * wrapper (signature C5 D0 D3 C6, then four (offset, length) uint32
 * pairs for the PostScript/WMF/TIFF sections). Throws honestly when the
 * file is plain PostScript — most EPS written by non-Adobe/CorelDraw
 * tools — with no embedded raster preview at all.
 */
export function extractEpsPreviewTiff(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 30 || !BINARY_EPS_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new Error(NO_PREVIEW_MESSAGE);
  }
  const tiffOffset = readU32LE(bytes, 20);
  const tiffLength = readU32LE(bytes, 24);
  if (tiffOffset === 0 || tiffLength === 0 || tiffOffset + tiffLength > bytes.length) {
    throw new Error(NO_PREVIEW_MESSAGE);
  }
  return bytes.slice(tiffOffset, tiffOffset + tiffLength);
}
