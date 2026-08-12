/**
 * XPM (X PixMap) and WBMP (Wireless Bitmap) codecs — pure JS, no canvas.
 *
 * XPM is the classic Unix text image: a C-style header, a color table, and
 * rows of 1-char-per-pixel codes. WBMP is the WAP 1-bit bitmap: a tiny
 * header with multi-byte dimensions and MSB-first, row-padded pixels.
 */
import type { RgbaImage } from "./raster";

/* XPM — X PixMap ------------------------------------------------------ */

const XPM_MAGIC = "/* XPM */";

/** True when the bytes start with the XPM comment header. */
export function isXpm(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false;
  const head = new TextDecoder().decode(bytes.slice(0, 10));
  return head.startsWith("/* XPM");
}

/** Parses the XPM values line: `"width height ncolors cpp"`. */
function parseXpmValues(line: string): { width: number; height: number; ncolors: number; cpp: number } {
  const nums = line.match(/"?\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (!nums) throw new Error("Invalid XPM: missing the dimensions line.");
  return {
    width: Number(nums[1]),
    height: Number(nums[2]),
    ncolors: Number(nums[3]),
    cpp: Number(nums[4]),
  };
}

export function decodeXpm(bytes: Uint8Array): RgbaImage {
  const text = new TextDecoder().decode(bytes);
  if (!text.includes(XPM_MAGIC)) throw new Error("Not an XPM image (missing the /* XPM */ header).");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"') || l.startsWith('/*'));
  const valuesIdx = lines.findIndex((l) => /^\d+ \d+ \d+ \d+/.test(l.replace(/^"/, "")));
  if (valuesIdx < 0) throw new Error("Invalid XPM: missing the dimensions line.");
  const { width, height, ncolors, cpp } = parseXpmValues(lines[valuesIdx]!.replace(/^"/, "").replace(/",?$/, ""));
  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
    throw new Error(`Invalid XPM dimensions: ${width} x ${height}.`);
  }
  // Color table: `"code chars" [key chars] [key c color...]`
  const colorLines = lines.slice(valuesIdx + 1, valuesIdx + 1 + ncolors);
  const palette = new Map<string, [number, number, number, number]>();
  for (const cl of colorLines) {
    const body = cl.replace(/^"/, "").replace(/",?$/, "");
    const m = body.match(/^(\S{1,4})\s+.*?\bc\s+(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|None|none|\w+)/);
    if (!m || !m[2]) continue;
    const code = m[1]!;
    const color = m[2]!;
    if (/^#([0-9a-fA-F]{6})$/.test(color)) {
      const hex = color.slice(1);
      palette.set(code, [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255,
      ]);
    } else if (/^#([0-9a-fA-F]{3})$/.test(color)) {
      const hex = color.slice(1);
      palette.set(code, [
        parseInt(hex[0]! + hex[0], 16),
        parseInt(hex[1]! + hex[1], 16),
        parseInt(hex[2]! + hex[2], 16),
        255,
      ]);
    } else if (/none/i.test(color)) {
      palette.set(code, [0, 0, 0, 0]);
    }
    // Named colors (red, white, …) are skipped — we keep only hex/none.
  }
  const pixelLines = lines.slice(valuesIdx + 1 + ncolors, valuesIdx + 1 + ncolors + height);
  if (pixelLines.length < height) throw new Error("Invalid XPM: not enough pixel rows.");
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = pixelLines[y]!.replace(/^"/, "").replace(/",?$/, "");
    for (let x = 0; x < width; x++) {
      const code = row.slice(x * cpp, x * cpp + cpp);
      const c = palette.get(code);
      const d = (y * width + x) * 4;
      if (c) {
        data[d] = c[0];
        data[d + 1] = c[1];
        data[d + 2] = c[2];
        data[d + 3] = c[3];
      } else {
        data[d + 3] = 0; // unmapped → transparent
      }
    }
  }
  return { width, height, data };
}

/** Builds a palette (≤256 entries incl. a transparency slot if needed). */
function buildPalette(image: RgbaImage): { palette: [number, number, number, number][]; map: Map<number, number> } {
  const { width, height, data } = image;
  const keyOf = (d: number): number => (data[d]! << 24) | (data[d + 1]! << 16) | (data[d + 2]! << 8) | data[d + 3]!;
  const seen = new Map<number, number>();
  const palette: [number, number, number, number][] = [];
  const map = new Map<number, number>();
  const quantize = (v: number): number => Math.min(255, v + (v >> 4)); // 4-bit-ish rounding for stability
  for (let p = 0; p < width * height; p++) {
    const d = p * 4;
    const key = keyOf(d);
    let idx = map.get(key);
    if (idx === undefined) {
      if (palette.length < 255) {
        idx = palette.length;
        palette.push([data[d]!, data[d + 1]!, data[d + 2]!, data[d + 3]!]);
        map.set(key, idx);
      } else {
        // Over budget — quantize to 4 bits per channel and dedupe.
        const qk = (quantize(data[d]!) << 12) | (quantize(data[d + 1]!) << 8) | (quantize(data[d + 2]!) << 4) | (data[d + 3]! === 0 ? 0 : 0xff);
        idx = map.get(qk);
        if (idx === undefined) {
          idx = palette.length;
          palette.push([data[d]!, data[d + 1]!, data[d + 2]!, data[d + 3]!]);
          map.set(qk, idx);
        }
      }
    }
    seen.set(key, idx);
  }
  return { palette, map: seen };
}

export function encodeXpm(image: RgbaImage, title = "image"): Uint8Array {
  const { width, height } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const { palette } = buildPalette(image);
  const hasAlpha = palette.some(([, , , a]) => a !== 255);
  // Transparency is already a palette entry ([0,0,0,0]) — it's written as
  // "c None", so the declared color count is just the palette size.
  const colorCount = palette.length;
  if (colorCount > 256) throw new Error("Too many colors for XPM (max 256).");
  const codes = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const codeFor = (i: number): string => codes[i] ?? `x${i}`;
  const colorToIndex = new Map<number, number>();
  const pColor: string[] = [];
  palette.forEach((c, i) => {
    colorToIndex.set((c[0]! << 24) | (c[1]! << 16) | (c[2]! << 8) | c[3]!, i);
    pColor.push(
      hasAlpha && c[3] === 0
        ? `${codeFor(i)} c None`
        : `${codeFor(i)} c #${[c[0], c[1], c[2]].map((v) => v!.toString(16).padStart(2, "0")).join("")}`
    );
  });
  const lines: string[] = [
    "/* XPM */",
    "static char *image[] = {",
    `"${width} ${height} ${colorCount} 1"`,
    ...pColor.map((c) => `"${c}",`),
  ];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      const key = (image.data[d]! << 24) | (image.data[d + 1]! << 16) | (image.data[d + 2]! << 8) | image.data[d + 3]!;
      row += codeFor(colorToIndex.get(key) ?? 0);
    }
    lines.push(`"${row}",`);
  }
  lines.push("};");
  return new TextEncoder().encode(lines.join("\n") + "\n");
}

