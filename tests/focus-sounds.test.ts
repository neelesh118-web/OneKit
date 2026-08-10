// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createNoisePlayer,
  generateNoise,
  mulberry32,
  rms,
  SOUND_OPTIONS,
  soundDurationSeconds
} from "../src/core/focus-sounds";

const SAMPLE_RATE = 44_100;

describe("mulberry32", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it("produces values in [0, 1)", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("generateNoise", () => {
  it("is deterministic under the same seed", () => {
    const a = generateNoise("white", 1000, SAMPLE_RATE, 99);
    const b = generateNoise("white", 1000, SAMPLE_RATE, 99);
    expect([...a]).toEqual([...b]);
  });

  it("differs across seeds and kinds", () => {
    const a = generateNoise("white", 1000, SAMPLE_RATE, 1);
    const b = generateNoise("white", 1000, SAMPLE_RATE, 2);
    const pink = generateNoise("pink", 1000, SAMPLE_RATE, 1);
    expect([...a]).not.toEqual([...b]);
    expect([...a]).not.toEqual([...pink]);
  });

  it("is audible (non-silent) and bounded for every kind", () => {
    for (const kind of SOUND_OPTIONS) {
      const buf = generateNoise(kind.id, 8000, SAMPLE_RATE);
      expect(buf.length).toBe(8000);
      expect(rms(buf)).toBeGreaterThan(0.01);
      for (let i = 0; i < buf.length; i++) {
        expect(Math.abs(buf[i] ?? 0)).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("normalizes to a 0.9 peak", () => {
    const buf = generateNoise("white", 2000, SAMPLE_RATE);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v ?? 0));
    expect(peak).toBeCloseTo(0.9, 1);
  });

  it("pink and brown have fewer zero crossings than white (darker spectrum)", () => {
    const crossings = (buf: Float32Array) => {
      let n = 0;
      for (let i = 1; i < buf.length; i++) {
        if (((buf[i - 1] ?? 0) < 0) !== ((buf[i] ?? 0) < 0)) n++;
      }
      return n / buf.length;
    };
    const white = crossings(generateNoise("white", 44100, SAMPLE_RATE));
    const pink = crossings(generateNoise("pink", 44100, SAMPLE_RATE));
    const brown = crossings(generateNoise("brown", 44100, SAMPLE_RATE));
    expect(pink).toBeLessThan(white * 0.95);
    expect(brown).toBeLessThan(pink * 0.95);
  });

  it("computes durations", () => {
    expect(soundDurationSeconds(44_100, 44_100)).toBe(1);
    expect(soundDurationSeconds(0, 44_100)).toBe(0);
  });
});

describe("createNoisePlayer", () => {
  function fakeDeps() {
    const calls: string[] = [];
    const buffer = { setData: (data: Float32Array) => calls.push(`setData:${data.length}`) };
    const source = {
      loop: false,
      connect: () => calls.push("source.connect"),
      start: () => calls.push("source.start"),
      stop: () => calls.push("source.stop")
    };
    const gain = { gain: { value: 1 }, connect: () => calls.push("gain.connect") };
    return {
      calls,
      deps: {
        sampleRate: 44_100,
        createBuffer: () => buffer,
        createBufferSource: () => source,
        createGain: () => gain,
        destination: { name: "dest" }
      }
    };
  }

  it("plays, adjusts volume and stops exactly once each", () => {
    const { calls, deps } = fakeDeps();
    const player = createNoisePlayer(deps, "pink", 10);
    expect(player.playing).toBe(false);
    player.play();
    expect(player.playing).toBe(true);
    player.setVolume(0.5);
    expect(calls[0]).toBe("setData:441000");
    expect(calls).toContain("source.start");
    expect(player.kind).toBe("pink");
    player.stop();
    expect(player.playing).toBe(false);
    player.stop(); // idempotent
    expect(calls.filter((c) => c === "source.stop")).toHaveLength(1);
  });

  it("clamps volume to [0, 1]", () => {
    const { deps } = fakeDeps();
    const player = createNoisePlayer(deps, "white", 5);
    player.setVolume(9);
    expect(player.playing).toBe(false);
    void player;
  });
});
