import { describe, expect, it } from "vitest";
import { detectFromName, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";

describe("batch: MKV / MPEG-TS / AMR sources", () => {
  it("detects the three new sources by extension", () => {
    expect(detectFromName("movie.mkv")).toBe("video-mkv");
    expect(detectFromName("stream.ts")).toBe("video-ts");
    expect(detectFromName("clip.m2ts")).toBe("video-ts");
    expect(detectFromName("cam.mts")).toBe("video-ts");
    expect(detectFromName("cam.mod")).toBe("video-ts");
    expect(detectFromName("voice.amr")).toBe("audio-amr");
  });

  it("detects MKV via its EBML magic with the mkv fallback", () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFromBytes(bytes, "video-mkv")).toBe("video-mkv");
    // Same magic without the mkv fallback still routes to WebM (pre-existing).
    expect(detectFromBytes(bytes, "video-webm")).toBe("video-webm");
  });

  it("detects MPEG-TS via the 0x47 sync-byte pattern", () => {
    const bytes = new Uint8Array(400);
    for (let i = 0; i < bytes.length; i += 188) bytes[i] = 0x47;
    expect(detectFromBytes(bytes, "unknown")).toBe("video-ts");
    // M2TS variant: 192-byte packets (4-byte timestamp prefix).
    const m2ts = new Uint8Array(400);
    for (let i = 0; i < m2ts.length; i += 192) m2ts[i] = 0x47;
    expect(detectFromBytes(m2ts, "unknown")).toBe("video-ts");
  });

  it("detects AMR via its #!AMR magic", () => {
    const bytes = new TextEncoder().encode("#!AMR\n");
    expect(detectFromBytes(bytes, "unknown")).toBe("audio-amr");
  });

  it("advertises the same honest reach as the other video sources", () => {
    const mkv = targetsFor("video-mkv");
    const ts = targetsFor("video-ts");
    for (const t of ["video-mp4", "video-webm", "image-png", "image-jpeg", "image-gif", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"]) {
      expect(mkv).toContain(t);
      expect(ts).toContain(t);
    }
    // No MOV remux (that's MP4-only), no 3GP output.
    expect(mkv).not.toContain("video-mov");
    expect(ts).not.toContain("video-mov");
    expect(mkv).not.toContain("video-3gp");
  });

  it("detects AMR but advertises no targets (no AMR decoder in Chromium's Android ffmpeg)", () => {
    // Honest boundary: AMR is detected so the app can name it, but there
    // is no AMR decoder in Chromium's Android ffmpeg build, so
    // decodeAudioData cannot decode it. Advertising targets would be a lie.
    expect(targetsFor("audio-amr")).toEqual([]);
  });
});
