/**
 * DirectDraw Surface (DDS) reading and writing — the texture format game
 * tools trade in. Reading covers the block-compressed flavours (BC1/DXT1,
 * BC2/DXT3, BC3/DXT5) and plain uncompressed surfaces; writing produces
 * an uncompressed 32-bit BGRA surface, which every DDS reader opens.
 *
 * Decoded pixels go back through the canvas pipeline in images.ts, so
 * DDS gets the same targets every other raster format has.
 */
import type { RgbaImage } from "./raster";

const MAGIC = 0x20534444; // "DDS " little-endian

/** True when the bytes start with a DDS header. */
export function isDds(bytes: Uint8Array): boolean {
  if (bytes.length < 128) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === MAGIC && view.getUint32(4, true) === 124;
}

function fourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/** Expands an RGB565 endpoint to 8 bits per channel. */
function rgb565(value: number): [number, number, number] {
  const r = (value >> 11) & 0x1f;
  const g = (value >> 5) & 0x3f;
  const b = value & 0x1f;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

/** Decodes one BC1 colour block into the target image. */
function decodeColourBlock(
  view: DataView,
  offset: number,
  out: Uint8Array,
  width: number,
  height: number,
  blockX: number,
  blockY: number,
  opaque: boolean
): void {
  const c0 = view.getUint16(offset, true);
  const c1 = view.getUint16(offset + 2, true);
  const bits = view.getUint32(offset + 4, true);
  const [r0, g0, b0] = rgb565(c0);
  const [r1, g1, b1] = rgb565(c1);
  // Four-colour mode when c0 > c1, otherwise three colours plus a
  // transparent slot — that's how BC1 encodes 1-bit alpha.
  const fourColour = c0 > c1 || opaque;
  const colours: [number, number, number, number][] = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    fourColour
      ? [Math.round((2 * r0 + r1) / 3), Math.round((2 * g0 + g1) / 3), Math.round((2 * b0 + b1) / 3), 255]
      : [Math.round((r0 + r1) / 2), Math.round((g0 + g1) / 2), Math.round((b0 + b1) / 2), 255],
    fourColour
      ? [Math.round((r0 + 2 * r1) / 3), Math.round((g0 + 2 * g1) / 3), Math.round((b0 + 2 * b1) / 3), 255]
      : [0, 0, 0, 0]
  ];
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const x = blockX * 4 + px;
      const y = blockY * 4 + py;
      if (x >= width || y >= height) continue;
      const index = (bits >> (2 * (py * 4 + px))) & 0x03;
      const colour = colours[index]!;
      const d = (y * width + x) * 4;
      out[d] = colour[0];
      out[d + 1] = colour[1];
      out[d + 2] = colour[2];
      out[d + 3] = colour[3];
    }
  }
}

/** Applies a BC2 (explicit 4-bit) alpha block. */
function decodeAlphaBc2(
  view: DataView,
  offset: number,
  out: Uint8Array,
  width: number,
  height: number,
  blockX: number,
  blockY: number
): void {
  for (let py = 0; py < 4; py++) {
    const row = view.getUint16(offset + py * 2, true);
    for (let px = 0; px < 4; px++) {
      const x = blockX * 4 + px;
      const y = blockY * 4 + py;
      if (x >= width || y >= height) continue;
      const nibble = (row >> (px * 4)) & 0x0f;
      out[(y * width + x) * 4 + 3] = (nibble << 4) | nibble;
    }
  }
}

/** Applies a BC3 (interpolated) alpha block. */
function decodeAlphaBc3(
  view: DataView,
  offset: number,
  out: Uint8Array,
  width: number,
  height: number,
  blockX: number,
  blockY: number
): void {
  const a0 = view.getUint8(offset);
  const a1 = view.getUint8(offset + 1);
  const alphas: number[] = [a0, a1];
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) alphas.push(Math.round(((7 - i) * a0 + i * a1) / 7));
  } else {
    for (let i = 1; i <= 4; i++) alphas.push(Math.round(((5 - i) * a0 + i * a1) / 5));
    alphas.push(0, 255);
  }
  // Six bytes of 3-bit indices, low bits first.
  let low = 0;
  for (let i = 0; i < 3; i++) low |= view.getUint8(offset + 2 + i) << (8 * i);
  let high = 0;
  for (let i = 0; i < 3; i++) high |= view.getUint8(offset + 5 + i) << (8 * i);
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const x = blockX * 4 + px;
      const y = blockY * 4 + py;
      if (x >= width || y >= height) continue;
      const i = py * 4 + px;
      const index = i < 8 ? (low >> (3 * i)) & 0x07 : (high >> (3 * (i - 8))) & 0x07;
      out[(y * width + x) * 4 + 3] = alphas[index] ?? 255;
    }
  }
}

/** Number of bits set below the lowest set bit of a channel mask. */
function maskShift(mask: number): number {
  if (mask === 0) return 0;
  let shift = 0;
  let m = mask;
  while ((m & 1) === 0) {
    m >>>= 1;
    shift++;
  }
  return shift;
}

/** Scales a masked channel value up to 8 bits. */
function maskScale(mask: number, shift: number): number {
  const bits = (mask >>> shift).toString(2).replace(/0+$/, "").length || 1;
  return bits >= 8 ? 1 : 255 / ((1 << bits) - 1);
}

