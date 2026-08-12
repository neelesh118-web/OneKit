/**
 * Netpbm pixel formats — PBM (P1/P4, 1-bit), PGM (P2/P5, grayscale),
 * PAM (P7, arbitrary depth) and X11 XBM (C-source bitmaps). Pure JS,
 * no canvas required, so every decoder/encoder is testable under node.
 *
 * All formats are honest: real pixel math, no stubs. Alpha is composited
 * or dropped exactly the way the target format requires.
 */
import type { RgbaImage } from "./raster";

/* Helpers -------------------------------------------------------------- */

function isWs(b: number): boolean {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
}

/**
 * Reads the next whitespace-separated token from the byte stream,
 * skipping `#`-to-end-of-line comments (legal anywhere in a P1–P6 header).
 */
function nextToken(
  bytes: Uint8Array,
  pos: number,
  end: number
): { token: string; pos: number } {
  while (pos < end) {
    while (pos < end && isWs(bytes[pos]!)) pos++;
    if (pos < end && bytes[pos] === 0x23) {
      while (pos < end && bytes[pos] !== 0x0a) pos++;
      continue;
    }
    const start = pos;
    while (pos < end && !isWs(bytes[pos]!)) pos++;
    if (pos > start) return { token: new TextDecoder().decode(bytes.subarray(start, pos)), pos };
    break;
  }
  throw new Error("Unexpected end of Netpbm header.");
}

/** Scales a 0..maxval sample to 0..255. */
function scale(v: number, maxval: number): number {
  return maxval === 255 ? v : Math.round((v * 255) / maxval);
}

/** Composite RGBA over white, like the other pixel encoders do. */
function composite(r: number, g: number, b: number, a: number): [number, number, number] {
  return [
    Math.round((r * a + 255 * (255 - a)) / 255),
    Math.round((g * a + 255 * (255 - a)) / 255),
    Math.round((b * a + 255 * (255 - a)) / 255)
  ];
}

/* PBM — portable bitmap, 1 bit/pixel ------------------------------------ */

/**
 * Decodes PBM (P1 ASCII or P4 binary). 1 = black, 0 = white. Binary rows
 * are padded to byte boundaries, MSB first.
 */
export function decodePbm(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 2 || bytes[0] !== 0x50 || (bytes[1] !== 0x31 && bytes[1] !== 0x34)) {
    throw new Error("Not a PBM file (expected a P1 or P4 header).");
  }
  const ascii = bytes[1] === 0x31;
  let pos = 2;
  const wTok = nextToken(bytes, pos, bytes.length);
  pos = wTok.pos;
  const hTok = nextToken(bytes, pos, bytes.length);
  pos = hTok.pos;
  const width = parseInt(wTok.token, 10);
  const height = parseInt(hTok.token, 10);
  if (!(width > 0 && height > 0)) throw new Error("This PBM file has invalid dimensions.");
  const out = new Uint8Array(width * height * 4);
  if (ascii) {
    let pixel = 0;
    while (pixel < width * height) {
      const t = nextToken(bytes, pos, bytes.length);
      pos = t.pos;
      const v = parseInt(t.token, 10);
      if (v !== 0 && v !== 1) throw new Error("This PBM file has invalid pixel data.");
      const d = pixel * 4;
      const tone = v === 1 ? 0 : 255;
      out[d] = tone; out[d + 1] = tone; out[d + 2] = tone; out[d + 3] = 255;
      pixel++;
    }
  } else {
    // Exactly one whitespace byte separates the last header token from the
    // binary raster (same convention decodePpm uses).
    if (pos < bytes.length && isWs(bytes[pos]!)) pos++;
    if (pos > 0 && bytes[pos - 1] === 0x0d && bytes[pos] === 0x0a) pos++;
    const rowBytes = Math.ceil(width / 8);
    const need = pos + rowBytes * height;
    if (need > bytes.length) throw new Error("This PBM file's pixel data is incomplete.");
    for (let y = 0; y < height; y++) {
      const rowStart = pos + y * rowBytes;
      for (let x = 0; x < width; x++) {
        const bit = (bytes[rowStart + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const d = (y * width + x) * 4;
        const tone = bit === 1 ? 0 : 255;
        out[d] = tone; out[d + 1] = tone; out[d + 2] = tone; out[d + 3] = 255;
      }
    }
  }
  return { width, height, data: out };
}

/** Encodes RGBA pixels as binary PBM (P4), thresholded on luminance. */
export function encodePbm(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const rowBytes = Math.ceil(width / 8);
  const header = new TextEncoder().encode(`P4\n${width} ${height}\n`);
  const out = new Uint8Array(header.length + rowBytes * height);
  out.set(header, 0);
  let dst = header.length;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rowBytes; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const px = x * 8 + bit;
        if (px >= width) break;
        const i = (y * width + px) * 4;
        const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0, a = data[i + 3] ?? 255;
        const [cr, cg, cb] = composite(r, g, b, a);
        const luma = (cr * 299 + cg * 587 + cb * 114) / 1000;
        if (luma < 128) byte |= 1 << (7 - bit);
      }
      out[dst++] = byte;
    }
  }
  return out;
}

