// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeAiff, isAiff, parseAiff } from "../src/core/converter/aiff";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

/** Builds an AIFF/AIFF-C by hand, the shapes the reader meets in the wild. */
function buildAiff(opts: {
  form?: string;
  bits: number;
  channels: number;
  rate: number;
  frames: number;
  compression?: string;
  body: Uint8Array;
  extraChunk?: boolean;
}): Uint8Array {
  const commSize = opts.compression ? 24 : 18;
  const ssndSize = 8 + opts.body.length;
  const extra = opts.extraChunk ? 12 : 0;
  const total = 4 + (8 + commSize) + extra + (8 + ssndSize);
  const out = new Uint8Array(8 + total);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "FORM");
  view.setUint32(4, total, false);
  ascii(8, opts.form ?? "AIFF");
  let p = 12;
  if (opts.extraChunk) {
    ascii(p, "NAME");
    view.setUint32(p + 4, 4, false);
    ascii(p + 8, "hiya");
    p += 12;
  }
  ascii(p, "COMM");
  view.setUint32(p + 4, commSize, false);
  view.setInt16(p + 8, opts.channels, false);
  view.setUint32(p + 10, opts.frames, false);
  view.setInt16(p + 14, opts.bits, false);
  const exponent = Math.floor(Math.log2(opts.rate));
  const scaled = opts.rate / Math.pow(2, exponent - 31);
  view.setUint16(p + 16, exponent + 16383, false);
  view.setUint32(p + 18, Math.floor(scaled) >>> 0, false);
  view.setUint32(p + 22, Math.floor((scaled - Math.floor(scaled)) * 4294967296) >>> 0, false);
  if (opts.compression) ascii(p + 26, opts.compression);
  p += 8 + commSize;
  ascii(p, "SSND");
  view.setUint32(p + 4, ssndSize, false);
  view.setUint32(p + 8, 0, false);
  view.setUint32(p + 12, 0, false);
  out.set(opts.body, p + 16);
  return out;
}

describe("converter AIFF writing", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0.999, -0.999, 0.25, -0.25, 0.75]);
  const aiff = encodeAiff({ sampleRate: 44100, channels: 2, samples });

  it("writes a FORM/AIFF container with a matching size field", () => {
    expect(isAiff(aiff)).toBe(true);
    expect(String.fromCharCode(...aiff.subarray(8, 12))).toBe("AIFF");
    expect(new DataView(aiff.buffer).getUint32(4, false)).toBe(aiff.length - 8);
  });

  it("round-trips rate, channels and samples", () => {
    const back = parseAiff(aiff);
    expect(back.sampleRate).toBe(44100);
    expect(back.channels).toBe(2);
    expect(back.samples).toHaveLength(samples.length);
    for (let i = 0; i < samples.length; i++) {
      // 16-bit quantisation, the same rounding audio.ts uses for WAV.
      expect(back.samples[i]!).toBeCloseTo(samples[i]!, 3);
    }
  });

  it("writes every common sample rate exactly", () => {
    for (const rate of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 192000]) {
      const encoded = encodeAiff({ sampleRate: rate, channels: 1, samples: new Float32Array([0.1, 0.2]) });
      expect(parseAiff(encoded).sampleRate, `${rate} Hz`).toBe(rate);
    }
  });

  it("refuses empty audio", () => {
    expect(() => encodeAiff({ sampleRate: 44100, channels: 2, samples: new Float32Array() })).toThrow(
      /No audio samples/
    );
  });
});

describe("converter AIFF → AIFF (real re-encode, not a no-op)", () => {
  it("is offered as a target — the .aif/.aiff round trip the backlog asks for", () => {
    expect(targetsFor("audio-aiff")).toContain("audio-aiff");
  });

  it("re-encodes through convertFile into a fresh, valid AIFF", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.25]);
    const source = encodeAiff({ sampleRate: 22050, channels: 1, samples });
    const result = await convertFile({ bytes: source, name: "clip.aif" }, "audio-aiff");
    expect(result.name).toBe("clip.aiff");
    expect(isAiff(result.bytes)).toBe(true);
    const back = parseAiff(result.bytes);
    expect(back.sampleRate).toBe(22050);
    expect(back.channels).toBe(1);
    for (let i = 0; i < samples.length; i++) expect(back.samples[i]!).toBeCloseTo(samples[i]!, 2);
  });
});

