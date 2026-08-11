/**
 * Minimal, spec-valid FLAC encoder using verbatim subframes.
 *
 * Verbatim subframes store the raw PCM samples with no prediction, so the
 * output is genuinely lossless FLAC that any player opens — it just isn't
 * compressed. That's the honest tradeoff for a dependency-free, 100%
 * on-device encoder (the popular wasm encoders are old and awkward to
 * bundle; this one is ~150 lines, fully local, and fully testable).
 *
 * Frame structure (per the FLAC spec):
 *   "fLaC" marker + STREAMINFO metadata block, then one frame per block.
 *   Each frame = header (sync + codes + UTF-8 frame number)
 *   + one verbatim subframe per channel + CRC-8 + CRC-16.
 */
import { crc8, crc16 } from "./crc";

export interface FlacInput {
  sampleRate: number;
  /** 1 (mono) or 2 (stereo). */
  channels: 1 | 2;
  bitDepth: 8 | 16 | 24;
  /** Interleaved samples normalized to [-1, 1]. */
  samples: Float32Array;
}

/** Fixed block size (inter-channel samples per frame). 4096 is a common value. */
export const FLAC_BLOCK_SIZE = 4096;

const BLOCK_SIZE = FLAC_BLOCK_SIZE;

/** UTF-8-style variable-length coding of the frame number (1–7 bytes). */
function utf8FrameNumber(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x800) return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
  if (n < 0x10000) return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  if (n < 0x200000) {
    return [0xf0 | (n >> 18), 0x80 | ((n >> 12) & 0x3f), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  }
  if (n < 0x4000000) {
    return [
      0xf8 | (n >> 24),
      0x80 | ((n >> 18) & 0x3f),
      0x80 | ((n >> 12) & 0x3f),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f)
    ];
  }
  throw new Error("Audio too long to encode as FLAC.");
}

/** Builds the 34-byte FLAC STREAMINFO metadata block (frame sizes=0, MD5=0). */
export function buildFlacStreamInfo(
  sampleRate: number,
  channels: 1 | 2,
  bitDepth: 8 | 16 | 24,
  frameCount: number
): Uint8Array {
  const streamInfo = new Uint8Array(34);
  streamInfo[0] = (BLOCK_SIZE >> 8) & 0xff;
  streamInfo[1] = BLOCK_SIZE & 0xff;
  streamInfo[2] = (BLOCK_SIZE >> 8) & 0xff;
  streamInfo[3] = BLOCK_SIZE & 0xff;
  // bytes 4–9: min/max frame size = 0 (unknown — allowed).
  // bytes 10–17: sampleRate(20) | channels-1(3) | bps-1(5) | totalSamples(36).
  const field =
    (BigInt(sampleRate & 0xfffff) << 44n) |
    (BigInt(channels - 1) << 41n) |
    (BigInt(bitDepth - 1) << 36n) |
    (BigInt(frameCount) & 0xfffffffffn);
  for (let i = 0; i < 8; i++) {
    streamInfo[10 + i] = Number((field >> BigInt(56 - i * 8)) & 0xffn);
  }
  // bytes 18–33: MD5 = 0.
  return streamInfo;
}

/** Builds one FLAC frame (header + verbatim subframes + CRC-8/CRC-16). */
export function buildFlacFrame(
  samples: Float32Array,
  channels: 1 | 2,
  bitDepth: 8 | 16 | 24,
  blockIndex: number,
  startFrame: number,
  count: number
): Uint8Array {
  const bytesPerSample = bitDepth / 8;
  const num = utf8FrameNumber(blockIndex);
  const sampleSizeCode = bitDepth === 8 ? 0b001 : bitDepth === 24 ? 0b101 : 0b011;
  // Block-size code 12 → 256 * 2^(12-8) = 4096.
  const blockSizeCode = 0b1100;

  // Frame header: 4 fixed bytes + UTF-8 frame number.
  const header = new Uint8Array(4 + num.length);
  header[0] = 0xff;
  header[1] = 0xf8; // sync + reserved(0) + blocking strategy(0 fixed)
  header[2] = (blockSizeCode << 4) | 0x0; // sample-rate code 0 (from STREAMINFO)
  header[3] = ((channels - 1) << 4) | (sampleSizeCode << 1) | 0;
  header.set(num, 4);

  // Verbatim subframe per channel.
  const subframes: Uint8Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const sub = new Uint8Array(1 + count * bytesPerSample);
    sub[0] = 0x00; // verbatim subframe type, no wasted bits
    for (let i = 0; i < count; i++) {
      const s = samples[(startFrame + i) * channels + ch]!;
      const clamped = Math.max(-1, Math.min(1, s));
      const p = 1 + i * bytesPerSample;
      if (bitDepth === 8) {
        sub[p] = Math.round(clamped * 127) & 0xff;
      } else if (bitDepth === 16) {
        const v = Math.round(clamped * 32767);
        sub[p] = (v >> 8) & 0xff;
        sub[p + 1] = v & 0xff;
      } else {
        const v = Math.round(clamped * 8388607);
        sub[p] = (v >> 16) & 0xff;
        sub[p + 1] = (v >> 8) & 0xff;
        sub[p + 2] = v & 0xff;
      }
    }
    subframes.push(sub);
  }

  // Assemble frame: header + subframes + CRC-8 + CRC-16.
  const bodyLen = header.length + subframes.reduce((n, s) => n + s.length, 0);
  const frame = new Uint8Array(bodyLen + 3);
  frame.set(header, 0);
  let off = header.length;
  for (const s of subframes) {
    frame.set(s, off);
    off += s.length;
  }
  const c8 = crc8(frame, 0, bodyLen);
  frame[bodyLen] = c8;
  const c16 = crc16(frame, 0, bodyLen + 1);
  frame[bodyLen + 1] = (c16 >> 8) & 0xff;
  frame[bodyLen + 2] = c16 & 0xff;
  return frame;
}

/** Encodes interleaved Float32 samples to a valid lossless FLAC stream. */
export function encodeFlac(input: FlacInput): Uint8Array {
  const { sampleRate, channels, bitDepth, samples } = input;
  const frameCount = Math.floor(samples.length / channels);
  if (frameCount <= 0) throw new Error("No audio samples to encode.");
  const totalBlocks = Math.ceil(frameCount / BLOCK_SIZE);

  // STREAMINFO (34 bytes): block sizes, frame sizes=0, rate/channels/bps,
  // total samples, MD5=0.
  const streamInfo = buildFlacStreamInfo(sampleRate, channels, bitDepth, frameCount);

  // Metadata block header: last(bit7) + type 0 (STREAMINFO) + length 34.
  const metaHeader = new Uint8Array([0x80, 0x00, 0x00, 0x22]);

  const chunks: Uint8Array[] = [
    new Uint8Array([0x66, 0x4c, 0x61, 0x43]), // "fLaC"
    metaHeader,
    streamInfo
  ];

  for (let b = 0; b < totalBlocks; b++) {
    const startFrame = b * BLOCK_SIZE;
    const count = Math.min(BLOCK_SIZE, frameCount - startFrame);
    chunks.push(buildFlacFrame(samples, channels, bitDepth, b, startFrame, count));
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