/* PGM — portable graymap, 1 byte/pixel ---------------------------------- */

/**
 * Decodes PGM (P2 ASCII or P5 binary). Single channel scaled to 0..255.
 */
export function decodePgm(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 2 || bytes[0] !== 0x50 || (bytes[1] !== 0x32 && bytes[1] !== 0x35)) {
    throw new Error("Not a PGM file (expected a P2 or P5 header).");
  }
  const ascii = bytes[1] === 0x32;
  let pos = 2;
  const wTok = nextToken(bytes, pos, bytes.length);
  pos = wTok.pos;
  const hTok = nextToken(bytes, pos, bytes.length);
  pos = hTok.pos;
  const mTok = nextToken(bytes, pos, bytes.length);
  pos = mTok.pos;
  const width = parseInt(wTok.token, 10);
  const height = parseInt(hTok.token, 10);
  const maxval = parseInt(mTok.token, 10);
  if (!(width > 0 && height > 0)) throw new Error("This PGM file has invalid dimensions.");
  if (!(maxval > 0 && maxval <= 255)) throw new Error("Only 8-bit (maxval ≤ 255) PGM files are supported.");
  const out = new Uint8Array(width * height * 4);
  if (ascii) {
    let pixel = 0;
    while (pixel < width * height) {
      const t = nextToken(bytes, pos, bytes.length);
      pos = t.pos;
      const v = scale(parseInt(t.token, 10), maxval);
      const d = pixel * 4;
      out[d] = v; out[d + 1] = v; out[d + 2] = v; out[d + 3] = 255;
      pixel++;
    }
  } else {
    // Exactly one whitespace byte separates maxval from the binary raster.
    if (pos < bytes.length && isWs(bytes[pos]!)) pos++;
    if (pos > 0 && bytes[pos - 1] === 0x0d && bytes[pos] === 0x0a) pos++;
    if (pos + width * height > bytes.length) throw new Error("This PGM file's pixel data is incomplete.");
    for (let i = 0; i < width * height; i++) {
      const v = scale(bytes[pos + i]!, maxval);
      const d = i * 4;
      out[d] = v; out[d + 1] = v; out[d + 2] = v; out[d + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Encodes RGBA pixels as binary PGM (P5), luminance 0..255. */
export function encodePgm(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const header = new TextEncoder().encode(`P5\n${width} ${height}\n255\n`);
  const out = new Uint8Array(header.length + width * height);
  out.set(header, 0);
  let dst = header.length;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const r = data[p] ?? 0, g = data[p + 1] ?? 0, b = data[p + 2] ?? 0, a = data[p + 3] ?? 255;
    const [cr, cg, cb] = composite(r, g, b, a);
    out[dst++] = Math.round((cr * 299 + cg * 587 + cb * 114) / 1000);
  }
  return out;
}

/* PAM — portable arbitrary map, P7 -------------------------------------- */

/**
 * Decodes PAM (P7): `P7` then WIDTH/HEIGHT/DEPTH/MAXVAL/TUPLTYPE lines and
 * an ENDHDR line, then binary tuples. Depths 1 (gray), 2 (gray+alpha),
 * 3 (RGB) and 4 (RGBA) are supported.
 */
export function decodePam(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x37) {
    throw new Error("Not a PAM file (expected a P7 header).");
  }
  let pos = 2;
  let width = 0, height = 0, depth = 0, maxval = 0;
  let tuple = "";
  const endMarker = "ENDHDR";
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const lines = text.split(/\r?\n/);
  let lineIdx = 0;
  let headerEnd = -1;
  for (; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === endMarker) { headerEnd = lineIdx; break; }
    const sp = line.indexOf(" ");
    const key = sp === -1 ? line : line.slice(0, sp);
    const val = sp === -1 ? "" : line.slice(sp + 1).trim();
    if (key === "WIDTH") width = parseInt(val, 10);
    else if (key === "HEIGHT") height = parseInt(val, 10);
    else if (key === "DEPTH") depth = parseInt(val, 10);
    else if (key === "MAXVAL") maxval = parseInt(val, 10);
    else if (key === "TUPLTYPE") tuple = val;
  }
  if (headerEnd === -1) throw new Error("This PAM file has no ENDHDR line.");
  if (!(width > 0 && height > 0)) throw new Error("This PAM file has invalid dimensions.");
  if (!(depth >= 1 && depth <= 4)) throw new Error("Unsupported PAM depth — expected 1–4 channels.");
  if (!(maxval > 0 && maxval <= 255)) throw new Error("Only 8-bit (maxval ≤ 255) PAM files are supported.");
  // Byte offset just past the ENDHDR line, including its trailing newline.
  let cursor = 0;
  for (let i = 0; i <= headerEnd; i++) cursor = text.indexOf("\n", cursor) + 1;
  const dataStart = cursor;
  const total = width * height * depth;
  if (dataStart + total > bytes.length) throw new Error("This PAM file's pixel data is incomplete.");
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = dataStart + i * depth;
    const d = i * 4;
    let r = 0, g = 0, b = 0, a = 255;
    const c0 = scale(bytes[s]!, maxval);
    if (depth === 1) { r = g = b = c0; }
    else if (depth === 2) { r = g = b = c0; a = scale(bytes[s + 1]!, maxval); }
    else if (depth === 3) { r = c0; g = scale(bytes[s + 1]!, maxval); b = scale(bytes[s + 2]!, maxval); }
    else { r = c0; g = scale(bytes[s + 1]!, maxval); b = scale(bytes[s + 2]!, maxval); a = scale(bytes[s + 3]!, maxval); }
    out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = a;
  }
  return { width, height, data: out };
}

