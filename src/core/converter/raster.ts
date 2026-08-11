/**
 * Raster container codecs the browser can't handle on its own — BMP and
 * TIFF encoding, baseline TIFF decoding, and ICO unwrapping. Decoded
 * pixels are handed back to the canvas pipeline in images.ts as BMP
 * (which every browser decodes), so no new image pipeline is needed.
 */
import { unzlibSync } from "fflate/browser";

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

/* BMP ----------------------------------------------------------------- */

/**
 * Encodes RGBA pixels as a BMP. With `alpha` the output is a 32-bit
 * BITMAPV4HEADER bitmap carrying real transparency (used internally to
 * feed decoded TIFF/ICO pixels to the canvas); without it, a 24-bit
 * bitmap composited on white — the honest shape for a .bmp download,
 * since classic BMP has no alpha channel.
 */
export function encodeBmp(image: RgbaImage, opts: { alpha?: boolean } = {}): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty bitmap.");
  const alpha = opts.alpha === true;
  const bpp = alpha ? 32 : 24;
  const headerSize = alpha ? 108 : 40; // BITMAPV4HEADER vs BITMAPINFOHEADER
  const rowSize = Math.ceil((width * bpp) / 32) * 4; // rows are 4-byte aligned
  const pixelSize = rowSize * height;
  const offset = 14 + headerSize;
  const out = new Uint8Array(offset + pixelSize);
  const view = new DataView(out.buffer);

  // BITMAPFILEHEADER
  out[0] = 0x42; // "B"
  out[1] = 0x4d; // "M"
  view.setUint32(2, out.length, true);
  view.setUint32(10, offset, true);
  // BITMAPINFOHEADER / BITMAPV4HEADER
  view.setUint32(14, headerSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive = bottom-up rows
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, bpp, true);
  view.setUint32(30, alpha ? 3 : 0, true); // BI_BITFIELDS : BI_RGB
  view.setUint32(34, pixelSize, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);
  if (alpha) {
    view.setUint32(54, 0x00ff0000, true); // red mask
    view.setUint32(58, 0x0000ff00, true); // green mask
    view.setUint32(62, 0x000000ff, true); // blue mask
    view.setUint32(66, 0xff000000, true); // alpha mask
    view.setUint32(70, 0x57696e20, false); // "Win " colour space
  }

  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4; // BMP rows run bottom-up
    let dst = offset + y * rowSize;
    for (let x = 0; x < width; x++) {
      const p = src + x * 4;
      const r = data[p] ?? 0;
      const g = data[p + 1] ?? 0;
      const b = data[p + 2] ?? 0;
      const a = data[p + 3] ?? 255;
      if (alpha) {
        out[dst] = b;
        out[dst + 1] = g;
        out[dst + 2] = r;
        out[dst + 3] = a;
        dst += 4;
      } else {
        // No alpha channel in 24-bit BMP — composite on white.
        out[dst] = Math.round((b * a + 255 * (255 - a)) / 255);
        out[dst + 1] = Math.round((g * a + 255 * (255 - a)) / 255);
        out[dst + 2] = Math.round((r * a + 255 * (255 - a)) / 255);
        dst += 3;
      }
    }
  }
  return out;
}

/* TIFF ---------------------------------------------------------------- */

/**
 * Encodes RGBA pixels as a baseline uncompressed TIFF (little-endian,
 * one strip, RGB + associated alpha). Baseline TIFF is what every
 * imaging tool reads.
 */
