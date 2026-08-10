// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  anyToWav,
  normalizeWav,
  parseWav,
  samplesToWav,
  wavToMp3,
  type DecodedAudio
} from "../src/core/converter/audio";

/** A tiny 1-second 8000 Hz mono sine wave, interleaved Float32. */
function sineWav(): Uint8Array {
  const rate = 8000;
  const samples = new Float32Array(rate);
  for (let i = 0; i < rate; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5;
  return samplesToWav(rate, 1, samples);
}

describe("converter audio", () => {
  it("parses the WAV it encodes", () => {
    const wav = sineWav();
    const parsed = parseWav(wav);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sampleRate).toBe(8000);
      expect(parsed.value.channels).toBe(1);
      expect(parsed.value.samples.length).toBe(8000);
      expect(Math.abs(parsed.value.samples[0]!)).toBeLessThanOrEqual(1);
    }
  });

  it("rejects non-WAV bytes honestly", () => {
    const result = parseWav(new TextEncoder().encode("not a wav at all"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/WAV/);
  });

  it("normalizes a WAV without changing its audio", () => {
    const normalized = normalizeWav(sineWav());
    const parsed = parseWav(normalized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sampleRate).toBe(8000);
      expect(parsed.value.samples.length).toBe(8000);
    }
  });

  it("encodes WAV → MP3 with real MP3 magic", () => {
    const result = wavToMp3(sineWav());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(1000);
      // MPEG frame sync: 0xFF followed by a byte with the 0xE0 sync bits set
      // (MPEG-1/2/2.5 all valid — low sample rates map to MPEG-2).
      const isMp3 = result.value[0] === 0xff && (result.value[1]! & 0xe0) === 0xe0;
      expect(isMp3).toBe(true);
    }
  });

  it("rejects garbage WAV input to the MP3 encoder", () => {
    const result = wavToMp3(new TextEncoder().encode("garbage"));
    expect(result.ok).toBe(false);
  });

  it("converts any decoded audio to WAV via the injectable decoder", async () => {
    const decoder = async (): Promise<DecodedAudio> => ({
      sampleRate: 16000,
      channels: 2,
      samples: new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5, -0.6])
    });
    const wav = await anyToWav(new Uint8Array([0]), decoder);
    const parsed = parseWav(wav);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sampleRate).toBe(16000);
      expect(parsed.value.channels).toBe(2);
      expect(parsed.value.samples.length).toBe(6);
      expect(parsed.value.samples[0]!).toBeCloseTo(0.1, 4);
    }
  });

  it("surfaces a decoder failure honestly", async () => {
    const decoder = async (): Promise<DecodedAudio> => {
      throw new Error("boom");
    };
    await expect(anyToWav(new Uint8Array([0]), decoder)).rejects.toThrow(/couldn't decode/);
  });
});
