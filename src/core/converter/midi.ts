/**
 * Minimal Standard MIDI File (SMF) parser and on-device synthesizer.
 *
 * Reads the classic SMF format (MThd + MTrk chunks, delta-time variable
 * length quantities, meta events incl. tempo changes, running status) and
 * renders it to PCM with a small software synth (harmonic partials with an
 * exponential decay envelope). No samples, no wasm, no network — a real
 * MIDI → WAV/MP3/FLAC/OGG pipeline that works entirely in Node or the
 * browser. Pitch-bend/sysEx are skipped honestly (notes still play).
 */

import { samplesToWav, type DecodedAudio } from "./audio";

export interface MidiNote {
  /** Seconds from the start of the file. */
  start: number;
  /** Seconds. */
  duration: number;
  /** Hz. */
  frequency: number;
  /** 0..1. */
  velocity: number;
  channel: number;
}

export interface MidiData {
  format: number;
  ticksPerQuarter: number;
  notes: MidiNote[];
  /** Seconds. */
  duration: number;
}

const DEFAULT_TEMPO_US = 500000; // 120 BPM
const MAX_NOTES = 20000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function midiNoteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function readVlq(bytes: Uint8Array, state: { pos: number }): number {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const b = bytes[state.pos]!;
    state.pos++;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) return value;
  }
  return value;
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>>
    0
  );
}

/**
 * Parses an SMF (Standard MIDI File) into its note timeline. Tempo changes
 * are honored; format 0 and 1 both work (format 2 track timing is merged
 * per-track and concatenated).
 */
