// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeAnimatedGif, encodeGif, type PixelSource } from "../src/core/converter/gif";
import { decodeGifFrames } from "../src/core/converter/gif";

function solidPixels(width: number, height: number, r: number, g: number, b: number): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function avgChannel(data: Uint8ClampedArray, channel: number): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i + channel]!;
  return sum / (data.length / 4);
}

describe("converter gif decode (round-trip against gifenc)", () => {
  it("decodes a still GIF back to its pixels", () => {
    const gif = encodeGif(solidPixels(8, 8, 200, 40, 40));
    const frames = decodeGifFrames(gif);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.width).toBe(8);
    expect(frames[0]!.height).toBe(8);
    expect(frames[0]!.delayMs).toBe(0);
    expect(avgChannel(frames[0]!.data, 0)).toBeGreaterThan(120); // red dominates
    expect(avgChannel(frames[0]!.data, 1)).toBeLessThan(100);
  });

  it("decodes an animated GIF with per-frame delays", () => {
    const gif = encodeAnimatedGif([
      { pixels: solidPixels(6, 6, 220, 30, 30), delayMs: 300 },
      { pixels: solidPixels(6, 6, 30, 220, 30), delayMs: 100 }
    ]);
    const frames = decodeGifFrames(gif);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.delayMs).toBe(300);
    expect(frames[1]!.delayMs).toBe(100);
    // Frame 1 is red-dominant, frame 2 green-dominant (palette quantization is approximate).
    expect(avgChannel(frames[0]!.data, 0)).toBeGreaterThan(avgChannel(frames[0]!.data, 1));
    expect(avgChannel(frames[1]!.data, 1)).toBeGreaterThan(avgChannel(frames[1]!.data, 0));
  });

  it("round-trips pixel data through encode → decode", () => {
    const source = solidPixels(4, 4, 10, 60, 250);
    const frames = decodeGifFrames(encodeGif(source));
    // Every pixel's blue channel should stay clearly dominant.
    expect(avgChannel(frames[0]!.data, 2)).toBeGreaterThan(150);
    expect(avgChannel(frames[0]!.data, 0)).toBeLessThan(60);
  });

  it("rejects non-GIF bytes", () => {
    expect(() => decodeGifFrames(new TextEncoder().encode("hello world"))).toThrow(/Not a GIF/);
  });

  it("rejects truncated GIF data", () => {
    const gif = encodeGif(solidPixels(8, 8, 10, 20, 30));
    // Truncating mid-file either trips a truncation guard or ends with
    // no frames at all — both are honest failures, never silent garbage.
    expect(() => decodeGifFrames(gif.slice(0, 20))).toThrow(/truncated|Not a GIF|no frames/);
  });

  it("rejects empty input", () => {
    expect(() => decodeGifFrames(new Uint8Array(0))).toThrow(/Not a GIF/);
  });
});