export function encodeTiff(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const pixels = width * height * 4;
  const entries = 12; // IFD entries below
  const ifdSize = 2 + entries * 12 + 4;
  // Long-form values (arrays) live after the IFD: BitsPerSample (4 shorts)
  // + ExtraSamples (1 short) + two rationals for the resolution.
  const bitsOffset = 8 + ifdSize;
  const resOffset = bitsOffset + 8;
  const dataOffset = resOffset + 16;
  const out = new Uint8Array(dataOffset + pixels);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0x4949, true); // "II" little-endian
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true); // first IFD
  view.setUint16(8, entries, true);

  let e = 10;
  const entry = (tag: number, type: number, count: number, value: number): void => {
    view.setUint16(e, tag, true);
    view.setUint16(e + 2, type, true);
    view.setUint32(e + 4, count, true);
    // Values of 4 bytes or less are inlined; shorts sit in the low half.
    if (type === 3 && count === 1) {
      view.setUint16(e + 8, value, true);
      view.setUint16(e + 10, 0, true);
    } else {
      view.setUint32(e + 8, value, true);
    }
    e += 12;
  };
  entry(256, 3, 1, width); // ImageWidth
  entry(257, 3, 1, height); // ImageLength
  entry(258, 3, 4, bitsOffset); // BitsPerSample → 8,8,8,8
  entry(259, 3, 1, 1); // Compression: none
  entry(262, 3, 1, 2); // PhotometricInterpretation: RGB
  entry(273, 4, 1, dataOffset); // StripOffsets
  entry(277, 3, 1, 4); // SamplesPerPixel
  entry(278, 4, 1, height); // RowsPerStrip (single strip)
  entry(279, 4, 1, pixels); // StripByteCounts
  entry(282, 5, 1, resOffset); // XResolution
  entry(283, 5, 1, resOffset + 8); // YResolution
  entry(338, 3, 1, 2); // ExtraSamples: unassociated alpha
  view.setUint32(e, 0, true); // no next IFD

  view.setUint16(bitsOffset, 8, true);
  view.setUint16(bitsOffset + 2, 8, true);
  view.setUint16(bitsOffset + 4, 8, true);
  view.setUint16(bitsOffset + 6, 8, true);
  view.setUint32(resOffset, 72, true);
  view.setUint32(resOffset + 4, 1, true);
  view.setUint32(resOffset + 8, 72, true);
  view.setUint32(resOffset + 12, 1, true);
  out.set(data.subarray(0, pixels), dataOffset);
  return out;
}

interface IfdEntry {
  type: number;
  count: number;
  /** Resolved numeric values (rationals collapse to their quotient). */
  values: number[];
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8 };

/**
 * Decodes a baseline TIFF to RGBA. Covers the compressions real files
 * use — none, PackBits, LZW and Deflate — with 8-bit greyscale, palette
 * and RGB(A) samples. Anything outside baseline (JPEG-in-TIFF, 16-bit
 * samples, tiled or planar layouts) raises an honest error instead of
 * returning wrong pixels.
 */