/** DDS → RGBA pixels. */
export function decodeDds(bytes: Uint8Array): RgbaImage {
  if (!isDds(bytes)) throw new Error("Not a DDS file (missing the DDS header).");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (width <= 0 || height <= 0 || width * height > 80_000_000) {
    throw new Error("This DDS file's dimensions are outside the supported range.");
  }
  // DDS_PIXELFORMAT starts 76 bytes into the 124-byte header.
  const pf = 4 + 76;
  const pfFlags = view.getUint32(pf + 4, true);
  const cc = fourCc(view, pf + 8);
  const hasFourCc = (pfFlags & 0x4) !== 0;
  let data = 128;
  if (hasFourCc && cc === "DX10") {
    throw new Error("DX10-header DDS files aren't supported — only DXT1/DXT3/DXT5 and uncompressed DDS.");
  }
  const out = new Uint8Array(width * height * 4);

  if (hasFourCc && (cc === "DXT1" || cc === "DXT3" || cc === "DXT5")) {
    const blockBytes = cc === "DXT1" ? 8 : 16;
    const blocksX = Math.ceil(width / 4);
    const blocksY = Math.ceil(height / 4);
    if (data + blocksX * blocksY * blockBytes > bytes.length) {
      throw new Error("This DDS file is truncated.");
    }
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const at = data + (by * blocksX + bx) * blockBytes;
        if (cc === "DXT1") {
          decodeColourBlock(view, at, out, width, height, bx, by, false);
        } else {
          decodeColourBlock(view, at + 8, out, width, height, bx, by, true);
          if (cc === "DXT3") decodeAlphaBc2(view, at, out, width, height, bx, by);
          else decodeAlphaBc3(view, at, out, width, height, bx, by);
        }
      }
    }
    return { width, height, data: out };
  }

  if ((pfFlags & 0x40) !== 0 || (pfFlags & 0x20000) !== 0) {
    // Uncompressed surface described by channel masks.
    const bitCount = view.getUint32(pf + 12, true);
    if (bitCount !== 16 && bitCount !== 24 && bitCount !== 32) {
      throw new Error(`This DDS file uses an unsupported ${bitCount}-bit layout.`);
    }
    const rMask = view.getUint32(pf + 16, true);
    const gMask = view.getUint32(pf + 20, true);
    const bMask = view.getUint32(pf + 24, true);
    const aMask = view.getUint32(pf + 28, true);
    const bytesPerPixel = bitCount / 8;
    if (data + width * height * bytesPerPixel > bytes.length) {
      throw new Error("This DDS file is truncated.");
    }
    const shifts = [maskShift(rMask), maskShift(gMask), maskShift(bMask), maskShift(aMask)];
    const scales = [
      maskScale(rMask, shifts[0]!),
      maskScale(gMask, shifts[1]!),
      maskScale(bMask, shifts[2]!),
      maskScale(aMask, shifts[3]!)
    ];
    for (let i = 0; i < width * height; i++) {
      const p = data + i * bytesPerPixel;
      let pixel = 0;
      for (let k = 0; k < bytesPerPixel; k++) pixel |= view.getUint8(p + k) << (8 * k);
      const d = i * 4;
      out[d] = Math.min(255, Math.round(((pixel & rMask) >>> shifts[0]!) * scales[0]!));
      out[d + 1] = Math.min(255, Math.round(((pixel & gMask) >>> shifts[1]!) * scales[1]!));
      out[d + 2] = Math.min(255, Math.round(((pixel & bMask) >>> shifts[2]!) * scales[2]!));
      out[d + 3] = aMask === 0 ? 255 : Math.min(255, Math.round(((pixel & aMask) >>> shifts[3]!) * scales[3]!));
    }
    return { width, height, data: out };
  }

  throw new Error(
    `This DDS file uses a surface format that can't be read locally${hasFourCc ? ` (${cc})` : ""}. Only DXT1/DXT3/DXT5 and uncompressed DDS are supported.`
  );
}

/**
 * Encodes RGBA pixels as an uncompressed 32-bit BGRA DDS. Uncompressed
 * rather than DXT: block compression is lossy, and every DDS reader
 * handles plain surfaces.
 */
export function encodeDds(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new Error("Can't encode an empty image.");
  const out = new Uint8Array(128 + width * height * 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, 124, true); // header size
  // CAPS | HEIGHT | WIDTH | PIXELFORMAT | PITCH
  view.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x8, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, width * 4, true); // pitch
  view.setUint32(28, 1, true); // mipmap count
  const pf = 4 + 76;
  view.setUint32(pf, 32, true); // pixel format size
  view.setUint32(pf + 4, 0x1 | 0x40, true); // ALPHAPIXELS | RGB
  view.setUint32(pf + 12, 32, true); // bits per pixel
  view.setUint32(pf + 16, 0x00ff0000, true); // red mask
  view.setUint32(pf + 20, 0x0000ff00, true); // green mask
  view.setUint32(pf + 24, 0x000000ff, true); // blue mask
  view.setUint32(pf + 28, 0xff000000, true); // alpha mask
  view.setUint32(pf + 32, 0x1000, true); // caps: texture
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    const d = 128 + i * 4;
    out[d] = data[s + 2] ?? 0; // B
    out[d + 1] = data[s + 1] ?? 0; // G
    out[d + 2] = data[s] ?? 0; // R
    out[d + 3] = data[s + 3] ?? 255; // A
  }
  return out;
}
