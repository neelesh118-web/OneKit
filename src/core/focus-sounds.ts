/**
 * Focus sounds — locally generated ambient noise (white / pink / brown /
 * rain) via pure Web Audio math. Generators are deterministic under a
 * seeded PRNG so tests can assert exact properties; the AudioContext glue
 * lives in the controller.
 */

export type SoundKind = "white" | "pink" | "brown" | "rain";

export const SOUND_OPTIONS: ReadonlyArray<{ id: SoundKind; name: string; emoji: string }> = [
  { id: "white", name: "White noise", emoji: "🌨️" },
  { id: "pink", name: "Pink noise", emoji: "🌸" },
  { id: "brown", name: "Brown noise", emoji: "🟤" },
  { id: "rain", name: "Rain", emoji: "🌧️" }
];

export const DEFAULT_SOUND_VOLUME = 0.35;

/** Deterministic PRNG (mulberry32) so generator tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates `length` samples of the given kind at `sampleRate` Hz.
 * Pink uses Paul Kellet's classic approximation; rain is low-passed white
 * noise with a slow amplitude swell; brown integrates white noise.
 */
export function generateNoise(kind: SoundKind, length: number, sampleRate: number, seed = 42): Float32Array {
  const out = new Float32Array(length);
  const rng = mulberry32(seed);
  let lastBrown = 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let rainEnv = 0;
  const alpha = 0.08; // rain lowpass
  for (let i = 0; i < length; i++) {
    const white = rng() * 2 - 1;
    if (kind === "white") {
      out[i] = white;
    } else if (kind === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else if (kind === "brown") {
      lastBrown = (lastBrown + 0.02 * white) / 1.02;
      out[i] = lastBrown * 3.5;
    } else {
      // rain: one-pole lowpass + slow amplitude envelope
      rainEnv = 0.0005 + 0.9995 * rainEnv + 0.0005 * (rng() - 0.5) * 2;
      const prev = out[i > 0 ? i - 1 : 0] ?? 0;
      out[i] = (rainEnv * white + alpha * (prev - rainEnv * white)) * 1.6;
    }
  }
  return normalizeNoise(out);
}

/** Peak-normalizes a buffer to 0.9 so all kinds play at comparable loudness. */
export function normalizeNoise(buf: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] ?? 0);
    if (v > peak) peak = v;
  }
  if (peak === 0 || !Number.isFinite(peak)) return buf;
  const gain = 0.9 / peak;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] ?? 0;
    buf[i] = v * gain;
  }
  return buf;
}

export function rms(buf: Float32Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

export function soundDurationSeconds(samples: number, sampleRate: number): number {
  return sampleRate > 0 ? samples / sampleRate : 0;
}

/** Renders a source buffer (looped) into a player with volume control. */
export interface NoisePlayer {
  kind: SoundKind;
  play(): void;
  setVolume(volume: number): void;
  stop(): void;
  readonly playing: boolean;
}

export interface NoisePlayerDeps {
  sampleRate: number;
  /** Builds a mono source buffer; the adapter attaches its real buffer internally. */
  createBuffer(length: number): { setData(data: Float32Array): void };
  createBufferSource(buffer: { setData(data: Float32Array): void }): {
    loop: boolean;
    connect(dest: unknown): void;
    start(): void;
    stop(): void;
  };
  createGain(): { gain: { value: number }; connect(dest: unknown): void };
  destination: unknown;
}

/**
 * Player glue over an injected AudioContext-like object so the state
 * machine is testable without a real audio device. The adapter's
 * createBuffer attaches the real AudioBuffer, and createBufferSource
 * receives that wrapper so it can wire the actual source.
 */
export function createNoisePlayer(deps: NoisePlayerDeps, kind: SoundKind, durationSeconds = 60): NoisePlayer {
  const length = Math.max(1, Math.round(deps.sampleRate * durationSeconds));
  const data = generateNoise(kind, length, deps.sampleRate);
  const buffer = deps.createBuffer(length);
  buffer.setData(data);
  const source = deps.createBufferSource(buffer);
  const gain = deps.createGain();
  source.loop = true;
  source.connect(gain);
  gain.connect(deps.destination);
  let playing = false;
  return {
    kind,
    get playing() {
      return playing;
    },
    play() {
      if (!playing) {
        source.start();
        playing = true;
      }
    },
    setVolume(volume: number) {
      const v = Math.min(1, Math.max(0, volume));
      gain.gain.value = v;
    },
    stop() {
      if (playing) {
        source.stop();
        playing = false;
      }
    }
  };
}
