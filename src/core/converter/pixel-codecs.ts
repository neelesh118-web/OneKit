/**
 * More real pixel formats, each implemented against its public spec —
 * QOI (Quite OK Image), Farbfeld (ImageMagick's raw RGBA container) and
 * ZSoft PCX (the classic 24-bit / 8-bit palette format). Pure JS, no
 * canvas, so every decoder/encoder is testable under node.
 *
 * All formats are honest: real pixel math, no stubs. Alpha is kept where
 * the format has it and composited/dropped where it doesn't.
 */
import type { RgbaImage } from "./raster";

/* QOI — Quite OK Image ------------------------------------------------ */

const QOI_MAGIC = 0x716f6966; // "qoif"
const QOI_END = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01] as const;

function qoiHash(r: number, g: number, b: number, a: number): number {
  return (r * 3 + g * 5 + b * 7 + a * 11) % 64;
}

/**
 * Decodes a QOI image. Supports both RGB (channels=3) and RGBA
 * (channels=4) encodings; the decoded pixels are always RGBA.
 */
export function decodeQoi(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 14) throw new Error("This QOI file is too short to be valid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== QOI_MAGIC) {
    throw new Error("Not a QOI file (missing the qoif magic).");
  }
  const width = view.getUint32(4, false);
  const height = view.getUint32(8, false);
  if (width === 0 || height === 0 || width * height > 100_000_000) {
    throw new Error("This QOI file has invalid dimensions.");
  }
  const channels = bytes[12]!; // 3 = RGB, 4 = RGBA
  if (channels !== 3 && channels !== 4) {
    throw new Error("This QOI file declares an unsupported channel count.");
  }
  const total = width * height;
  const data = new Uint8Array(total * 4);
  const index = new Array<[number, number, number, number]>(64);
  // QOI's previous-pixel starts as opaque black.
  let pr = 0, pg = 0, pb = 0, pa = 255;
  let pos = 14;
  let px = 0;
  while (px < total && pos < bytes.length) {
    const b1 = bytes[pos++]!;
    let r = pr, g = pg, b = pb, a = pa;
    if (b1 === 0xfe) {
      // RGB chunk
      if (pos + 3 > bytes.length) throw new Error("This QOI file ends inside an RGB chunk.");
      r = bytes[pos++]!; g = bytes[pos++]!; b = bytes[pos++]!;
    } else if (b1 === 0xff) {
      // RGBA chunk
      if (pos + 4 > bytes.length) throw new Error("This QOI file ends inside an RGBA chunk.");
      r = bytes[pos++]!; g = bytes[pos++]!; b = bytes[pos++]!; a = bytes[pos++]!;
    } else if ((b1 & 0xc0) === 0xc0) {
      // RUN chunk: repeat the previous pixel (count+1) times
      const run = (b1 & 0x3f) + 1;
      const d = px * 4;
      for (let i = 0; i < run && px < total; i++) {
        data[d + i * 4] = pr; data[d + i * 4 + 1] = pg; data[d + i * 4 + 2] = pb; data[d + i * 4 + 3] = pa;
      }
      const d2 = px * 4;
      const hash = qoiHash(pr, pg, pb, pa);
      index[hash] = [pr, pg, pb, pa];
      px += run;
      continue;
    } else if ((b1 & 0xc0) === 0x80) {
      // LUMA chunk: 2 bytes, green delta then red/blue offsets
      if (pos + 1 > bytes.length) throw new Error("This QOI file ends inside a LUMA chunk.");
      const b2 = bytes[pos++]!;
      const dg = (b1 & 0x3f) - 32;
      const dr = ((b2 >> 4) & 0x0f) - 8 + dg;
      const db = (b2 & 0x0f) - 8 + dg;
      r = pr + dr; g = pg + dg; b = pb + db;
    } else if ((b1 & 0xc0) === 0x40) {
      // DIFF chunk: 2-bit deltas
      const dr = ((b1 >> 4) & 0x03) - 2;
      const dg = ((b1 >> 2) & 0x03) - 2;
      const db = (b1 & 0x03) - 2;
      r = pr + dr; g = pg + dg; b = pb + db;
    } else {
      // INDEX chunk
      const idx = index[b1 & 0x3f];
      if (!idx) throw new Error("This QOI file references an index slot that was never written.");
      r = idx[0]; g = idx[1]; b = idx[2]; a = idx[3];
    }
    const d = px * 4;
    data[d] = r; data[d + 1] = g; data[d + 2] = b; data[d + 3] = a;
    index[qoiHash(r, g, b, a)] = [r, g, b, a];
    pr = r; pg = g; pb = b; pa = a;
    px++;
  }
  if (px < total) throw new Error("This QOI file's pixel data is incomplete.");
  return { width, height, data };
}