export function decodeTiff(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 8) throw new Error("This TIFF file is too short to read.");
  const le = bytes[0] === 0x49 && bytes[1] === 0x49;
  const be = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!le && !be) throw new Error("Not a TIFF file (bad byte-order mark).");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, le) !== 42) throw new Error("Not a TIFF file (bad version marker).");

  const ifdOffset = view.getUint32(4, le);
  if (ifdOffset + 2 > bytes.length) throw new Error("This TIFF file is truncated.");
  const count = view.getUint16(ifdOffset, le);
  const tags = new Map<number, IfdEntry>();
  for (let i = 0; i < count; i++) {
    const at = ifdOffset + 2 + i * 12;
    if (at + 12 > bytes.length) break;
    const tag = view.getUint16(at, le);
    const type = view.getUint16(at + 2, le);
    const n = view.getUint32(at + 4, le);
    const size = TYPE_SIZES[type] ?? 0;
    if (size === 0) continue;
    const total = size * n;
    const base = total <= 4 ? at + 8 : view.getUint32(at + 8, le);
    const values: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = base + k * size;
      if (p + size > bytes.length) break;
      if (type === 1 || type === 2 || type === 6 || type === 7) values.push(view.getUint8(p));
      else if (type === 3) values.push(view.getUint16(p, le));
      else if (type === 8) values.push(view.getInt16(p, le));
      else if (type === 4) values.push(view.getUint32(p, le));
      else if (type === 9) values.push(view.getInt32(p, le));
      else if (type === 5 || type === 10) {
        const denom = view.getUint32(p + 4, le);
        values.push(denom === 0 ? 0 : view.getUint32(p, le) / denom);
      }
    }
    tags.set(tag, { type, count: n, values });
  }

  const first = (tag: number, fallback?: number): number => {
    const v = tags.get(tag)?.values[0];
    if (v === undefined) {
      if (fallback === undefined) throw new Error(`This TIFF is missing a required tag (${tag}).`);
      return fallback;
    }
    return v;
  };
  const width = first(256);
  const height = first(257);
  if (width <= 0 || height <= 0 || width * height > 80_000_000) {
    throw new Error("This TIFF's dimensions are outside the supported range.");
  }
  if (tags.has(322) || tags.has(324)) {
    throw new Error("Tiled TIFF files aren't supported — only strip-based baseline TIFF.");
  }
  if (first(284, 1) !== 1) {
    throw new Error("Planar TIFF files aren't supported — only interleaved baseline TIFF.");
  }
  const samples = first(277, 1);
  const bits = tags.get(258)?.values ?? [first(258, 1)];
  if (bits.some((b) => b !== 8)) {
    throw new Error("Only 8-bit-per-sample TIFF files are supported.");
  }
  const photometric = first(262, samples >= 3 ? 2 : 1);
  const compression = first(259, 1);
  const predictor = first(317, 1);
  const stripOffsets = tags.get(273)?.values ?? [];
  const stripCounts = tags.get(279)?.values ?? [];
  if (stripOffsets.length === 0) throw new Error("This TIFF has no image data.");
  const rowsPerStrip = first(278, height);
  const rowBytes = width * samples;

  const strips: Uint8Array[] = [];
  for (let i = 0; i < stripOffsets.length; i++) {
    const start = stripOffsets[i]!;
    const length = stripCounts[i] ?? bytes.length - start;
    const raw = bytes.subarray(start, Math.min(bytes.length, start + length));
    let expanded: Uint8Array;
    if (compression === 1) expanded = raw;
    else if (compression === 32773) expanded = unpackBits(raw);
    else if (compression === 5) expanded = lzwDecode(raw);
    else if (compression === 8 || compression === 32946) {
      try {
        expanded = unzlibSync(raw);
      } catch {
        throw new Error("This TIFF's Deflate data couldn't be read.");
      }
    } else {
      throw new Error(
        `This TIFF uses a compression this converter can't read (code ${compression}). Only uncompressed, PackBits, LZW and Deflate TIFF are supported.`
      );
    }
    if (predictor === 2) applyHorizontalPredictor(expanded, rowBytes, samples);
    else if (predictor !== 1) throw new Error("This TIFF uses an unsupported predictor.");
    strips.push(expanded);
  }

  const palette = tags.get(320)?.values;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const strip = strips[Math.floor(y / rowsPerStrip)];
    if (!strip) break;
    const rowInStrip = y % rowsPerStrip;
    const rowStart = rowInStrip * rowBytes;
    for (let x = 0; x < width; x++) {
      const s = rowStart + x * samples;
      const d = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;
      if (photometric === 3 && palette) {
        // Palette entries are 16-bit per channel, stored R…, G…, B….
        const index = strip[s] ?? 0;
        const size = palette.length / 3;
        r = (palette[index] ?? 0) >> 8;
        g = (palette[size + index] ?? 0) >> 8;
        b = (palette[size * 2 + index] ?? 0) >> 8;
      } else if (samples >= 3) {
        r = strip[s] ?? 0;
        g = strip[s + 1] ?? 0;
        b = strip[s + 2] ?? 0;
        if (samples >= 4) a = strip[s + 3] ?? 255;
      } else {
        const v = strip[s] ?? 0;
        const grey = photometric === 0 ? 255 - v : v; // 0 = WhiteIsZero
        r = grey;
        g = grey;
        b = grey;
        if (samples === 2) a = strip[s + 1] ?? 255;
      }
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = b;
      out[d + 3] = a;
    }
  }
  return { width, height, data: out };
}

/** Reverses horizontal differencing (TIFF predictor 2). */
function applyHorizontalPredictor(data: Uint8Array, rowBytes: number, samples: number): void {
  const rows = Math.floor(data.length / rowBytes);
  for (let y = 0; y < rows; y++) {
    const start = y * rowBytes;
    for (let i = samples; i < rowBytes; i++) {
      data[start + i] = (data[start + i]! + data[start + i - samples]!) & 0xff;
    }
  }
}

/** PackBits run-length decoding (TIFF compression 32773). */
function unpackBits(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const n = input[i]!;
    i++;
    if (n < 128) {
      for (let k = 0; k <= n && i < input.length; k++) out.push(input[i++]!);
    } else if (n > 128) {
      const b = input[i] ?? 0;
      i++;
      for (let k = 0; k < 257 - n; k++) out.push(b);
    }
    // 128 is a no-op byte.
  }
  return new Uint8Array(out);
}

/**
 * LZW decoding, TIFF flavour: MSB-first packing, clear code 256, end code
 * 257, and the code width growing one entry early (at 511/1023/2047).
 */
