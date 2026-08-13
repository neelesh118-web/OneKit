/**
 * Photoshop PSD — read and write the flattened composite image.
 *
 * A PSD file's Layer and Mask Information section holds each individual
 * layer, which pure TS won't try to recreate — but every PSD also carries
 * a separate "Image Data" section at the end of the file: one final,
 * already-merged/flattened picture, stored for apps (and Photoshop's own
 * thumbnails) that don't need the layers. Decoding that section is a real,
 * full-fidelity conversion, not a preview substitute like the camera RAW
 * path — it's the same pixels a "flatten image" export would produce.
 *
 * Scope: 8-bit RGB and Grayscale, raw or PackBits(RLE)-compressed. Higher
 * bit depths, ZIP-compressed image data, and other colour modes (CMYK,
 * Indexed, Lab, Multichannel, Duotone, Bitmap) are honestly rejected — real
 * PSD files, but ones this reader doesn't reach into.
 */
import { unpackBits, type RgbaImage } from "./raster";

const SIGNATURE = "8BPS";

function readSectionLength(view: DataView, at: number): number {
  return view.getUint32(at, false);
}

/**
 * PSB (Photoshop Large Document) is PSD with 8-byte section lengths for
 * the Layer and Mask Information section, so the flattened composite can
 * be read the exact same way once the header is skipped correctly.
 */
function readSectionLength64(view: DataView, at: number): number {
  const hi = view.getUint32(at, false);
  const lo = view.getUint32(at + 4, false);
  return hi * 0x1_0000_0000 + lo;
}

/** Decodes a PSD or PSB's flattened composite image to RGBA. */
export function decodePsd(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 26) throw new Error("This PSD file is too short to read.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (sig !== SIGNATURE) throw new Error("Not a PSD file (missing 8BPS signature).");
  const version = view.getUint16(4, false);
  if (version !== 1 && version !== 2) {
    throw new Error("This 8BPS file has an unsupported version field.");
  }
  const isPsb = version === 2;
  const channels = view.getUint16(12, false);
  const height = view.getUint32(14, false);
  const width = view.getUint32(18, false);
  const depth = view.getUint16(22, false);
  const colorMode = view.getUint16(24, false);
  if (width <= 0 || height <= 0 || width * height > 80_000_000) {
    throw new Error("This PSD's dimensions are outside the supported range.");
  }
  if (depth !== 8) throw new Error("Only 8-bit-per-channel PSD files are supported.");
  if (colorMode !== 1 && colorMode !== 3) {
    throw new Error("Only RGB and Grayscale PSD files are supported (not CMYK, Indexed, Lab, Multichannel, Bitmap or Duotone).");
  }
  const minChannels = colorMode === 3 ? 3 : 1;
  if (channels < minChannels) throw new Error("This PSD's channel count doesn't match its colour mode.");
  const hasAlpha = channels > minChannels;

  let pos = 26;
  pos += 4 + readSectionLength(view, pos); // Color Mode Data (4-byte in both)
  if (pos > bytes.length) throw new Error("This PSD file is truncated.");
  pos += 4 + readSectionLength(view, pos); // Image Resources (4-byte in both)
  if (pos > bytes.length) throw new Error("This PSD file is truncated.");
  // Layer and Mask Information — 4-byte length in PSD, 8-byte in PSB.
  // The layers themselves are skipped (the flattened composite is what
  // we decode), so only the length encoding changes.
  pos += (isPsb ? 8 : 4) + (isPsb ? readSectionLength64(view, pos) : readSectionLength(view, pos));
  if (pos + 2 > bytes.length) throw new Error("This PSD file is truncated.");

  const compression = view.getUint16(pos, false);
  pos += 2;
  const planeSize = width * height;
  const planes: Uint8Array[] = [];
  const neededChannels = hasAlpha ? minChannels + 1 : minChannels;

  if (compression === 0) {
    for (let c = 0; c < channels; c++) {
      if (pos + planeSize > bytes.length) throw new Error("This PSD file's image data is truncated.");
      if (c < neededChannels) planes.push(bytes.subarray(pos, pos + planeSize));
      pos += planeSize;
    }
  } else if (compression === 1) {
    const rowCounts: number[] = [];
    for (let i = 0; i < channels * height; i++) {
      if (pos + 2 > bytes.length) throw new Error("This PSD file's RLE row table is truncated.");
      rowCounts.push(view.getUint16(pos, false));
      pos += 2;
    }
    for (let c = 0; c < channels; c++) {
      const rows: Uint8Array[] = [];
      for (let r = 0; r < height; r++) {
        const count = rowCounts[c * height + r]!;
        if (pos + count > bytes.length) throw new Error("This PSD file's RLE data is truncated.");
        rows.push(bytes.subarray(pos, pos + count));
        pos += count;
      }
      if (c < neededChannels) {
        const plane = new Uint8Array(planeSize);
        let at = 0;
        for (const row of rows) {
          const expanded = unpackBits(row);
          plane.set(expanded.subarray(0, Math.min(width, expanded.length)), at);
          at += width;
        }
        planes.push(plane);
      }
    }
  } else {
    throw new Error(
      "This PSD uses ZIP-compressed image data, which isn't supported here — only raw or RLE (PackBits) compression."
    );
  }

  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < planeSize; i++) {
    let r: number;
    let g: number;
    let b: number;
    if (colorMode === 3) {
      r = planes[0]![i]!;
      g = planes[1]![i]!;
      b = planes[2]![i]!;
    } else {
      r = g = b = planes[0]![i]!;
    }
    const a = hasAlpha ? planes[minChannels]![i]! : 255;
    const d = i * 4;
    out[d] = r;
    out[d + 1] = g;
    out[d + 2] = b;
    out[d + 3] = a;
  }
  return { width, height, data: out };
}

/**
 * Encodes RGBA pixels as a minimal, valid PSD: RGB colour mode, 8-bit,
 * uncompressed, no layers (an empty Layer and Mask Information section —
 * a shape every real PSD reader, Photoshop included, accepts as "flat,
 * composite-only"). Always writes an alpha channel.
 */
export function encodePsd(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const planeSize = width * height;
  const out = new Uint8Array(26 + 4 + 4 + 4 + 2 + planeSize * 4);
  const view = new DataView(out.buffer);
  out[0] = 0x38; // "8"
  out[1] = 0x42; // "B"
  out[2] = 0x50; // "P"
  out[3] = 0x53; // "S"
  view.setUint16(4, 1, false); // version
  view.setUint16(12, 4, false); // channels: R, G, B, A
  view.setUint32(14, height, false);
  view.setUint32(18, width, false);
  view.setUint16(22, 8, false); // depth
  view.setUint16(24, 3, false); // color mode: RGB
  // Color Mode Data, Image Resources, Layer and Mask Info — all empty.
  view.setUint32(26, 0, false);
  view.setUint32(30, 0, false);
  view.setUint32(34, 0, false);
  view.setUint16(38, 0, false); // compression: raw
  let pos = 40;
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < planeSize; i++) out[pos++] = data[i * 4 + c] ?? (c === 3 ? 255 : 0);
  }
  return out;
}