/** Encodes RGBA pixels as a QOI image (RGBA channels, sRGB colorspace). */
export function encodeQoi(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const total = width * height;
  const out = new Uint8Array(14 + total * 5 + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, QOI_MAGIC, false);
  view.setUint32(4, width, false);
  view.setUint32(8, height, false);
  out[12] = 4; // RGBA
  out[13] = 0; // sRGB
  const index = new Array<[number, number, number, number]>(64);
  let pos = 14;
  let pr = 0, pg = 0, pb = 0, pa = 255;
  let run = 0;

  const emitRun = (): void => {
    if (run > 0) {
      // RUN opcodes span 0xc0–0xfd; 0xfe/0xff are reserved for the RGB/
      // RGBA chunks, so a run may only cover 1..62 pixels (run-1: 0..61).
      out[pos++] = 0xc0 | Math.min(run - 1, 61);
      run = 0;
    }
  };

  for (let i = 0; i < total; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const a = data[i * 4 + 3]!;
    if (r === pr && g === pg && b === pb && a === pa) {
      run++;
      if (run >= 62) emitRun();
      continue;
    }
    emitRun();
    const hash = qoiHash(r, g, b, a);
    const prev = index[hash];
    if (prev && prev[0] === r && prev[1] === g && prev[2] === b && prev[3] === a) {
      out[pos++] = hash;
    } else {
      const dr = r - pr, dg = g - pg, db = b - pb;
      if (a === pa && dr >= -2 && dr <= 1 && dg >= -2 && dg <= 1 && db >= -2 && db <= 1) {
        out[pos++] = 0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2);
      } else if (a === pa) {
        const drdg = dr - dg, dbdg = db - dg;
        if (dg >= -32 && dg <= 31 && drdg >= -8 && drdg <= 7 && dbdg >= -8 && dbdg <= 7) {
          out[pos++] = 0x80 | (dg + 32);
          out[pos++] = ((drdg + 8) << 4) | (dbdg + 8);
        } else if (a === 255) {
          out[pos++] = 0xfe; out[pos++] = r; out[pos++] = g; out[pos++] = b;
        } else {
          out[pos++] = 0xff; out[pos++] = r; out[pos++] = g; out[pos++] = b; out[pos++] = a;
        }
      } else {
        out[pos++] = 0xff; out[pos++] = r; out[pos++] = g; out[pos++] = b; out[pos++] = a;
      }
    }
    index[hash] = [r, g, b, a];
    pr = r; pg = g; pb = b; pa = a;
  }
  emitRun();
  for (const byte of QOI_END) out[pos++] = byte;
  return out.slice(0, pos);
}

/* Farbfeld — ImageMagick's raw RGBA container -------------------------- */

/** Decodes a Farbfeld image (16-bit big-endian RGBA, no compression). */
export function decodeFarbfeld(bytes: Uint8Array): RgbaImage {
  const magic = "farbfeld";
  if (bytes.length < 16) throw new Error("This Farbfeld file is too short to be valid.");
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== magic.charCodeAt(i)) {
      throw new Error("Not a Farbfeld file (missing the farbfeld magic).");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(8, false);
  const height = view.getUint32(12, false);
  if (width === 0 || height === 0 || width * height > 100_000_000) {
    throw new Error("This Farbfeld file has invalid dimensions.");
  }
  const need = 16 + width * height * 8;
  if (bytes.length < need) throw new Error("This Farbfeld file's pixel data is incomplete.");
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = 16 + i * 8;
    data[i * 4] = view.getUint16(p, false) >> 8;
    data[i * 4 + 1] = view.getUint16(p + 2, false) >> 8;
    data[i * 4 + 2] = view.getUint16(p + 4, false) >> 8;
    data[i * 4 + 3] = view.getUint16(p + 6, false) >> 8;
  }
  return { width, height, data };
}

/** Encodes RGBA pixels as a Farbfeld image (16-bit big-endian channels). */
export function encodeFarbfeld(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const out = new Uint8Array(16 + width * height * 8);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) out[i] = "farbfeld".charCodeAt(i);
  view.setUint32(8, width, false);
  view.setUint32(12, height, false);
  for (let i = 0; i < width * height; i++) {
    const p = 16 + i * 8;
    view.setUint16(p, data[i * 4]! * 257, false);
    view.setUint16(p + 2, data[i * 4 + 1]! * 257, false);
    view.setUint16(p + 4, data[i * 4 + 2]! * 257, false);
    view.setUint16(p + 6, data[i * 4 + 3]! * 257, false);
  }
  return out;
}

/* PCX — ZSoft Paintbrush ------------------------------------------------ */

