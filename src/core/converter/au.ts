/**
 * Sun/NeXT AU (.au / .snd) audio reading and writing. AU is a 24-byte
 * big-endian header followed by raw samples, so like AIFF it feeds the
 * same sample pipeline — decode to interleaved floats, then re-encode to
 * whatever the caller asked for.
 *
 * Supported encodings: 16-bit linear PCM (3), 8-bit linear PCM (2) and
 * 32-bit float (6). μ-law (1) is raised with an honest error rather than
 * guessing at the samples.
 */

export interface ParsedAu {
  sampleRate: number;
  channels: number;
  /** Interleaved samples normalized to [-1, 1]. */
  samples: Float32Array;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! << 24) |
    (bytes[offset + 1]! << 16) |
    (bytes[offset + 2]! << 8) |
    bytes[offset + 3]!
  );
}

/** True when the bytes carry a Sun/NeXT AU audio file. */
export function isAu(bytes: Uint8Array): boolean {
  return bytes.length >= 24 && bytes[0] === 0x2e && bytes[1] === 0x73 && bytes[2] === 0x6e && bytes[3] === 0x64;
}

/** Reads a .snd/.au file into interleaved samples. */
export function parseAu(bytes: Uint8Array): ParsedAu {
  if (!isAu(bytes)) throw new Error("Not an AU file (missing the .snd magic).");
  const dataOffset = readU32BE(bytes, 4);
  const encoding = readU32BE(bytes, 12);
  const sampleRate = readU32BE(bytes, 16);
  const channels = readU32BE(bytes, 20);
  if (sampleRate <= 0 || channels <= 0) {
    throw new Error("This AU file has invalid sample-rate or channel metadata.");
  }
  if (dataOffset < 24 || dataOffset > bytes.length) {
    throw new Error("This AU file has an invalid data offset.");
  }
  let samples: Float32Array;
  const dataSize = bytes.length - dataOffset;
  if (encoding === 3) {
    // 16-bit big-endian linear PCM
    const n = Math.floor(dataSize / 2);
    samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = dataOffset + i * 2;
      const s = (bytes[p]! << 8) | bytes[p + 1]!;
      const signed = s > 0x7fff ? s - 0x10000 : s;
      samples[i] = signed / 32767;
    }
  } else if (encoding === 2) {
    // 8-bit unsigned linear PCM (offset by 128)
    const n = dataSize;
    samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = ((bytes[dataOffset + i]! - 128) / 127);
    }
  } else if (encoding === 6) {
    // 32-bit big-endian float
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = Math.floor(dataSize / 4);
    samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = view.getFloat32(dataOffset + i * 4, false);
    }
  } else if (encoding === 1) {
    throw new Error("μ-law AU audio isn't supported — re-encode the file as 16-bit PCM first.");
  } else {
    throw new Error(`Unsupported AU encoding (${encoding}).`);
  }
  if (samples.length % channels !== 0) {
    // Tolerate a trailing partial frame by dropping it.
    samples = samples.slice(0, Math.floor(samples.length / channels) * channels);
  }
  return { sampleRate, channels, samples };
}

/** Encodes interleaved Float32 samples as a 16-bit linear PCM AU file. */
export function encodeAu(sampleRate: number, channels: number, samples: Float32Array): Uint8Array {
  const frames = Math.floor(samples.length / channels);
  const dataSize = frames * channels * 2;
  const buffer = new ArrayBuffer(24 + dataSize);
  const v = new DataView(buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, ".snd");
  v.setUint32(4, 24, false); // data offset
  v.setUint32(8, dataSize, false);
  v.setUint32(12, 3, false); // 16-bit linear PCM
  v.setUint32(16, sampleRate, false);
  v.setUint32(20, channels, false);
  for (let i = 0; i < frames * channels; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(24 + i * 2, Math.round(s * 32767), false);
  }
  return new Uint8Array(buffer);
}