/* WBMP — Wireless Bitmap ---------------------------------------------- */

/** True when the bytes carry a level-0 B/W WBMP header (type 0x00, fixed 0x00). */
export function isWbmp(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x00 && bytes[1] === 0x00;
}

function readWbmpInt(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let i = offset;
  for (let guard = 0; guard < 5; guard++) {
    const b = bytes[i]!;
    value = (value << 7) | (b & 0x7f);
    i++;
    if ((b & 0x80) === 0) break;
  }
  return { value, next: i };
}

export function decodeWbmp(bytes: Uint8Array): RgbaImage {
  if (!isWbmp(bytes)) throw new Error("Not a WBMP image (missing the type/fixed header).");
  const w = readWbmpInt(bytes, 2);
  const h = readWbmpInt(bytes, w.next);
  const width = w.value;
  const height = h.value;
  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
    throw new Error(`Invalid WBMP dimensions: ${width} x ${height}.`);
  }
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(width * height * 4);
  let pos = h.next;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = bytes[pos + Math.floor(x / 8)] ?? 0;
      const bit = (byte >> (7 - (x % 8))) & 1;
      const d = (y * width + x) * 4;
      const v = bit === 1 ? 0 : 255; // WBMP: 1 = white, 0 = black
      data[d] = v;
      data[d + 1] = v;
      data[d + 2] = v;
      data[d + 3] = 255;
    }
    pos += rowBytes;
  }
  return { width, height, data };
}

function writeWbmpInt(value: number): number[] {
  const groups: number[] = [];
  do {
    groups.unshift(value & 0x7f);
    value = Math.floor(value / 128);
  } while (value > 0);
  return groups.map((g, i) => (i === groups.length - 1 ? g : g | 0x80));
}

export function encodeWbmp(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const rowBytes = Math.ceil(width / 8);
  const header: number[] = [0x00, 0x00, ...writeWbmpInt(width), ...writeWbmpInt(height)];
  const pixels = new Uint8Array(header.length + rowBytes * height);
  pixels.set(header, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      const lum = (data[d]! * 299 + data[d + 1]! * 587 + data[d + 2]! * 114) / 1000;
      const bit = lum > 128 ? 0 : 1; // WBMP: 1 = white, 0 = black
      const byteIdx = header.length + y * rowBytes + Math.floor(x / 8);
      if (bit === 1) pixels[byteIdx] = pixels[byteIdx]! | (1 << (7 - (x % 8)));
    }
  }
  return pixels;
}