/** True when the bytes carry a ZSoft PCX image. */
export function isPcx(bytes: Uint8Array): boolean {
  return bytes.length >= 128 && bytes[0] === 0x0a && (bytes[1] === 5 || bytes[1] === 3 || bytes[1] === 0);
}

/** Decodes 8-bit palette and 24-bit truecolor PCX files (RLE encoded). */
export function decodePcx(bytes: Uint8Array): RgbaImage {
  if (!isPcx(bytes)) throw new Error("Not a PCX file (expected the ZSoft header).");
  const bpp = bytes[3]!;
  const xmin = bytes[4]! | (bytes[5]! << 8);
  const ymin = bytes[6]! | (bytes[7]! << 8);
  const xmax = bytes[8]! | (bytes[9]! << 8);
  const ymax = bytes[10]! | (bytes[11]! << 8);
  const planes = bytes[65]!;
  const bytesPerLine = bytes[66]! | (bytes[67]! << 8);
  if (bpp !== 8) throw new Error("Only 8-bit PCX files are supported.");
  const width = xmax - xmin + 1;
  const height = ymax - ymin + 1;
  if (!(width > 0 && height > 0 && width * height < 100_000_000)) {
    throw new Error("This PCX file has invalid dimensions.");
  }
  // RLE-decoded planes: 1 plane for palette images, 3 for truecolor.
  const decoded: number[][] = [];
  let pos = 128;
  const rowSize = bytesPerLine;
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    while (row.length < rowSize * planes) {
      if (pos >= bytes.length) throw new Error("This PCX file's pixel data is incomplete.");
      const b = bytes[pos++]!;
      if ((b & 0xc0) === 0xc0) {
        const count = b & 0x3f;
        if (pos >= bytes.length) throw new Error("This PCX file ends inside a run.");
        const v = bytes[pos++]!;
        for (let i = 0; i < count; i++) row.push(v);
      } else {
        row.push(b);
      }
    }
    decoded.push(row);
  }
  const data = new Uint8Array(width * height * 4);
  if (planes === 3) {
    for (let y = 0; y < height; y++) {
      const row = decoded[y]!;
      for (let x = 0; x < width; x++) {
        const d = (y * width + x) * 4;
        data[d] = row[x]!;
        data[d + 1] = row[x + bytesPerLine]!;
        data[d + 2] = row[x + bytesPerLine * 2]!;
        data[d + 3] = 255;
      }
    }
  } else if (planes === 1) {
    // 8-bit palette lives after a 0x0c marker at the end of the file.
    const palPos = bytes.length - 768;
    if (palPos < 128 || bytes[palPos - 1] !== 0x0c) {
      throw new Error("This PCX file has no trailing 256-color palette.");
    }
    for (let y = 0; y < height; y++) {
      const row = decoded[y]!;
      for (let x = 0; x < width; x++) {
        const idx = row[x]!;
        const p = palPos + idx * 3;
        const d = (y * width + x) * 4;
        data[d] = bytes[p]!;
        data[d + 1] = bytes[p + 1]!;
        data[d + 2] = bytes[p + 2]!;
        data[d + 3] = 255;
      }
    }
  } else {
    throw new Error(`Unsupported PCX color planes (${planes}).`);
  }
  return { width, height, data };
}

/** Encodes RGBA pixels as a 24-bit truecolor PCX (ZSoft, RLE). */
export function encodePcx(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const header = new Uint8Array(128);
  header[0] = 0x0a; // manufacturer
  header[1] = 5; // version 5
  header[2] = 1; // RLE
  header[3] = 8; // bits per plane
  header[8] = (width - 1) & 0xff; header[9] = (width - 1) >> 8;
  header[10] = (height - 1) & 0xff; header[11] = (height - 1) >> 8;
  header[12] = width & 0xff; header[13] = width >> 8;
  header[14] = height & 0xff; header[15] = height >> 8;
  header[65] = 3; // 3 color planes
  header[66] = width & 0xff; header[67] = width >> 8;
  header[68] = 2; // color palette type

  const rle = (out: number[], src: number[]): void => {
    let i = 0;
    while (i < src.length) {
      const v = src[i]!;
      let run = 1;
      while (i + run < src.length && src[i + run] === v && run < 63) run++;
      if (run > 1 || v >= 0xc0) {
        out.push(0xc0 | run);
        out.push(v);
      } else {
        out.push(v);
      }
      i += run;
    }
  };

  const body: number[] = [];
  for (let y = 0; y < height; y++) {
    const r: number[] = [], g: number[] = [], b: number[] = [];
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      r.push(data[d]!); g.push(data[d + 1]!); b.push(data[d + 2]!);
    }
    rle(body, r);
    rle(body, g);
    rle(body, b);
  }
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  for (let i = 0; i < body.length; i++) out[128 + i] = body[i]!;
  return out;
}
