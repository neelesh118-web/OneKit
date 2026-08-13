/**
 * Microsoft LZX decompression — a faithful TypeScript port of libmspack's
 * lzxd.c (Stuart Caie, LGPL 2.1, used as the reference implementation).
 *
 * LZX is the LZ77 variant with canonical Huffman coding used by CAB files,
 * Compiled HTML Help (.chm) and Microsoft Reader (.lit). This module only
 * implements the non-delta flavour with the constants the spec fixes:
 *
 *  - LZ77 matches (min 2, max 257 bytes) addressed through 36+ position
 *    slots, each slot carrying a base + extra offset bits;
 *  - three Huffman trees per block: the main tree (literals + length
 *    headers), the length footer tree, and the aligned-offset tree;
 *  - block types: VERBATIM (1), ALIGNED (2) and UNCOMPRESSED (0);
 *  - a 32 KB frame/reset structure: state (repeat offsets, tree lengths)
 *    resets every `resetInterval` frames, and each frame may carry the
 *    optional "intel" E8 preprocessing pass.
 *
 * The bit reader is MSB-first with a lazy byte refill, exactly like the
 * reference, so frame/block alignment behaves identically on real files.
 */

export const LZX_FRAME_SIZE = 32768;

const MIN_MATCH = 2;
const NUM_CHARS = 256;
const NUM_PRIMARY_LENGTHS = 7;
const NUM_SECONDARY_LENGTHS = 249;
const PRETREE_MAXSYMBOLS = 20;
const LENGTH_MAXSYMBOLS = 249;
const ALIGNED_MAXSYMBOLS = 8;

const BLOCKTYPE_UNCOMPRESSED = 0;
const BLOCKTYPE_VERBATIM = 1;
const BLOCKTYPE_ALIGNED = 2;

/** Number of position slots for each window size (window_bits 15..25). */
const POSITION_SLOTS = [30, 32, 34, 36, 38, 42, 50, 66, 98, 162, 290];

const EXTRA_BITS: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) out.push(0);
  for (let i = 4; i < 36; i++) out.push(Math.floor(i / 2) - 1);
  for (let i = 36; i < 290; i++) out.push(17);
  return out;
})();

/** Position slot bases: base[i] = base[i-1] + (1 << extra_bits[i-1]). */
const POSITION_BASE: number[] = (() => {
  const out = new Array<number>(290).fill(0);
  for (let i = 1; i < 290; i++) out[i] = out[i - 1]! + (1 << EXTRA_BITS[i - 1]!);
  return out;
})();

/* Bit reader ------------------------------------------------------------- */

class BitReader {
  /** Top-aligned 32-bit buffer, mirroring libmspack's MSB-first readbits.h. */
  private buf = 0;
  private left = 0;

  constructor(
    private readonly input: Uint8Array,
    public pos = 0
  ) {}

  /** Fake zero bytes allowed at EOF, exactly like libmspack's read_input. */
  private eofPad = 0;

  /** Refills the bit buffer with whole bytes until at least `n` bits sit in it. */
  private ensure(n: number): void {
    while (this.left < n) {
      let b = 0;
      if (this.pos >= this.input.length) {
        // Like the reference: two fake zero bytes for read-ahead, then error.
        if (this.eofPad >= 2) throw new Error("LZX input ran out of bytes.");
        this.eofPad += 1;
      } else {
        b = this.input[this.pos++]!;
      }
      // INJECT_BITS: place the byte just below the already-stored bits.
      this.buf = (this.buf | (b << (32 - 8 - this.left))) >>> 0;
      this.left += 8;
    }
  }

  /** Reads `n` bits, MSB-first (the first stream bit is the MSB of the first byte). */
  read(n: number): number {
    this.ensure(n);
    const v = this.buf >>> (32 - n); // PEEK_BITS
    this.buf = (this.buf << n) >>> 0; // REMOVE_BITS
    this.left -= n;
    return v;
  }

  /** Discards the trailing partial bits up to the next byte boundary. */
  alignToByte(): void {
    const drop = this.left & 7;
    if (drop > 0) this.read(drop);
  }

