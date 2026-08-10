/**
 * Audio conversions — WAV parse/encode, WAV → MP3 via lamejs, and
 * MP3/OGG/M4A → WAV through an injectable decoder (the popup uses the
 * Web Audio API; tests inject a fake). All 100% local.
 */

// @breezystack/lamejs is the maintained fork — npm's `lamejs` 1.2.1 is
// broken (Mp3Encoder throws "MPEGMode is not defined").
import * as lamejsModule from "@breezystack/lamejs";
import { toArrayBuffer } from "./util";

export interface ParsedWav {
  sampleRate: number;
  channels: number;
  /** Interleaved samples normalized to [-1, 1]. */
  samples: Float32Array;
}

export type WavResult = { ok: true; value: ParsedWav } | { ok: false; error: string };

export type Mp3Result = { ok: true; value: Uint8Array } | { ok: false; error: string };

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  );
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

/** Parses a PCM WAV (8/16-bit or 32-bit float) into interleaved samples. */
export function parseWav(bytes: Uint8Array): WavResult {
  if (!asciiAt(bytes, 0, "RIFF") || !asciiAt(bytes, 8, "WAVE")) {
    return { ok: false, error: "Not a WAV file (missing RIFF/WAVE header)." };
  }
  let offset = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const size = readU32LE(bytes, offset + 4);
    const body = offset + 8;
    if (body + size > bytes.length) break;
    if (id === "fmt " && size >= 16) {
      fmt = {
        format: readU16LE(bytes, body),
        channels: readU16LE(bytes, body + 2),
        sampleRate: readU32LE(bytes, body + 4),
        bits: readU16LE(bytes, body + 14)
      };
    } else if (id === "data") {
      dataOffset = body;
      dataSize = size;
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt) return { ok: false, error: "Not a WAV file (missing fmt chunk)." };
  if (fmt.format !== 1 && fmt.format !== 3) {
    return { ok: false, error: "Compressed WAV isn't supported — only PCM and float WAV." };
  }
  if (dataOffset < 0 || dataSize === 0) {
    return { ok: false, error: "Not a WAV file (no audio data)." };
  }
  const frameBytes = fmt.channels * (fmt.bits / 8);
  const frames = Math.floor(dataSize / frameBytes);
  const samples = new Float32Array(frames * fmt.channels);
  for (let i = 0; i < frames * fmt.channels; i++) {
    const p = dataOffset + i * (fmt.bits / 8);
    if (fmt.bits === 8) {
      samples[i] = (bytes[p]! - 128) / 128;
    } else if (fmt.bits === 16) {
      samples[i] = readU16LE(bytes, p) >= 0x8000 ? (readU16LE(bytes, p) - 0x10000) / 32768 : readU16LE(bytes, p) / 32768;
    } else if (fmt.bits === 32 && fmt.format === 3) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + p, 4);
      samples[i] = view.getFloat32(0, true);
    } else {
      return { ok: false, error: `Unsupported WAV bit depth (${fmt.bits}-bit).` };
    }
  }
  return { ok: true, value: { sampleRate: fmt.sampleRate, channels: fmt.channels, samples } };
}

/** Encodes interleaved Float32 samples into a 16-bit PCM WAV. */
export function samplesToWav(sampleRate: number, channels: number, samples: Float32Array): Uint8Array {
  const frames = Math.floor(samples.length / channels);
  const dataSize = frames * channels * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  writeAscii(36, "data");
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < frames * channels; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buffer);
}

/** Normalizes any PCM WAV to a canonical 16-bit WAV. */
export function normalizeWav(bytes: Uint8Array): Uint8Array {
  const parsed = parseWav(bytes);
  if (!parsed.ok) throw new Error(parsed.error);
  return samplesToWav(parsed.value.sampleRate, parsed.value.channels, parsed.value.samples);
}

type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
};

function getMp3Encoder(): Mp3EncoderCtor {
  // Normalize namespace vs default interop across bundlers and Node.
  const mod = lamejsModule as unknown as {
    Mp3Encoder?: Mp3EncoderCtor;
    default?: { Mp3Encoder?: Mp3EncoderCtor };
  };
  const ctor = mod.Mp3Encoder ?? mod.default?.Mp3Encoder;
  if (!ctor) throw new Error("MP3 encoder failed to load.");
  return ctor;
}

/** Encodes a PCM WAV to MP3 via lamejs (128 kbps). */
export function wavToMp3(bytes: Uint8Array): Mp3Result {
  const parsed = parseWav(bytes);
  if (!parsed.ok) return parsed;
  const { sampleRate, channels, samples } = parsed.value;
  try {
    const Mp3Encoder = getMp3Encoder();
    const encoder = new Mp3Encoder(channels, sampleRate, 128);
    const block = 1152;
    const chunks: number[] = [];
    const left = new Int16Array(block);
    const right = channels === 2 ? new Int16Array(block) : undefined;
    const toInt16 = (s: number): number => Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
    for (let start = 0; start < samples.length; start += block) {
      const n = Math.min(block, samples.length - start);
      for (let j = 0; j < n; j++) {
        const idx = start + j;
        left[j] = toInt16(samples[idx * channels]!);
        if (right) right[j] = toInt16(samples[idx * channels + 1]!);
      }
      if (n < block) {
        left.fill(0, n);
        right?.fill(0, n);
      }
      const out = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left);
      for (let i = 0; i < out.length; i++) chunks.push(out[i]!);
    }
    const flushed = encoder.flush();
    for (let i = 0; i < flushed.length; i++) chunks.push(flushed[i]!);
    if (chunks.length === 0) return { ok: false, error: "MP3 encoding produced no data." };
    return { ok: true, value: new Uint8Array(chunks) };
  } catch {
    return { ok: false, error: "MP3 encoding failed." };
  }
}

export interface DecodedAudio {
  sampleRate: number;
  channels: number;
  /** Interleaved samples normalized to [-1, 1]. */
  samples: Float32Array;
}

export type AudioDecoder = (bytes: Uint8Array) => Promise<DecodedAudio>;

/** Converts any decodable audio to WAV using the provided decoder. */
export async function anyToWav(bytes: Uint8Array, decode: AudioDecoder): Promise<Uint8Array> {
  let decoded: DecodedAudio;
  try {
    decoded = await decode(bytes);
  } catch {
    throw new Error("This browser couldn't decode the audio file — it may be corrupt or an unsupported codec.");
  }
  if (!Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0 || decoded.channels < 1) {
    throw new Error("The audio decoder returned invalid data.");
  }
  return samplesToWav(decoded.sampleRate, decoded.channels, decoded.samples);
}

/** Browser decoder backed by the Web Audio API (OfflineAudioContext). */
export async function decodeAudioInBrowser(bytes: Uint8Array): Promise<DecodedAudio> {
  const OfflineCtx = (globalThis as { OfflineAudioContext?: new (c: number, l: number, r: number) => {
    decodeAudioData(b: ArrayBuffer): Promise<{
      sampleRate: number;
      numberOfChannels: number;
      length: number;
      getChannelData(c: number): Float32Array;
    }>;
  } }).OfflineAudioContext;
  if (!OfflineCtx) throw new Error("Audio decoding isn't available in this browser.");
  const ctx = new OfflineCtx(1, 1, 44100);
  const buffer = await ctx.decodeAudioData(toArrayBuffer(bytes));
  const channels = buffer.numberOfChannels;
  const samples = new Float32Array(buffer.length * channels);
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < channels; c++) {
      samples[i * channels + c] = buffer.getChannelData(c)[i]!;
    }
  }
  return { sampleRate: buffer.sampleRate, channels, samples };
}