describe("converter AIFF reading", () => {
  it("reads 8-bit samples as signed", () => {
    const parsed = parseAiff(
      buildAiff({ bits: 8, channels: 1, rate: 22050, frames: 3, body: new Uint8Array([0, 64, 0x80]) })
    );
    expect(parsed.samples[0]!).toBeCloseTo(0, 5);
    expect(parsed.samples[1]!).toBeCloseTo(0.5, 2);
    expect(parsed.samples[2]!).toBe(-1);
  });

  it("reads 16-, 24- and 32-bit big-endian samples", () => {
    const sixteen = parseAiff(
      buildAiff({ bits: 16, channels: 1, rate: 44100, frames: 1, body: new Uint8Array([0x40, 0x00]) })
    );
    expect(sixteen.samples[0]!).toBeCloseTo(0.5, 3);
    const twentyFour = parseAiff(
      buildAiff({
        bits: 24,
        channels: 1,
        rate: 48000,
        frames: 2,
        body: new Uint8Array([0x40, 0x00, 0x00, 0xc0, 0x00, 0x00])
      })
    );
    expect(twentyFour.samples[0]!).toBeCloseTo(0.5, 3);
    expect(twentyFour.samples[1]!).toBeCloseTo(-0.5, 3);
    const thirtyTwo = parseAiff(
      buildAiff({ bits: 32, channels: 1, rate: 48000, frames: 1, body: new Uint8Array([0x40, 0, 0, 0]) })
    );
    expect(thirtyTwo.samples[0]!).toBeCloseTo(0.5, 3);
  });

  it("reads the uncompressed AIFF-C flavours", () => {
    const sowt = parseAiff(
      buildAiff({
        form: "AIFC",
        compression: "sowt",
        bits: 16,
        channels: 1,
        rate: 44100,
        frames: 2,
        body: new Uint8Array([0x00, 0x40, 0x00, 0xc0])
      })
    );
    expect(sowt.samples[0]!).toBeCloseTo(0.5, 3);
    expect(sowt.samples[1]!).toBeCloseTo(-0.5, 3);

    const floatBody = new Uint8Array(4);
    new DataView(floatBody.buffer).setFloat32(0, 0.25, false);
    const fl32 = parseAiff(
      buildAiff({
        form: "AIFC",
        compression: "fl32",
        bits: 32,
        channels: 1,
        rate: 44100,
        frames: 1,
        body: floatBody
      })
    );
    expect(fl32.samples[0]!).toBeCloseTo(0.25, 6);
  });

  it("skips chunks it doesn't know and interleaves stereo", () => {
    const skipped = parseAiff(
      buildAiff({
        bits: 16,
        channels: 1,
        rate: 44100,
        frames: 1,
        body: new Uint8Array([0x40, 0x00]),
        extraChunk: true
      })
    );
    expect(skipped.samples[0]!).toBeCloseTo(0.5, 3);

    const stereo = parseAiff(
      buildAiff({
        bits: 16,
        channels: 2,
        rate: 44100,
        frames: 2,
        body: new Uint8Array([0x40, 0x00, 0xc0, 0x00, 0x20, 0x00, 0xe0, 0x00])
      })
    );
    expect(stereo.channels).toBe(2);
    expect(stereo.samples).toHaveLength(4);
    expect(stereo.samples[0]!).toBeGreaterThan(0);
    expect(stereo.samples[1]!).toBeLessThan(0);
  });

  it("refuses what it can't decode, honestly", () => {
    expect(() => parseAiff(new TextEncoder().encode("RIFF....WAVEfmt "))).toThrow(/Not an AIFF file/);
    expect(() =>
      parseAiff(
        buildAiff({
          form: "AIFC",
          compression: "ima4",
          bits: 16,
          channels: 1,
          rate: 44100,
          frames: 1,
          body: new Uint8Array([0, 0])
        })
      )
    ).toThrow(/ima4 compression, which can't be decoded locally/);
    expect(() =>
      parseAiff(buildAiff({ bits: 12, channels: 1, rate: 44100, frames: 1, body: new Uint8Array([0, 0]) }))
    ).toThrow(/Unsupported AIFF bit depth \(12-bit\)/);
  });
});