function lzwDecode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let dict: number[][] = [];
  const resetDict = (): void => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push([], []); // 256 clear, 257 end-of-information
  };
  resetDict();
  let width = 9;
  let previous: number[] | null = null;
  let bitPos = 0;
  const totalBits = input.length * 8;
  while (bitPos + width <= totalBits) {
    let code = 0;
    for (let i = 0; i < width; i++) {
      const p = bitPos + i;
      code = (code << 1) | ((input[p >> 3]! >> (7 - (p & 7))) & 1);
    }
    bitPos += width;
    if (code === 257) break;
    if (code === 256) {
      resetDict();
      width = 9;
      previous = null;
      continue;
    }
    let entry: number[];
    if (code < dict.length && dict[code]!.length > 0) {
      entry = dict[code]!;
    } else if (previous) {
      entry = [...previous, previous[0]!];
    } else {
      throw new Error("This TIFF's LZW data is corrupt.");
    }
    for (const b of entry) out.push(b);
    if (previous) dict.push([...previous, entry[0]!]);
    previous = entry;
    if (dict.length + 1 >= 1 << width && width < 12) width++;
  }
  return new Uint8Array(out);
}

/* ICO ------------------------------------------------------------------ */

/**
 * Unwraps the largest image in an .ico/.cur file into something the
 * canvas can decode: modern icons embed a PNG directly, older ones a
 * headerless DIB that gets a BMP file header bolted on.
 */
export function icoToDecodable(bytes: Uint8Array): { bytes: Uint8Array; mime: string } {
  if (bytes.length < 22) throw new Error("This icon file is too short to read.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  if (count === 0) throw new Error("This icon file contains no images.");
  let best = -1;
  let bestPixels = -1;
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    if (at + 16 > bytes.length) break;
    // 0 means 256 — the ICO convention for large icons.
    const w = bytes[at] === 0 ? 256 : bytes[at]!;
    const h = bytes[at + 1] === 0 ? 256 : bytes[at + 1]!;
    if (w * h > bestPixels) {
      bestPixels = w * h;
      best = at;
    }
  }
  if (best < 0) throw new Error("This icon file has no readable entries.");
  const size = view.getUint32(best + 8, true);
  const offset = view.getUint32(best + 12, true);
  if (offset + size > bytes.length || size === 0) throw new Error("This icon file is truncated.");
  const payload = bytes.subarray(offset, offset + size);
  if (payload[0] === 0x89 && payload[1] === 0x50 && payload[2] === 0x4e && payload[3] === 0x47) {
    return { bytes: payload, mime: "image/png" };
  }
  return { bytes: dibToBmp(payload), mime: "image/bmp" };
}

/**
 * Turns an icon's headerless DIB into a standalone BMP. The DIB's height
 * counts the XOR (colour) and AND (mask) bitmaps together, so it's
 * halved and the mask dropped — the colour bitmap is the picture.
 */
function dibToBmp(dib: Uint8Array): Uint8Array {
  if (dib.length < 40) throw new Error("This icon's bitmap header is incomplete.");
  const view = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const doubleHeight = view.getInt32(8, true);
  const bpp = view.getUint16(14, true);
  const height = Math.abs(doubleHeight) / 2;
  if (width <= 0 || height <= 0) throw new Error("This icon's bitmap has invalid dimensions.");
  const paletteEntries = bpp <= 8 ? view.getUint32(32, true) || 1 << bpp : 0;
  const pixelOffset = headerSize + paletteEntries * 4;
  const rowSize = Math.ceil((width * bpp) / 32) * 4;
  const colourBytes = rowSize * height;
  const out = new Uint8Array(14 + pixelOffset + colourBytes);
  const outView = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  outView.setUint32(2, out.length, true);
  outView.setUint32(10, 14 + pixelOffset, true);
  out.set(dib.subarray(0, Math.min(dib.length, pixelOffset + colourBytes)), 14);
  // Rewrite the height so it describes the colour bitmap alone.
  outView.setInt32(14 + 8, doubleHeight < 0 ? -height : height, true);
  outView.setUint32(14 + 20, colourBytes, true); // biSizeImage
  return out;
}

/* SVG ------------------------------------------------------------------ */

/**
 * Wraps encoded PNG bytes in an SVG document that draws them at their
 * natural size. This is a container change, not a vectorisation: the
 * result is a real, valid SVG that renders the same picture, but the
 * pixels stay pixels. The target is labelled accordingly so nobody
 * expects traced paths.
 */
export function svgFromPng(png: Uint8Array, width: number, height: number): Uint8Array {
  let binary = "";
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]!);
  const base64 = btoa(binary);
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image width="${width}" height="${height}" xlink:href="data:image/png;base64,${base64}"/>` +
    `</svg>\n`;
  return new TextEncoder().encode(svg);
}