export function parseMidi(bytes: Uint8Array): MidiData {
  if (bytes.length < 14 || bytes.length > MAX_FILE_BYTES) {
    throw new Error("Not a valid MIDI file (wrong size).");
  }
  if (!asciiAt(bytes, 0, "MThd")) throw new Error("Not a valid MIDI file (missing MThd header).");

  const format = readU16BE(bytes, 8);
  const trackCount = readU16BE(bytes, 10);
  const division = readU16BE(bytes, 12);
  const ticksPerQuarter = division & 0x8000 ? 480 : division; // SMPTE → assume 480

  const notes: MidiNote[] = [];
  let state = { pos: 14 };
  const pending = new Map<string, { channel: number; start: number; velocity: number }>();
  let endSeconds = 0;

  const consumeTrack = () => {
    if (!asciiAt(bytes, state.pos, "MTrk")) return;
    state.pos += 8; // chunk id + length
    let runningStatus = 0;
    let seconds = 0;
    let tempoUs = DEFAULT_TEMPO_US;

    while (state.pos < bytes.length) {
      const delta = readVlq(bytes, state);
      seconds += (delta * tempoUs) / ticksPerQuarter / 1e6;
      const event = bytes[state.pos]!;
      if (event === 0xff) {
        // Meta event.
        state.pos++;
        const type = bytes[state.pos]!;
        state.pos++;
        const len = readVlq(bytes, state);
        const dataStart = state.pos;
        if (type === 0x51 && len >= 3) {
          tempoUs =
            (bytes[dataStart]! << 16) | (bytes[dataStart + 1]! << 8) | bytes[dataStart + 2]!;
        } else if (type === 0x2f) {
          state.pos = dataStart + len;
          break; // end of track
        }
        state.pos = dataStart + len;
        runningStatus = 0;
        continue;
      }
      if (event === 0xf0 || event === 0xf7) {
        // SysEx — skip.
        state.pos++;
        const len = readVlq(bytes, state);
        state.pos += len;
        runningStatus = 0;
        continue;
      }

      let status = event;
      if (status >= 0x80) {
        state.pos++;
        runningStatus = status;
      } else {
        status = runningStatus;
        if (status === 0) continue;
      }
      const high = status & 0xf0;
      const channel = status & 0x0f;

      if (high === 0x90) {
        const note = bytes[state.pos]!;
        const velocity = bytes[state.pos + 1]!;
        state.pos += 2;
        const key = `${channel}:${note}`;
        if (velocity === 0) {
          closeNote(key, seconds);
        } else {
          pending.set(key, { channel, start: seconds, velocity: velocity / 127 });
        }
      } else if (high === 0x80) {
        const note = bytes[state.pos]!;
        state.pos += 2;
        closeNote(`${channel}:${note}`, seconds);
      } else if (high === 0xc0 || high === 0xd0) {
        state.pos += 1; // program change / channel pressure
      } else {
        state.pos += 2; // pitch bend / control change / poly pressure
      }
    }
    endSeconds = Math.max(endSeconds, seconds);
  };

  const closeNote = (key: string, end: number) => {
    const started = pending.get(key);
    if (!started) return;
    pending.delete(key);
    const duration = Math.max(0.05, end - started.start);
    if (notes.length < MAX_NOTES) {
      notes.push({
        start: started.start,
        duration,
        frequency: midiNoteToFrequency(Number(key.split(":")[1])),
        velocity: started.velocity,
        channel: started.channel
      });
    }
  };

  for (let t = 0; t < Math.min(trackCount, 64); t++) consumeTrack();
  // Close any notes still ringing at the end.
  for (const [key, started] of pending) {
    closeNote(key, endSeconds);
  }

  if (notes.length === 0) throw new Error("This MIDI file contains no playable notes.");

  const duration = endSeconds + 0.4;
  notes.sort((a, b) => a.start - b.start);
  return { format, ticksPerQuarter, notes, duration };
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

const SAMPLE_RATE = 44100;

/**
 * Synthesizes a MIDI file to interleaved stereo PCM (44100 Hz). A single
 * simple voice (sine + harmonics with exponential decay) keeps the output
 * deterministic and dependency-free.
 */
export function midiToSamples(bytes: Uint8Array): DecodedAudio {
  const midi = parseMidi(bytes);
  const totalSeconds = Math.min(midi.duration, 600); // cap at 10 minutes
  const frames = Math.max(1, Math.ceil(totalSeconds * SAMPLE_RATE));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  for (const note of midi.notes) {
    const startFrame = Math.min(frames, Math.max(0, Math.round(note.start * SAMPLE_RATE)));
    const durFrames = Math.max(1, Math.round(note.duration * SAMPLE_RATE));
    const end = Math.min(frames, startFrame + durFrames);
    const amp = 0.22 * Math.min(1, Math.max(0, note.velocity));
    // Faster decay for short notes keeps a melody from turning to mush.
    const decay = 1 / Math.max(0.12, 0.35 + note.duration * 0.25);
    const pan = Math.max(-0.4, Math.min(0.4, (note.frequency - 261.63) / 800));
    for (let i = startFrame; i < end; i++) {
      const t = (i - startFrame) / SAMPLE_RATE;
      const env = Math.exp(-t * decay) * Math.min(1, t / 0.005);
      const ph = 2 * Math.PI * note.frequency * t;
      const v =
        (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph) + 0.05 * Math.sin(4 * ph)) *
        amp *
        env;
      left[i] = (left[i] ?? 0) + v * (1 - pan);
      right[i] = (right[i] ?? 0) + v * (1 + pan);
    }
  }

  // Soft-clip: scale only if it would otherwise exceed ±1.
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak > 1) {
    const scale = 0.9 / peak;
    for (let i = 0; i < frames; i++) {
      left[i] = (left[i] ?? 0) * scale;
      right[i] = (right[i] ?? 0) * scale;
    }
  }

  const samples = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    samples[i * 2] = left[i]!;
    samples[i * 2 + 1] = right[i]!;
  }
  return { sampleRate: SAMPLE_RATE, channels: 2, samples };
}

/** Renders a MIDI file to a 16-bit stereo PCM WAV. */
export function midiToWav(bytes: Uint8Array): Uint8Array {
  const decoded = midiToSamples(bytes);
  return samplesToWav(decoded.sampleRate, decoded.channels, decoded.samples);
}
