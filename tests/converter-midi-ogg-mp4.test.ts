// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { parseWav, samplesToWav, wavToMp3, type AudioDecoder } from "../src/core/converter/audio";
import { wavToOggFlac } from "../src/core/converter/ogg";
import { muxMp3IntoMp4, scanMp3Frames } from "../src/core/converter/mp4";
import { midiToWav, parseMidi } from "../src/core/converter/midi";
import { crc32 } from "../src/core/converter/crc";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// --- helpers -------------------------------------------------------------

function vlq(value: number): number[] {
  const out = [value & 0x7f];
  value >>>= 7;
  while (value > 0) {
    out.unshift((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return out;
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

/** Builds a tiny format-0 SMF: C4 then E4, quarter notes at 120 BPM. */
function tinyMidi(): Uint8Array {
  const ticks = 480;
  const events: number[] = [];
  let tick = 0;
  for (const note of [60, 64]) {
    events.push(...vlq(tick === 0 ? 0 : ticks), 0x90, note, 100);
    events.push(...vlq(ticks), 0x80, note, 0);
    tick += ticks;
  }
  events.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const header = [...encoder.encode("MThd"), ...u32be(6), ...u16be(0), ...u16be(1), ...u16be(ticks)];
  const track = [...encoder.encode("MTrk"), ...u32be(events.length), ...events];
  return new Uint8Array([...header, ...track]);
}

function realSineWav(): Uint8Array {
  const rate = 44100;
  const samples = new Float32Array(rate);
  for (let i = 0; i < rate; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5;
  return samplesToWav(rate, 1, samples);
}

const fakeDecode: AudioDecoder = async () => ({
  sampleRate: 44100,
  channels: 1,
  samples: new Float32Array(44100).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5)
});

// --- MIDI -----------------------------------------------------------------

describe("midi synth", () => {
  it("parses a tiny SMF into the expected notes", () => {
    const midi = parseMidi(tinyMidi());
    expect(midi.notes.length).toBe(2);
    expect(midi.notes[0]!.frequency).toBeCloseTo(261.63, 0); // C4
    expect(midi.notes[1]!.frequency).toBeCloseTo(329.63, 0); // E4
    expect(midi.notes[0]!.duration).toBeGreaterThan(0.4);
    expect(midi.notes[0]!.duration).toBeLessThan(0.6);
  });

  it("renders MIDI to a non-silent stereo WAV", () => {
    const wav = midiToWav(tinyMidi());
    const parsed = parseWav(wav);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.channels).toBe(2);
    expect(parsed.value.sampleRate).toBe(44100);
    let peak = 0;
    for (let i = 0; i < parsed.value.samples.length; i++) {
      peak = Math.max(peak, Math.abs(parsed.value.samples[i]!));
    }
    expect(peak).toBeGreaterThan(0.1);
  });

  it("rejects non-MIDI bytes honestly", () => {
    expect(() => parseMidi(encoder.encode("just some text, not midi"))).toThrow(/MIDI/);
  });

  it("convertFile: MIDI → MP3/OGG/MP4/FLAC/AIFF all produce real magic bytes", async () => {
    const midi = tinyMidi();
    const mp3 = await convertFile({ bytes: midi, name: "song.mid" }, "audio-mp3");
    expect(mp3.name).toBe("song.mp3");
    expect(mp3.bytes[0]).toBe(0xff); // MPEG sync
    expect((mp3.bytes[1]! & 0xe0) === 0xe0).toBe(true);

    const ogg = await convertFile({ bytes: midi, name: "song.mid" }, "audio-ogg");
    expect(ogg.name).toBe("song.ogg");
    expect(ogg.bytes[0]).toBe(0x4f); // 'O'
    expect(ogg.bytes[1]).toBe(0x67); // 'g'
    expect(ogg.bytes[2]).toBe(0x67);
    expect(ogg.bytes[3]).toBe(0x53); // "OggS"
    expect(ogg.mime).toBe("audio/ogg");

    const mp4 = await convertFile({ bytes: midi, name: "song.mid" }, "audio-mp4");
    expect(mp4.name).toBe("song.mp4");
    expect(decoder.decode(mp4.bytes.slice(4, 8))).toBe("ftyp");
    expect(mp4.mime).toBe("audio/mp4");

    const flac = await convertFile({ bytes: midi, name: "song.mid" }, "audio-flac");
    expect(decoder.decode(flac.bytes.slice(0, 4))).toBe("fLaC");

    const aiff = await convertFile({ bytes: midi, name: "song.mid" }, "audio-aiff");
    expect(decoder.decode(aiff.bytes.slice(0, 4))).toBe("FORM");
  });

  it("midi is a matrix source with all audio targets", () => {
    const targets = targetsFor("audio-midi");
    for (const t of ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4"]) {
      expect(targets).toContain(t);
    }
  });
});

// --- Ogg-FLAC -------------------------------------------------------------

describe("ogg-flac muxer", () => {
  it("produces an OggS stream with fLaC identification and valid page checksums", () => {
    const ogg = wavToOggFlac(realSineWav());
    expect(decoder.decode(ogg.slice(0, 4))).toBe("OggS");

    // Walk all pages: header(27) + lacing + payload.
    let pos = 0;
    const pages: Array<{ granule: number; headerType: number; seq: number }> = [];
    while (pos < ogg.length) {
      expect(decoder.decode(ogg.slice(pos, pos + 4))).toBe("OggS");
      const headerType = ogg[pos + 5]!;
      const granule =
        (ogg[pos + 6]! | (ogg[pos + 7]! << 8) | (ogg[pos + 8]! << 16) | (ogg[pos + 9]! << 24)) >>> 0;
      const seq = (ogg[pos + 18]! | (ogg[pos + 19]! << 8) | (ogg[pos + 20]! << 16) | (ogg[pos + 21]! << 24)) >>> 0;
      const storedCrc =
        (ogg[pos + 22]! | (ogg[pos + 23]! << 8) | (ogg[pos + 24]! << 16) | (ogg[pos + 25]! << 24)) >>> 0;
      const nseg = ogg[pos + 26]!;
      let payloadLen = 0;
      for (let i = 0; i < nseg; i++) payloadLen += ogg[pos + 27 + i]!;
      const pageEnd = pos + 27 + nseg + payloadLen;
      // Recompute CRC with a zeroed checksum field — must match the stored one.
      const copy = ogg.slice(pos, pageEnd);
      copy[22] = 0; copy[23] = 0; copy[24] = 0; copy[25] = 0;
      expect(crc32(copy, 0, copy.length)).toBe(storedCrc);
      pages.push({ granule, headerType, seq });
      pos = pageEnd;
    }

    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[0]!.headerType & 0x02).toBe(0x02); // BOS
    expect(pages[0]!.granule).toBe(0);
    // Granule positions strictly increase across the audio pages (pages 2+).
    expect(pages[2]!.granule).toBeGreaterThan(0);
    for (let i = 3; i < pages.length; i++) {
      expect(pages[i]!.granule).toBeGreaterThan(pages[i - 1]!.granule);
    }
    // Last page is EOS.
    expect(pages[pages.length - 1]!.headerType & 0x04).toBe(0x04);
    // The identification page carries the "fLaC" marker + STREAMINFO.
    const payloadStart = 27 + ogg[26]!; // 27-byte header + lacing table
    expect(decoder.decode(ogg.slice(payloadStart, payloadStart + 4))).toBe("fLaC");
  });
});

// --- MP3 → MP4 ------------------------------------------------------------

describe("mp3-in-mp4 muxer", () => {
  it("scans real MP3 frames from lamejs output", () => {
    const mp3 = wavToMp3(realSineWav());
    expect(mp3.ok).toBe(true);
    if (!mp3.ok) return;
    const scan = scanMp3Frames(mp3.value);
    expect(scan.offsets.length).toBeGreaterThan(30);
    expect(scan.sampleRate).toBe(44100);
    // Frames must tile the stream exactly after the (absent) ID3 tag: no gaps, no overlap.
    let cursor = scan.id3Size;
    for (let i = 0; i < scan.offsets.length; i++) {
      expect(scan.offsets[i]).toBe(cursor);
      cursor = scan.offsets[i + 1] ?? mp3.value.length;
    }
    expect(cursor).toBe(mp3.value.length);
  });

  it("muxes an MP4 with ftyp/mdat/moov and an intact MP3 payload", () => {
    const mp3 = wavToMp3(realSineWav());
    expect(mp3.ok).toBe(true);
    if (!mp3.ok) return;
    const mp4 = muxMp3IntoMp4(mp3.value);
    expect(decoder.decode(mp4.slice(4, 8))).toBe("ftyp");

    // Parse top-level boxes.
    let pos = 0;
    const boxes: Array<{ type: string; size: number }> = [];
    while (pos < mp4.length) {
      const size = (mp4[pos]! << 24) | (mp4[pos + 1]! << 16) | (mp4[pos + 2]! << 8) | mp4[pos + 3]!;
      const type = decoder.decode(mp4.slice(pos + 4, pos + 8));
      boxes.push({ type, size });
      pos += size;
    }
    expect(pos).toBe(mp4.length);
    const types = boxes.map((b) => b.type);
    expect(types).toContain("mdat");
    expect(types).toContain("moov");
    expect(types.indexOf("ftyp")).toBe(0);

    // The mdat body must be byte-identical to the source MP3.
    const mdat = boxes.find((b) => b.type === "mdat")!;
    const mdatStart = boxes.slice(0, boxes.indexOf(mdat)).reduce((n, b) => n + b.size, 0);
    const mdatBody = mp4.slice(mdatStart + 8, mdatStart + mdat.size);
    expect(Array.from(mdatBody)).toEqual(Array.from(mp3.value));

    // moov must contain the audio sample tables we wrote.
    const moov = boxes.find((b) => b.type === "moov")!;
    const moovStart2 = boxes.slice(0, boxes.indexOf(moov)).reduce((n, b) => n + b.size, 0);
    const moovBytes = mp4.slice(moovStart2, moovStart2 + moov.size);
    const moovText = decoder.decode(moovBytes);
    expect(moovText).toContain("mp4a");
    expect(moovText).toContain("esds");
    expect(moovText).toContain("stsz");
    expect(moovText).toContain("stts");
    expect(moovText).toContain("stco");
  });

  it("convertFile: WAV → MP4 remuxes to a playable container", async () => {
    const result = await convertFile({ bytes: realSineWav(), name: "clip.wav" }, "audio-mp4");
    expect(result.name).toBe("clip.mp4");
    expect(decoder.decode(result.bytes.slice(4, 8))).toBe("ftyp");
    expect(result.bytes.indexOf(0x6d, result.bytes.length - 400)).toBeGreaterThan(-1); // moov present
  });
});

// --- demand pairs via the public API ---------------------------------------

describe("demand pairs (mp3→ogg, mp3→mp4, midi→mp3)", () => {
  it("mp3 → ogg through convertFile with an injected decoder", async () => {
    const mp3 = wavToMp3(realSineWav());
    expect(mp3.ok).toBe(true);
    if (!mp3.ok) return;
    const result = await convertFile(
      { bytes: mp3.value, name: "track.mp3" },
      "audio-ogg",
      { audioDecoder: fakeDecode }
    );
    expect(result.name).toBe("track.ogg");
    expect(decoder.decode(result.bytes.slice(0, 4))).toBe("OggS");
    expect(result.mime).toBe("audio/ogg");
  });

  it("mp3 → mp4 through convertFile with an injected decoder", async () => {
    const mp3 = wavToMp3(realSineWav());
    expect(mp3.ok).toBe(true);
    if (!mp3.ok) return;
    const result = await convertFile(
      { bytes: mp3.value, name: "track.mp3" },
      "audio-mp4",
      { audioDecoder: fakeDecode }
    );
    expect(result.name).toBe("track.mp4");
    expect(decoder.decode(result.bytes.slice(4, 8))).toBe("ftyp");
  });

  it("midi → mp3 end to end", async () => {
    const result = await convertFile({ bytes: tinyMidi(), name: "theme.mid" }, "audio-mp3");
    expect(result.name).toBe("theme.mp3");
    expect(result.bytes[0]).toBe(0xff);
    expect((result.bytes[1]! & 0xe0) === 0xe0).toBe(true);
  });

  it("detects MIDI by magic bytes even with a misleading name", () => {
    const midi = tinyMidi();
    const byMagic = detectFromBytes(midi, "audio-midi");
    expect(byMagic).toBe("audio-midi");
    const viaFile = detectFile(midi, "mystery.bin");
    expect(viaFile.type).toBe("audio-midi");
    expect(viaFile.reliable).toBe(true);
    const viaName = detectFile(midi, "theme.mid");
    expect(viaName.type).toBe("audio-midi");
  });

  it("targets are advertised in the matrix for all audio sources", () => {
    const sources: Array<
      | "audio-mp3" | "audio-wav" | "audio-ogg" | "audio-m4a" | "audio-aac" | "audio-flac" | "audio-aiff" | "audio-midi"
    > = ["audio-mp3", "audio-wav", "audio-ogg", "audio-m4a", "audio-aac", "audio-flac", "audio-aiff", "audio-midi"];
    for (const source of sources) {
      const targets = targetsFor(source);
      expect(targets).toContain("audio-ogg");
      expect(targets).toContain("audio-mp4");
    }
  });
});
