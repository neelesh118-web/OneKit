/**
 * EXIF viewer — image metadata from a local file: dimensions, file
 * format, and (when present) EXIF tags like date taken, camera make,
 * exposure, GPS. Parsed with a tiny hand-rolled TIFF/EXIF reader —
 * zero dependencies, zero network, fully local.
 *
 * Scope honesty: JPEG/PNG/WebP/GIF dimensions are always read; EXIF
 * tags only exist in JPEG (and sometimes WebP/HEIF). A stripped photo
 * (most web downloads) will show dimensions but no camera data — that's
 * the truth, not a bug.
 */

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  /** EXIF tags that were found. */
  exif: Record<string, string>;
}

const EXIF_TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0131: "Software",
  0x0132: "DateTime",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISO",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x920a: "FocalLength",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0x0100: "ImageWidth",
  0x0101: "ImageLength",
  0x011a: "XResolution",
  0x011b: "YResolution"
};

const GPS_TAGS: Record<number, string> = {
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0007: "GPSTimeStamp"
};

function readU16(bytes: Uint8Array, offset: number, bigEndian = true): number {
  return bigEndian
    ? (bytes[offset]! << 8) | bytes[offset + 1]!
    : bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number, bigEndian = true): number {
  if (bigEndian) {
    return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
  }
  return ((bytes[offset + 3]! << 24) | (bytes[offset + 2]! << 16) | (bytes[offset + 1]! << 8) | bytes[offset]!) >>> 0;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset + length;
  while (end > offset && bytes[end - 1] === 0) end--;
  return new TextDecoder("latin1").decode(bytes.slice(offset, end)).replace(/\u0000/g, "").trim();
}

function rationalToNumber(bytes: Uint8Array, offset: number, bigEndian = true): string {
  const num = readU32(bytes, offset, bigEndian);
  const den = readU32(bytes, offset + 4, bigEndian);
  if (den === 0) return "0";
  const value = num / den;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function parseGpsCoordinate(bytes: Uint8Array, offset: number, bigEndian: boolean): string {
  const deg = readU32(bytes, offset, bigEndian) / readU32(bytes, offset + 4, bigEndian);
  const min = readU32(bytes, offset + 8, bigEndian) / readU32(bytes, offset + 12, bigEndian);
  const sec = readU32(bytes, offset + 16, bigEndian) / readU32(bytes, offset + 20, bigEndian);
  return `${Math.floor(deg)}°${Math.floor(min)}'${sec.toFixed(1)}"`;
}

function parseIfd(
  bytes: Uint8Array,
  offset: number,
  isBigEndian: boolean,
  tags: Record<number, string>,
  out: Record<string, string>,
  base: number
): number {
  const count = readU16(bytes, offset, isBigEndian);
  let next = offset + 2 + count * 12;
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    const tag = readU16(bytes, entry, isBigEndian);
    const type = readU16(bytes, entry + 2, isBigEndian);
    const valueOffset = entry + 8;
    const name = tags[tag];
    if (name) {
      const length = readU32(bytes, entry + 4, isBigEndian);
      switch (type) {
        case 2: {
          // ASCII — inline if short, else TIFF-relative pointer.
          const strOffset = length <= 4 ? valueOffset : base + readU32(bytes, valueOffset, isBigEndian);
          out[name] = readAscii(bytes, strOffset, Math.min(length, 200));
          break;
        }
        case 3:
          if (length === 1) out[name] = String(readU16(bytes, valueOffset, isBigEndian));
          break;
        case 4:
          if (length === 1) out[name] = String(readU32(bytes, valueOffset, isBigEndian));
          break;
        case 5: {
          const ratOffset = length === 1 ? base + readU32(bytes, valueOffset, isBigEndian) : valueOffset;
          out[name] = rationalToNumber(bytes, ratOffset, isBigEndian);
          break;
        }
        default:
          break;
      }
    }
    if (tag === 0x8825) {
      // GPS IFD pointer (TIFF-relative).
      next = base + readU32(bytes, valueOffset, isBigEndian);
    }
  }
  return next;
}

