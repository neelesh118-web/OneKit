// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crc8, crc16 } from "../src/core/converter/crc";
import { encodeFlac } from "../src/core/converter/flac";

function crc8Str(s: string): number {
  return crc8(new TextEncoder().encode(s), 0, s.length);
}
function crc16Str(s: string): number {
  return crc16(new TextEncoder().encode(s), 0, s.length);
}

describe("FLAC CRCs", () => {
  it("CRC-8 matches the 0x07 check value", () => {
    expect(crc8Str("123456789")).toBe(0xf4);
  });
  it("CRC-16 matches the 0x8005 check value", () => {
    expect(crc16Str("123456789")).toBe(0xfee8);
  });
});

describe("encodeFlac", () => {
  const rate = 8000;
  const samples = new Float32Array(rate);
  for (let i = 0; i < rate; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.4;
  samples[0] = 0.5;

  it("writes the fLaC marker and a correct STREAMINFO block", () => {
    const flac = encodeFlac({ sampleRate: rate, channels: 1, bitDepth: 16, samples });
    expect(String.fromCharCode(...flac.slice(0, 4))).toBe("fLaC");
    // Metadata header: last block + type 0 (STREAMINFO), length 34.
    expect(flac[4]).toBe(0x80);
    expect(flac[7]).toBe(34);
    // Block size 4096 (min + max).
    expect((flac[8]! << 8) | flac[9]!).toBe(4096);
    expect((flac[10]! << 8) | flac[11]!).toBe(4096);
    // The 64-bit field at STREAMINFO bytes 10–17 (flac[18..25]):
    // sampleRate(20) | channels-1(3) | bps-1(5) | totalSamples(36).
    const field =
      (BigInt(rate & 0xfffff) << 44n) |
      (BigInt(0) << 41n) |
      (BigInt(16 - 1) << 36n) |
      (BigInt(rate) & 0xfffffffffn);
    for (let i = 0; i < 8; i++) {
      expect(flac[18 + i]!).toBe(Number((field >> BigInt(56 - i * 8)) & 0xffn));
    }
  });

  it("emits spec-valid frames with correct header fields and CRCs", () => {
    const flac = encodeFlac({ sampleRate: rate, channels: 1, bitDepth: 16, samples });
    const frameStart = 4 + 4 + 34; // marker + meta header + streaminfo
    expect(flac[frameStart]).toBe(0xff);
    expect(flac[frameStart + 1]).toBe(0xf8); // sync + fixed blocking
    // Block-size code 12 (4096), sample-rate code 0 (from STREAMINFO).
    expect(flac[frameStart + 2]).toBe((0b1100 << 4) | 0x0);
    // Mono (channels-1=0) + 16-bit sample-size code 0b011.
    expect(flac[frameStart + 3]).toBe((0 << 4) | (0b011 << 1) | 0);
    expect(flac[frameStart + 4]).toBe(0x00); // frame number 0
    expect(flac[frameStart + 5]).toBe(0x00); // verbatim subframe header

    const headerLen = 5;
    const subLen = 1 + 4096 * 2; // first block is full 4096 samples
    const bodyLen = headerLen + subLen;
    // Recompute CRCs over the frame and compare to the footer.
    expect(crc8(flac, frameStart, frameStart + bodyLen)).toBe(flac[frameStart + bodyLen]!);
    const stored16 = (flac[frameStart + bodyLen + 1]! << 8) | flac[frameStart + bodyLen + 2]!;
    expect(crc16(flac, frameStart, frameStart + bodyLen + 1)).toBe(stored16);
  });

  it("round-trips the first sample back to its PCM value", () => {
    const flac = encodeFlac({ sampleRate: rate, channels: 1, bitDepth: 16, samples });
    const frameStart = 42;
    const firstSample = (flac[frameStart + 6]! << 8) | flac[frameStart + 7]!;
    const signed = firstSample >= 0x8000 ? firstSample - 0x10000 : firstSample;
    expect(signed).toBe(16384); // round(0.5 * 32767)
  });

  it("numbers the second frame correctly (UTF-8 frame number 1)", () => {
    // 8000 samples / 4096 block = 2 frames.
    const flac = encodeFlac({ sampleRate: rate, channels: 1, bitDepth: 16, samples });
    const firstFrameLen = 5 + (1 + 4096 * 2) + 3; // header + subframe + crc8 + crc16
    const secondStart = 42 + firstFrameLen;
    expect(flac[secondStart]).toBe(0xff);
    expect(flac[secondStart + 4]).toBe(0x01); // frame number 1
    // Last block is short (8000 - 4096 = 3904 samples).
    const bodyLen = 5 + (1 + 3904 * 2);
    expect(crc8(flac, secondStart, secondStart + bodyLen)).toBe(flac[secondStart + bodyLen]!);
  });
});
