// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { decodeGifFrames } from "../src/core/converter/gif";
import { targetsFor } from "../src/core/converter/matrix";
import { gifPlaybackMs, videoToGif, type VideoFrame } from "../src/core/converter/video";

const gifMagic = (bytes: Uint8Array): string =>
  String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);

function frame(color: [number, number, number], delayMs: number): VideoFrame {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { width: 4, height: 4, delayMs, data };
}

const fakeExtractor = async (): Promise<VideoFrame[]> => [
  frame([200, 40, 40], 100),
  frame([40, 200, 40], 100)
];

describe("converter video → gif", () => {
  it("encodes extracted frames into an animated GIF with delays", async () => {
    const gif = await videoToGif(new Uint8Array(16), fakeExtractor);
    expect(gifMagic(gif)).toBe("GIF89a");
    const frames = decodeGifFrames(gif);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.delayMs).toBe(100);
    expect(frames[1]!.delayMs).toBe(100);
  });

  it("rejects a video with no capturable frames", async () => {
    await expect(videoToGif(new Uint8Array(16), async () => [])).rejects.toThrow(/any frames/);
  });

  it("computes honest playback time", () => {
    expect(gifPlaybackMs([frame([1, 1, 1], 250), frame([2, 2, 2], 100)])).toBe(350);
  });
});

describe("converter convertFile dispatch", () => {
  it("routes a video to image-gif with an injected extractor", async () => {
    const result = await convertFile(
      { bytes: new Uint8Array(16), name: "clip.mp4" },
      "image-gif",
      { videoFrames: fakeExtractor }
    );
    expect(result.name).toBe("clip.gif");
    expect(result.mime).toBe("image/gif");
    expect(decodeGifFrames(result.bytes)).toHaveLength(2);
  });

  it("routes FLAC audio to WAV and MP3 with a fake decoder", async () => {
    const fakeDecode = async () => ({
      sampleRate: 44100,
      channels: 1,
      samples: new Float32Array([0.1, -0.2, 0.3, -0.4])
    });
    const wav = await convertFile({ bytes: new Uint8Array(16), name: "song.flac" }, "audio-wav", {
      audioDecoder: fakeDecode
    });
    expect(wav.name).toBe("song.wav");
    expect(String.fromCharCode(wav.bytes[0]!, wav.bytes[1]!, wav.bytes[2]!, wav.bytes[3]!)).toBe("RIFF");
    const mp3 = await convertFile({ bytes: new Uint8Array(16), name: "song.flac" }, "audio-mp3", {
      audioDecoder: fakeDecode
    });
    expect(mp3.name).toBe("song.mp3");
    // MP3 frame sync.
    expect(mp3.bytes[0]).toBe(0xff);
  });

  it("routes OGG audio to MP3 too", async () => {
    const fakeDecode = async () => ({
      sampleRate: 44100,
      channels: 2,
      samples: new Float32Array([0.1, -0.1, 0.2, -0.2])
    });
    const mp3 = await convertFile({ bytes: new Uint8Array(16), name: "tune.ogg" }, "audio-mp3", {
      audioDecoder: fakeDecode
    });
    expect(mp3.name).toBe("tune.mp3");
    expect(mp3.bytes[0]).toBe(0xff);
  });

  it("converts a single PDF page to PNG via convertFile", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const pdf = await doc.save();
    // convertFile's pdf → image path renders the first page; in Node the
    // default canvas doesn't exist, so this exercises the honest error
    // path rather than silently producing nothing.
    await expect(
      convertFile({ bytes: pdf, name: "doc.pdf" }, "image-png", {
        canvas: undefined
      })
    ).rejects.toThrow(/Canvas drawing isn't available|Could not render this PDF/);
  });

  it("rejects FLAC → GIF as an unsupported pair", async () => {
    await expect(
      convertFile({ bytes: new Uint8Array(16), name: "song.flac" }, "image-gif", {
        audioDecoder: async () => ({ sampleRate: 44100, channels: 1, samples: new Float32Array(4) })
      })
    ).rejects.toThrow(/isn't supported locally/);
  });
});

describe("converter video → any raster image target", () => {
  it("offers every raster image format as a target for MP4/WebM/MOV, not just GIF/PNG/JPEG", () => {
    for (const source of ["video-mp4", "video-webm", "video-mov"] as const) {
      const targets = targetsFor(source);
      for (const t of [
        "image-webp", "image-avif", "image-svg", "image-ico", "image-bmp",
        "image-tiff", "image-dds", "image-tga", "image-ppm", "image-psd", "image-icns"
      ] as const) {
        expect(targets).toContain(t);
      }
    }
  });

  it("routes a video → WebP through the frame-grab + canvas pipeline (honest rejection without a real browser canvas)", async () => {
    // Node has no <video>/<canvas> — this proves the new dispatch branch
    // is actually reached (not silently falling through to GIF) and
    // fails the same honest way videoToImage already does for PNG/JPEG.
    await expect(
      convertFile({ bytes: new Uint8Array(16), name: "clip.mp4" }, "image-webp", { videoFrames: fakeExtractor })
    ).rejects.toThrow(/browser canvas/);
  });
});