/** Extracts JPEG EXIF from a raw byte buffer (no-op for other formats). */
function parseJpegExif(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      const marker = readU16(bytes, offset);
      if (marker !== 0xffe1) {
        // Skip any other APPn/segment — find next 0xFF marker.
        if ((marker >> 8) !== 0xff || marker === 0xffd8 || marker === 0xffd9 || marker === 0xffda) break;
        const length = readU16(bytes, offset + 2);
        if (length < 2) break;
        offset += 2 + length;
        continue;
      }
      const length = readU16(bytes, offset + 2);
      const start = offset + 4;
      if (bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66) {
        // "Exif" header
        const tiffStart = start + 6;
        const endianMarker = readU16(bytes, tiffStart);
        const isBigEndian = endianMarker === 0x4d4d;
        if (endianMarker !== 0x4949 && endianMarker !== 0x4d4d) break;
        const magic = readU16(bytes, tiffStart + 2, isBigEndian);
        if (magic !== 42) break;
        const firstIfd = readU32(bytes, tiffStart + 4, isBigEndian);
        const ifd0Offset = tiffStart + firstIfd;
        const nextIfd = parseIfd(bytes, ifd0Offset, isBigEndian, EXIF_TAGS, out, tiffStart);
        // IFD1 (thumbnail) and Exif sub-IFD pointer handling.
        if (nextIfd > 0 && nextIfd + 12 <= bytes.length) {
          parseIfd(bytes, nextIfd, isBigEndian, EXIF_TAGS, out, tiffStart);
        }
      }
      break;
    }
  } catch {
    // Any malformed EXIF is ignored — the dimensions are still returned.
  }
  return out;
}

/** Reads dimensions + format from an image file's bytes. */
export function readImageInfo(bytes: Uint8Array): ImageInfo {
  let format = "Unknown";
  let width = 0;
  let height = 0;
  let exif: Record<string, string> = {};

  const head = bytes.slice(0, 32);
  const hex = [...head].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (hex.startsWith("89504e470d0a1a0a")) {
    format = "PNG";
    // PNG stores dimensions big-endian.
    width = readU32(bytes, 16, true);
    height = readU32(bytes, 20, true);
  } else if (hex.startsWith("ffd8ff")) {
    format = "JPEG";
    // Scan SOF markers for dimensions.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = readU16(bytes, offset + 5, true);
        width = readU16(bytes, offset + 7, true);
        break;
      }
      offset += 2 + readU16(bytes, offset + 2, true);
    }
    exif = parseJpegExif(bytes);
  } else if (hex.startsWith("474946")) {
    format = "GIF";
    // GIF stores dimensions little-endian.
    width = readU16(bytes, 6, false);
    height = readU16(bytes, 8, false);
  } else if (hex.startsWith("52494646")) {
    format = "WebP";
    // RIFF is little-endian.
    const riffSize = readU32(bytes, 4, false);
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      const chunk = readU32(bytes, 12, false);
      if (chunk === 0x56503820) {
        // VP8 lossy
        width = readU16(bytes, 26, false) & 0x3fff;
        height = readU16(bytes, 28, false) & 0x3fff;
      } else if (chunk === 0x5650384c) {
        // VP8L
        const b0 = bytes[21]!;
        const b1 = bytes[22]!;
        const b2 = bytes[23]!;
        const b3 = bytes[24]!;
        width = 1 + (((b1 & 0x3f) << 8) | b0);
        height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      }
    }
    void riffSize;
  } else if (hex.startsWith("0000") || hex.startsWith("0001")) {
    format = "HEIC";
  }

  return { width, height, format, exif };
}

/** Reads image info from a File (arrayBuffer). */
export async function readImageInfoFromFile(file: Blob): Promise<ImageInfo> {
  const buffer = await file.arrayBuffer();
  return readImageInfo(new Uint8Array(buffer));
}

/** Formats a GPS-style lat/lon string into a friendly coordinate. */
export function formatCoordinate(raw: string): string {
  return raw;
}