  /** Frame boundary realignment, mirroring lzxd: ensure ≥16 bits then drop leftover. */
  alignFrame(): void {
    if (this.left > 0) this.ensure(16);
    if (this.left & 15) {
      this.buf = (this.buf << (this.left & 15)) >>> 0;
      this.left &= ~15;
    }
  }

  /** Raw bytes (used by UNCOMPRESSED blocks, already byte-aligned). */
  takeRaw(n: number): Uint8Array {
    const end = Math.min(this.pos + n, this.input.length);
    const out = this.input.subarray(this.pos, end);
    this.pos = end;
    return out;
  }
}

/* Canonical Huffman ------------------------------------------------------- */

interface Huffman {
  readonly count: number[];
  readonly firstCode: number[];
  readonly symbolStart: number[];
  readonly symbols: number[];
}

function buildHuffman(lengths: readonly number[]): Huffman | null {
  const count = new Array<number>(17).fill(0);
  let total = 0;
  for (const l of lengths) {
    if (l > 0) {
      count[l]!++;
      total++;
    }
  }
  if (total === 0) return null; // empty tree — legal for the LENGTH table
  const firstCode = new Array<number>(17).fill(0);
  let code = 0;
  for (let len = 1; len <= 16; len++) {
    code = (code + count[len - 1]!) << 1;
    firstCode[len] = code;
  }
  const symbols: number[] = [];
  for (let len = 1; len <= 16; len++) {
    for (let s = 0; s < lengths.length; s++) {
      if (lengths[s] === len) symbols.push(s);
    }
  }
  const symbolStart = new Array<number>(17).fill(0);
  let acc = 0;
  for (let len = 1; len <= 16; len++) {
    symbolStart[len] = acc;
    acc += count[len]!;
  }
  return { count, firstCode, symbolStart, symbols };
}

function huffDecode(h: Huffman, r: BitReader): number {
  let code = 0;
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | r.read(1);
    const idx = code - h.firstCode[len]!;
    if (idx >= 0 && idx < h.count[len]!) {
      return h.symbols[h.symbolStart[len]! + idx]!;
    }
  }
  throw new Error("Invalid LZX huffman code.");
}

/**
 * Reads code lengths for symbols [first, last) using the pretree encoding
 * (20 fixed-4-bit lengths, then pretree symbols with run-length deltas).
 */
function readLengths(r: BitReader, lens: number[], first: number, last: number): void {
  const pretreeLen = new Array<number>(PRETREE_MAXSYMBOLS).fill(0);
  for (let i = 0; i < PRETREE_MAXSYMBOLS; i++) pretreeLen[i] = r.read(4);
  const pretree = buildHuffman(pretreeLen);
  if (!pretree) throw new Error("Invalid LZX pretree.");
  let x = first;
  while (x < last) {
    const z = huffDecode(pretree, r);
    if (z === 17) {
      let y = r.read(4) + 4;
      while (y-- > 0) lens[x++] = 0;
    } else if (z === 18) {
      let y = r.read(5) + 20;
      while (y-- > 0) lens[x++] = 0;
    } else if (z === 19) {
      let y = r.read(1) + 4;
      const z2 = huffDecode(pretree, r);
      let v = lens[x]! - z2;
      if (v < 0) v += 17;
      while (y-- > 0) lens[x++] = v;
    } else {
      let v = lens[x]! - z;
      if (v < 0) v += 17;
      lens[x++] = v;
    }
  }
}

/* Decompressor ------------------------------------------------------------ */

export interface LzxOptions {
  windowBits: number;
  /** Reset interval measured in 32 KB frames (0 = never). */
  resetIntervalFrames: number;
  outputLength: number;
}

/**
 * Decompresses a complete in-memory LZX stream. CHM feeds the compressed
 * content as one continuous byte array (the 4 KB block boundaries are only
 * a streaming concern, not part of the bitstream), so this is the exact
 * equivalent of libmspack reading the whole MSCompressed section.
 */
