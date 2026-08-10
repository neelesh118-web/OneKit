/**
 * A small, spec-compliant GIF89a decoder — parses the header, color
 * tables, graphic-control extensions, LZW-decompresses each frame's
 * pixel data, and composites frames onto the logical screen so partial
 * and transparent frames come out as full RGBA images. Written by hand
 * (no dependency) so it round-trips against our gifenc encoder in tests
 * and runs everywhere Node runs.
 */

export interface GifDecodedFrame {
  width: number;
  height: number;
  /** Frame delay in milliseconds (0 when the GIF doesn't specify one). */
  delayMs: number;
  /** Full-frame RGBA, 4 bytes per pixel, ready to draw or re-encode. */
  data: Uint8ClampedArray;
  /** True when this frame marks a loop end / is the last one. */
  isLast: boolean;
}

export interface GifDecoded {
  width: number;
  height: number;
  frames: GifDecodedFrame[];
}

const u16 = (bytes: Uint8Array, o: number): number => bytes[o]! | (bytes[o + 1]! << 8);

export function decodeGif(bytes: Uint8Array): GifDecoded {
  if (bytes.length < 13) throw new Error("Not a GIF file (too short).");
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);
  if (magic !== "GIF87a" && magic !== "GIF89a") {
    throw new Error("Not a GIF file (bad header).");
  }
  const width = u16(bytes, 6);
  const height = u16(bytes, 8);
  if (width < 1 || height < 1 || width > 10000 || height > 10000) {
    throw new Error("This GIF has an implausible frame size.");
  }
  const packed = bytes[10]!;
  const globalTable = (packed & 0x80) !== 0;
  const tableSize = 2 << (packed & 0x07);
  const bgIndex = bytes[11]!;

  let offset = 13;
  let globalPalette: number[][] = [];
  if (globalTable) {
    if (offset + tableSize * 3 > bytes.length) throw new Error("This GIF is truncated (color table).");
    globalPalette = readPalette(bytes, offset, tableSize);
    offset += tableSize * 3;
  }

  // Logical screen, composited frame by frame.
  const canvas = new Uint8ClampedArray(width * height * 4);
  const frames: GifDecodedFrame[] = [];
  let previousCanvas: Uint8ClampedArray | null = null;
  let pending: GceInfo | null = null;

  while (offset < bytes.length) {
    const block = bytes[offset]!;
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      // Extension — only the graphic-control one matters here.
      const label = bytes[offset + 1]!;
      offset += 2;
      if (label === 0xf9) {
        // Graphic control: size=4, packed, delay(2 LE), transparent index.
        const size = bytes[offset]!;
        if (size >= 4 && offset + 1 + size <= bytes.length) {
          const gcePacked = bytes[offset + 1]!;
          const delayCs = u16(bytes, offset + 2);
          const transparentIndex = bytes[offset + 4]!;
          pending = {
            disposal: (gcePacked >> 2) & 0x07,
            transparent: (gcePacked & 0x01) !== 0,
            transparentIndex,
            delayMs: delayCs * 10
          };
        }
        offset += 1 + size + 1; // size byte + body + terminator (0)
      } else {
        offset = skipSubBlocks(bytes, offset);
      }
      continue;
    }
    if (block === 0x2c) {
      // Image descriptor.
      const left = u16(bytes, offset + 1);
      const top = u16(bytes, offset + 3);
      const fw = u16(bytes, offset + 5);
      const fh = u16(bytes, offset + 7);
      const ipacked = bytes[offset + 9]!;
      let palette = globalPalette;
      offset += 10;
      if ((ipacked & 0x80) !== 0) {
        const localSize = 2 << (ipacked & 0x07);
        if (offset + localSize * 3 > bytes.length) throw new Error("This GIF is truncated (local color table).");
        palette = readPalette(bytes, offset, localSize);
        offset += localSize * 3;
      }
      if (offset >= bytes.length) throw new Error("This GIF is truncated (frame data).");
      const minCodeSize = bytes[offset]!;
      offset += 1;
      const pixelData = readSubBlockData(bytes, offset);
      const indices = lzwDecode(pixelData, minCodeSize, fw * fh);
      // The graphic-control extension governs how the PREVIOUS frame's
      // area is cleared before this one is drawn.
      const disposal = pending?.disposal ?? 0;
      if (disposal === 2) {
        const rgb = palette[bgIndex] ?? [0, 0, 0];
        fillRect(canvas, width, height, left, top, fw, fh, rgb[0]!, rgb[1]!, rgb[2]!, 255);
      } else if (disposal === 3 && previousCanvas) {
        canvas.set(previousCanvas);
      }
      compositeFrame(canvas, width, height, left, top, fw, fh, indices, palette, pending);
      frames.push({
        width,
        height,
        delayMs: pending?.delayMs ?? 0,
        data: canvas.slice(),
        isLast: false
      });
      previousCanvas = canvas.slice();
      pending = null;
      offset = afterSubBlocks(bytes, offset);
      continue;
    }
    throw new Error("This GIF uses an unsupported block.");
  }

  if (frames.length === 0) throw new Error("This GIF has no frames.");
  frames[frames.length - 1]!.isLast = true;
  return { width, height, frames };
}

