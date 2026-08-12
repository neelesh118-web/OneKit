/**
 * Creative Voice (.voc) audio reading and writing. VOC is the classic
 * Sound Blaster format: a "Creative Voice File" header, then blocks of
 * sample data — block type 1 is 8-bit PCM at a legacy sample rate, type 9
 * is 16-bit PCM with an explicit rate.
 *
 * Like AIFF and AU it feeds the same sample pipeline: decode to
 * interleaved floats, then re-encode to whatever the caller asked for.
 */

export interface ParsedVoc {
  sampleRate: number;
  channels: number;
  /** Interleaved samples normalized to [-1, 1]. */
  samples: Float32Array;
}

/** True when the bytes carry a Creative Voice file. */
export function isVoc(bytes: Uint8Array): boolean {
  return bytes.length > 26 && bytes[0] === 0x43 && bytes[1] === 0x72 && bytes[2] === 0x65 && bytes[3] === 0x61; // "Crea"
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24);
}

/** Reads a .voc file into interleaved samples (mono). */
export function parseVoc(bytes: Uint8Array): ParsedVoc {
  if (!isVoc(bytes)) throw new Error("Not a VOC file (missing the Creative Voice header).");
  // The header-length word at offset 20 is the offset to the first block
  // (0x1A = 26 for a standard file) — data starts there directly.
  const dataStart = Math.max(26, readU16LE(bytes, 20));
  if (dataStart >= bytes.length) throw new Error("This VOC file has no sound data.");
  // Sample rates are stored as a "time constant": rate = 1000000 / (256 - tc)
  // for 8-bit blocks and rate = 1000000 / (65536 - tc) for 16-bit blocks.
  let sampleRate = 11025; // sensible default
  let samples: number[] = [];
  let pos = dataStart;
  while (pos + 4 <= bytes.length) {
    const type = bytes[pos]!;
    const len = readU32LE(bytes, pos + 1);
    const body = pos + 5;
    if (len === 0 || body + len > bytes.length) break;
    if (type === 0) break; // terminator
    if (type === 1) {
      // 8-bit unsigned PCM block; rate time-constant in body[0]
      const divisor = bytes[body]!;
      if (divisor > 0 && divisor < 256) sampleRate = 1_000_000 / (256 - divisor);
      const blockSamples = len - 1; // first byte is the divisor
      for (let i = 0; i < blockSamples; i++) {
        const raw = bytes[body + 1 + i]!;
        samples.push((raw - 128) / 127);
      }
    } else if (type === 9) {
      // 16-bit signed PCM block; rate time-constant at body[0..1]
      const divisor = readU16LE(bytes, body);
      if (divisor > 0 && divisor < 65536) sampleRate = 1_000_000 / (65536 - divisor);
      const blockSamples = (len - 2) / 2;
      for (let i = 0; i < blockSamples; i++) {
        let s = readU16LE(bytes, body + 2 + i * 2);
        if (s > 0x7fff) s -= 0x10000;
        samples.push(s / 32767);
      }
    }
    // Unknown block types are skipped, not fatal — the terminator is what
    // ends a VOC, and interleaved blocks may be silence/markers.
    pos = body + len;
  }
  if (samples.length === 0) throw new Error("This VOC file contains no readable PCM blocks.");
  return { sampleRate, channels: 1, samples: Float32Array.from(samples) };
}

/** Encodes interleaved Float32 samples as an 8-bit PCM VOC file (mono). */
export function encodeVoc(sampleRate: number, _channels: number, samples: Float32Array): Uint8Array {
  // rate = 1000000 / (256 - tc)  →  tc = 256 - 1000000 / rate
  const tc = Math.round(256 - 1_000_000 / sampleRate);
  const divisor = Math.max(1, Math.min(255, tc));
  const header = new Uint8Array(26);
  const text = "Creative Voice File\x1a";
  for (let i = 0; i < text.length; i++) header[i] = text.charCodeAt(i);
  header[20] = 26 & 0xff; // header length
  header[21] = 26 >> 8;
  header[22] = 0x1a & 0xff; // version 1.10
  header[23] = 0x00;
  header[24] = 0x11 & 0xff; // checksum
  header[25] = 0x00;

  const bodyLen = 1 + samples.length;
  const out = new Uint8Array(26 + 5 + bodyLen + 1);
  out.set(header, 0);
  out[26] = 1; // block type 1
  out[27] = bodyLen & 0xff;
  out[28] = (bodyLen >> 8) & 0xff;
  out[29] = (bodyLen >> 16) & 0xff;
  out[30] = (bodyLen >> 24) & 0xff;
  out[31] = divisor;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out[32 + i] = Math.round(s * 127) + 128;
  }
  out[out.length - 1] = 0; // terminator
  return out;
}