export function lzxDecompress(input: Uint8Array, opts: LzxOptions): Uint8Array {
  const { windowBits, resetIntervalFrames, outputLength } = opts;
  if (windowBits < 15 || windowBits > 21) {
    throw new Error(`Unsupported LZX window size (${windowBits} bits).`);
  }
  const windowSize = 1 << windowBits;
  const numOffsets = POSITION_SLOTS[windowBits - 15]! << 3;
  const mainMax = NUM_CHARS + numOffsets;

  const r = new BitReader(input);
  const window = new Uint8Array(windowSize);
  const out = new Uint8Array(outputLength);

  let R0 = 1;
  let R1 = 1;
  let R2 = 1;
  let headerRead = false;
  let blockType = -1;
  let blockRemaining = 0;
  let blockLength = 0;
  const mainLen = new Array<number>(mainMax).fill(0);
  const lengthLen = new Array<number>(LENGTH_MAXSYMBOLS).fill(0);
  const alignedLen = new Array<number>(ALIGNED_MAXSYMBOLS).fill(0);
  let mainHuff: Huffman | null = null;
  let lengthHuff: Huffman | null = null;
  let alignedHuff: Huffman | null = null;
  let lengthEmpty = true;
  let intelFilesize = 0;
  let intelStarted = false;

  let windowPosn = 0;
  let framePosn = 0;
  let frame = 0;
  let outPos = 0;

  const resetState = (): void => {
    R0 = 1;
    R1 = 1;
    R2 = 1;
    headerRead = false;
    blockRemaining = 0;
    blockType = -1;
    mainLen.fill(0);
    lengthLen.fill(0);
    intelFilesize = 0;
    intelStarted = false;
  };

  while (outPos < outputLength) {
    const frameSize = Math.min(LZX_FRAME_SIZE, outputLength - outPos);

    if (resetIntervalFrames > 0 && frame % resetIntervalFrames === 0) resetState();

    if (!headerRead) {
      if (r.read(1) === 1) {
        intelFilesize = r.read(16) | (r.read(16) << 16);
      } else {
        intelFilesize = 0;
      }
      headerRead = true;
    }

    let bytesTodo = framePosn + frameSize - windowPosn;
    while (bytesTodo > 0) {
      if (blockRemaining === 0) {
        // Uncompressed blocks are byte-aligned; odd lengths pad with a byte.
        if (blockType === BLOCKTYPE_UNCOMPRESSED && (blockLength & 1)) r.read(8);
        blockType = r.read(3);
        blockLength = r.read(16) | (r.read(8) << 16);
        blockRemaining = blockLength;
        switch (blockType) {
          case BLOCKTYPE_ALIGNED: {
            for (let i = 0; i < ALIGNED_MAXSYMBOLS; i++) alignedLen[i] = r.read(3);
            alignedHuff = buildHuffman(alignedLen);
            if (!alignedHuff) throw new Error("Invalid LZX aligned tree.");
            // falls through to the verbatim header
            break;
          }
          case BLOCKTYPE_VERBATIM:
            break;
          case BLOCKTYPE_UNCOMPRESSED:
            intelStarted = true;
            // Skip the trailing bits of the current byte, then read R0/R1/R2.
            r.alignToByte();
            const rep = r.takeRaw(12);
            R0 = readI32(rep, 0);
            R1 = readI32(rep, 4);
            R2 = readI32(rep, 8);
            break;
          default:
            throw new Error("Invalid LZX block type.");
        }
        if (blockType === BLOCKTYPE_ALIGNED || blockType === BLOCKTYPE_VERBATIM) {
          readLengths(r, mainLen, 0, NUM_CHARS);
          readLengths(r, mainLen, NUM_CHARS, mainMax);
          mainHuff = buildHuffman(mainLen);
          if (!mainHuff) throw new Error("Invalid LZX main tree.");
          if (mainLen[0xe8] !== 0) intelStarted = true;
          readLengths(r, lengthLen, 0, NUM_SECONDARY_LENGTHS);
          lengthHuff = buildHuffman(lengthLen);
          lengthEmpty = lengthHuff === null;
        }
      }

      let thisRun = Math.min(blockRemaining, bytesTodo);
      bytesTodo -= thisRun;
      blockRemaining -= thisRun;

      if (blockType === BLOCKTYPE_UNCOMPRESSED) {
        const raw = r.takeRaw(thisRun);
        if (raw.length < thisRun) throw new Error("LZX input ran out mid-block.");
        for (let i = 0; i < thisRun; i++) window[windowPosn++] = raw[i]!;
      } else {
        const main = mainHuff!;
        while (thisRun > 0) {
          const mainElement = huffDecode(main, r);
          if (mainElement < NUM_CHARS) {
            window[windowPosn++] = mainElement;
            thisRun--;
            continue;
          }
          const m = mainElement - NUM_CHARS;
          let matchLength = m & NUM_PRIMARY_LENGTHS;
          if (matchLength === NUM_PRIMARY_LENGTHS) {
            if (lengthEmpty) throw new Error("LZX length symbol needed but tree is empty.");
            matchLength += huffDecode(lengthHuff!, r);
          }
          matchLength += MIN_MATCH;
          const slot = m >> 3;
          let matchOffset: number;
          if (slot === 0) {
            matchOffset = R0;
          } else if (slot === 1) {
            matchOffset = R1;
            R1 = R0;
            R0 = matchOffset;
          } else if (slot === 2) {
            matchOffset = R2;
            R2 = R0;
            R0 = matchOffset;
          } else {
            const extra = slot >= 36 ? 17 : EXTRA_BITS[slot]!;
            matchOffset = POSITION_BASE[slot]! - 2;
            if (extra >= 3 && blockType === BLOCKTYPE_ALIGNED) {
              if (extra > 3) matchOffset += r.read(extra - 3) << 3;
              matchOffset += huffDecode(alignedHuff!, r);
            } else if (extra > 0) {
              matchOffset += r.read(extra);
            }
            R2 = R1;
            R1 = R0;
            R0 = matchOffset;
          }
          if (windowPosn + matchLength > windowSize) {
            throw new Error("LZX match ran over the window wrap.");
          }
          // Copy the match, handling source-offset wrap around the window.
          let i = matchLength;
          let dest = windowPosn;
          if (matchOffset > windowPosn) {
            if (matchOffset > outPos) throw new Error("LZX match offset beyond the stream.");
            let j = matchOffset - windowPosn;
            if (j > windowSize) throw new Error("LZX match offset beyond window boundaries.");
            let src = windowSize - j;
            if (j < i) {
              i -= j;
              while (j-- > 0) window[dest++] = window[src++]!;
              src = 0;
            }
            while (i-- > 0) window[dest++] = window[src++]!;
          } else {
            let src = windowPosn - matchOffset;
            while (i-- > 0) window[dest++] = window[src++]!;
          }
          thisRun -= matchLength;
          windowPosn += matchLength;
        }
      }

      if (thisRun < 0) {
        if (-thisRun > blockRemaining) throw new Error("LZX match overran the end of its block.");
        blockRemaining -= -thisRun;
      }
    }

    if (windowPosn - framePosn !== frameSize) {
      throw new Error("LZX decode went beyond the output frame limits.");
    }

    r.alignFrame();

    // The optional intel (E8) preprocessing pass, applied per frame.
    let frameData: Uint8Array;
    if (intelStarted && intelFilesize > 0 && frame < 32768 && frameSize > 10) {
      frameData = new Uint8Array(frameSize);
      frameData.set(window.subarray(framePosn, framePosn + frameSize));
      let curpos = outPos;
      let p = 0;
      const limit = frameSize - 10;
      while (p < limit) {
        if (frameData[p] !== 0xe8) {
          curpos++;
          p++;
          continue;
        }
        const absOff = readI32(frameData, p + 1);
        if (absOff >= -curpos && absOff < intelFilesize) {
          const rel = absOff >= 0 ? absOff - curpos : absOff + intelFilesize;
          writeI32(frameData, p + 1, rel);
        }
        p += 5;
        curpos += 5;
      }
    } else {
      frameData = window.subarray(framePosn, framePosn + frameSize);
    }

    out.set(frameData, outPos);
    outPos += frameSize;
    frame++;
    framePosn += frameSize;
    if (windowPosn === windowSize) windowPosn = 0;
    if (framePosn === windowSize) framePosn = 0;
  }

  return out;
}

function readI32(bytes: Uint8Array, off: number): number {
  return (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) | 0;
}

function writeI32(bytes: Uint8Array, off: number, value: number): void {
  bytes[off] = value & 0xff;
  bytes[off + 1] = (value >>> 8) & 0xff;
  bytes[off + 2] = (value >>> 16) & 0xff;
  bytes[off + 3] = (value >>> 24) & 0xff;
}