/** Encodes RGBA pixels as PAM (P7), DEPTH 4 / TUPLTYPE RGB_ALPHA. */
export function encodePam(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const header = new TextEncoder().encode(
    `P7\nWIDTH ${width}\nHEIGHT ${height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`
  );
  const out = new Uint8Array(header.length + width * height * 4);
  out.set(header, 0);
  let dst = header.length;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    out[dst++] = data[p] ?? 0;
    out[dst++] = data[p + 1] ?? 0;
    out[dst++] = data[p + 2] ?? 0;
    out[dst++] = data[p + 3] ?? 255;
  }
  return out;
}

/* XBM — X11 bitmap, C source -------------------------------------------- */

const XBM_DEFINE = /#define\s+\w+_(\w+)\s+(\d+)/g;
const XBM_BITS = /static\s+(?:unsigned\s+)?char\s+\w+_bits\[\]\s*=\s*\{([^}]*)\}/;

/**
 * Decodes an XBM file (the C-source bitmap format: `#define name_width N`,
 * `#define name_height N`, `static unsigned char name_bits[] = { ... };`).
 * Bits are MSB-first, 1 = black; each row is padded to a byte boundary.
 */
export function decodeXbm(bytes: Uint8Array): RgbaImage {
  const text = new TextDecoder().decode(bytes);
  if (!text.includes("#define") || !text.includes("_bits")) {
    throw new Error("Not an XBM file (expected #define width/height and a _bits array).");
  }
  let width = 0, height = 0;
  let m: RegExpExecArray | null;
  XBM_DEFINE.lastIndex = 0;
  while ((m = XBM_DEFINE.exec(text)) !== null) {
    if (m[1] === "width") width = parseInt(m[2]!, 10);
    else if (m[1] === "height") height = parseInt(m[2]!, 10);
  }
  if (!(width > 0 && height > 0)) throw new Error("This XBM file has invalid dimensions.");
  const bitsMatch = XBM_BITS.exec(text);
  if (!bitsMatch) throw new Error("This XBM file has no _bits array.");
  const values = bitsMatch[1]!.split(",").map((t) => {
    const n = t.trim();
    if (!n) return null;
    const parsed = parseInt(n, 0);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 255) throw new Error("This XBM file has invalid byte values.");
    return parsed;
  }).filter((v): v is number => v !== null);
  const rowBytes = Math.ceil(width / 8);
  if (values.length < rowBytes * height) throw new Error("This XBM file's pixel data is incomplete.");
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = (values[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
      const d = (y * width + x) * 4;
      const tone = bit === 1 ? 0 : 255;
      out[d] = tone; out[d + 1] = tone; out[d + 2] = tone; out[d + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Encodes RGBA pixels as an XBM C-source file, 1 = black (X11 convention). */
export function encodeXbm(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const rowBytes = Math.ceil(width / 8);
  const bits: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rowBytes; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const px = x * 8 + bit;
        if (px >= width) break;
        const i = (y * width + px) * 4;
        const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0, a = data[i + 3] ?? 255;
        const [cr, cg, cb] = composite(r, g, b, a);
        const luma = (cr * 299 + cg * 587 + cb * 114) / 1000;
        if (luma < 128) byte |= 1 << (7 - bit);
      }
      bits.push(byte);
    }
  }
  const hex = bits.map((v) => "0x" + v.toString(16).padStart(2, "0")).join(", ");
  const src =
    `#define xbm_width ${width}\n` +
    `#define xbm_height ${height}\n` +
    `static unsigned char xbm_bits[] = {\n  ${hex}\n};\n`;
  return new TextEncoder().encode(src);
}