function readPalette(bytes: Uint8Array, offset: number, size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < size; i++) {
    out.push([bytes[offset + i * 3]!, bytes[offset + i * 3 + 1]!, bytes[offset + i * 3 + 2]!]);
  }
  return out;
}

/** Skips a chain of sub-blocks and returns the offset past the terminator. */
function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  while (offset < bytes.length) {
    const size = bytes[offset]!;
    offset += 1 + size;
    if (size === 0) return offset;
  }
  return offset;
}

/** Concatenates sub-block payloads into one byte array. */
function readSubBlockData(bytes: Uint8Array, offset: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  while (offset < bytes.length) {
    const size = bytes[offset]!;
    offset += 1;
    if (size === 0) break;
    chunks.push(bytes.slice(offset, offset + size));
    offset += size;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Returns the offset just past the frame's sub-block chain. */
function afterSubBlocks(bytes: Uint8Array, offset: number): number {
  return skipSubBlocks(bytes, offset);
}

/**
 * GIF LZW decompression. `minCodeSize` is the byte after the image
 * descriptor; codes are packed LSB-first. Handles clear codes and the
 * KwKwK ("code not yet in dictionary") special case, and grows the code
 * size exactly when the dictionary crosses the next power of two.
 */
function lzwDecode(data: Uint8Array, minCodeSize: number, expectedPixels: number): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) {
    throw new Error("This GIF has an invalid LZW code size.");
  }
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const dict: number[][] = [];
  for (let i = 0; i < clear; i++) dict.push([i]);
  dict.push([]); // clear code slot
  dict.push([]); // end code slot
  let nextEntry = clear + 2;
  let codeSize = minCodeSize + 1;

  const out: number[] = [];
  let bitPos = 0;
  let prev: number[] | null = null;

  const readCode = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byte = data[bitPos >> 3];
      if (byte === undefined) return -1;
      const bit = (byte >> (bitPos & 7)) & 1;
      code |= bit << i;
      bitPos++;
    }
    return code;
  };

  while (out.length < expectedPixels) {
    const code = readCode();
    if (code === -1) break;
    if (code === clear) {
      dict.length = clear + 2;
      nextEntry = clear + 2;
      codeSize = minCodeSize + 1;
      prev = null;
      continue;
    }
    if (code === end) break;
    let entry: number[];
    if (code < dict.length) {
      entry = dict[code]!;
    } else if (code === nextEntry && prev) {
      // KwKwK: the encoder referenced a string that's still being built.
      entry = [...prev, prev[0]!];
    } else {
      throw new Error("This GIF has corrupt LZW data.");
    }
    for (const v of entry) out.push(v);
    if (prev) {
      dict[nextEntry] = [...prev, entry[0]!];
      nextEntry++;
      if (nextEntry === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
    if (out.length > expectedPixels) {
      throw new Error("This GIF has corrupt frame data.");
    }
  }
  return Uint8Array.from(out.slice(0, expectedPixels));
}

interface GceInfo {
  disposal: number;
  transparent: boolean;
  transparentIndex: number;
  delayMs: number;
}

/** Places one frame's pixels onto the logical-screen canvas. */
function compositeFrame(
  canvas: Uint8ClampedArray,
  screenW: number,
  screenH: number,
  left: number,
  top: number,
  fw: number,
  fh: number,
  indices: Uint8Array,
  palette: number[][],
  gce: GceInfo | null
): void {
  const transparent = gce?.transparent === true;
  const transparentIndex = gce?.transparentIndex ?? -1;
  for (let y = 0; y < fh; y++) {
    const row = top + y;
    if (row < 0 || row >= screenH) continue;
    for (let x = 0; x < fw; x++) {
      const col = left + x;
      if (col < 0 || col >= screenW) continue;
      const src = y * fw + x;
      const idx = indices[src]!;
      const dst = (row * screenW + col) * 4;
      if (transparent && idx === transparentIndex) continue; // keep underlying
      const rgb = palette[idx] ?? [0, 0, 0];
      canvas[dst] = rgb[0]!;
      canvas[dst + 1] = rgb[1]!;
      canvas[dst + 2] = rgb[2]!;
      canvas[dst + 3] = 255;
    }
  }
}

function fillRect(
  canvas: Uint8ClampedArray,
  screenW: number,
  screenH: number,
  left: number,
  top: number,
  fw: number,
  fh: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  for (let y = top; y < top + fh; y++) {
    if (y < 0 || y >= screenH) continue;
    for (let x = left; x < left + fw; x++) {
      if (x < 0 || x >= screenW) continue;
      const dst = (y * screenW + x) * 4;
      canvas[dst] = r;
      canvas[dst + 1] = g;
      canvas[dst + 2] = b;
      canvas[dst + 3] = a;
    }
  }
}
