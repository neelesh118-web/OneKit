/**
 * AIFF / AIFF-C reading and writing. AIFF is big-endian PCM in an IFF
 * container, so it parses much like WAV and feeds the same sample
 * pipeline in audio.ts — decode to interleaved floats, then re-encode to
 * whatever the caller asked for.
 *
 * Uncompressed AIFF and the uncompressed AIFF-C flavours (NONE, sowt,
 * fl32) are supported. Genuinely compressed AIFF-C (IMA4, μ-law, QDM…)
 * raises an honest error rather than guessing at the samples.
 */

export interface ParsedAiff {
  sampleRate: number;
  channels: number;
  /** Interleaved samples normalized to [-1, 1]. */
  samples: Float32Array;
}

function fourCc(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return "";
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

/** True when the bytes carry an AIFF or AIFF-C container. */
export function isAiff(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || fourCc(bytes, 0) !== "FORM") return false;
  const form = fourCc(bytes, 8);
  return form === "AIFF" || form === "AIFC";
}

/** Reads the 80-bit IEEE 754 extended float AIFF stores its rate in. */
function readExtendedFloat(view: DataView, offset: number): number {
  const sign = view.getUint8(offset) & 0x80 ? -1 : 1;
  const exponent = ((view.getUint8(offset) & 0x7f) << 8) | view.getUint8(offset + 1);
  let mantissa = 0;
  for (let i = 0; i < 8; i++) {
    mantissa = mantissa * 256 + view.getUint8(offset + 2 + i);
  }
  if (exponent === 0 && mantissa === 0) return 0;
  // The mantissa carries its leading bit explicitly, hence the -16383-63.
  return sign * mantissa * Math.pow(2, exponent - 16383 - 63);
}

/** Writes a sample rate as an 80-bit IEEE 754 extended float. */
function writeExtendedFloat(view: DataView, offset: number, value: number): void {
  if (value <= 0) {
    for (let i = 0; i < 10; i++) view.setUint8(offset + i, 0);
    return;
  }
  const exponent = Math.floor(Math.log2(value));
  // Split the 64-bit mantissa into two 32-bit halves — a double can't
  // hold all 64 bits at once, but each half is exact.
  const scaled = value / Math.pow(2, exponent - 31);
  const high = Math.floor(scaled);
  const low = Math.floor((scaled - high) * 4294967296);
  view.setUint16(offset, exponent + 16383, false);
  view.setUint32(offset + 2, high >>> 0, false);
  view.setUint32(offset + 6, low >>> 0, false);
}

/** Parses an AIFF/AIFF-C file into interleaved samples. */
export function parseAiff(bytes: Uint8Array): ParsedAiff {
  if (!isAiff(bytes)) throw new Error("Not an AIFF file (missing FORM/AIFF header).");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let channels = 0;
  let frames = 0;
  let bits = 0;
  let sampleRate = 0;
  let compression = "NONE";
  let soundOffset = -1;
  let soundSize = 0;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = fourCc(bytes, offset);
    const size = view.getUint32(offset + 4, false);
    const body = offset + 8;
    if (id === "COMM" && size >= 18) {
      channels = view.getInt16(body, false);
      frames = view.getUint32(body + 2, false);
      bits = view.getInt16(body + 6, false);
      sampleRate = readExtendedFloat(view, body + 8);
      if (size >= 22) compression = fourCc(bytes, body + 18);
    } else if (id === "SSND" && size >= 8) {
      // The chunk starts with an offset and block size before the data.
      soundOffset = body + 8 + view.getUint32(body, false);
      soundSize = size - 8 - view.getUint32(body, false);
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (channels <= 0 || sampleRate <= 0 || bits <= 0) {
    throw new Error("Not a readable AIFF file (missing or invalid COMM chunk).");
  }
  if (soundOffset < 0) throw new Error("Not a readable AIFF file (no sound data).");
  const littleEndian = compression === "sowt";
  const isFloat = compression === "fl32" || compression === "FL32";
  if (!isFloat && compression !== "NONE" && compression !== "sowt" && compression !== "twos") {
    throw new Error(
      `This AIFF-C file uses ${compression} compression, which can't be decoded locally. Only uncompressed AIFF is supported.`
    );
  }
  if (!isFloat && bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) {
    throw new Error(`Unsupported AIFF bit depth (${bits}-bit).`);
  }

  const bytesPerSample = isFloat ? 4 : bits / 8;
  const available = Math.floor(Math.min(soundSize, bytes.length - soundOffset) / (bytesPerSample * channels));
  const count = Math.max(0, Math.min(frames, available)) * channels;
  if (count === 0) throw new Error("This AIFF file has no audio samples.");
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = soundOffset + i * bytesPerSample;
    if (isFloat) {
      samples[i] = view.getFloat32(p, littleEndian);
    } else if (bits === 8) {
      // AIFF's 8-bit samples are signed, unlike WAV's.
      samples[i] = view.getInt8(p) / 128;
    } else if (bits === 16) {
      samples[i] = view.getInt16(p, littleEndian) / 32768;
    } else if (bits === 24) {
      const b0 = view.getUint8(p);
      const b1 = view.getUint8(p + 1);
      const b2 = view.getUint8(p + 2);
      const raw = littleEndian ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2;
      samples[i] = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608;
    } else {
      samples[i] = view.getInt32(p, littleEndian) / 2147483648;
    }
  }
  return { sampleRate: Math.round(sampleRate), channels, samples };
}

/** Encodes interleaved samples as a 16-bit big-endian PCM AIFF. */
export function encodeAiff(input: ParsedAiff): Uint8Array {
  const { sampleRate, channels, samples } = input;
  if (channels < 1) throw new Error("AIFF needs at least one channel.");
  const frames = Math.floor(samples.length / channels);
  if (frames <= 0) throw new Error("No audio samples to encode.");
  const dataSize = frames * channels * 2;
  const commSize = 18;
  const ssndSize = 8 + dataSize;
  const total = 4 + (8 + commSize) + (8 + ssndSize);
  const out = new Uint8Array(8 + total);
  const view = new DataView(out.buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "FORM");
  view.setUint32(4, total, false);
  writeAscii(8, "AIFF");
  writeAscii(12, "COMM");
  view.setUint32(16, commSize, false);
  view.setInt16(20, channels, false);
  view.setUint32(22, frames, false);
  view.setInt16(26, 16, false);
  writeExtendedFloat(view, 28, sampleRate);
  writeAscii(38, "SSND");
  view.setUint32(42, ssndSize, false);
  view.setUint32(46, 0, false); // offset
  view.setUint32(50, 0, false); // block size
  for (let i = 0; i < frames * channels; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(54 + i * 2, Math.round(s * 32767), false);
  }
  return out;
}
