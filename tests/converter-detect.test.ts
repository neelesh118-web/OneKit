// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectFile, detectFromName, type FileType } from "../src/core/converter/detect";

const bytes = (hex: string): Uint8Array =>
  new Uint8Array(hex.split(" ").map((h) => parseInt(h, 16)));

describe("converter detectFromName", () => {
  it("maps common extensions", () => {
    expect(detectFromName("photo.png")).toBe("image-png");
    expect(detectFromName("PHOTO.JPG")).toBe("image-jpeg");
    expect(detectFromName("doc.pdf")).toBe("pdf");
    expect(detectFromName("data.json")).toBe("json");
    expect(detectFromName("book.epub")).toBe("epub");
    expect(detectFromName("font.ttf")).toBe("font-ttf");
    expect(detectFromName("song.mp3")).toBe("audio-mp3");
    expect(detectFromName("notes.md")).toBe("markdown");
    expect(detectFromName("file.tar.gz")).toBe("gzip");
  });

  it("returns unknown for no/unknown extension", () => {
    expect(detectFromName("README")).toBe("unknown");
    expect(detectFromName("file.")).toBe("unknown");
    expect(detectFromName("file.xyz")).toBe("unknown");
    // JFIF is a JPEG container (freeconvert sells JFIF → PNG; it's just JPEG).
    expect(detectFromName("photo.jfif")).toBe("image-jpeg");
    expect(detectFromName("clip.mp4")).toBe("video-mp4");
    expect(detectFromName("clip.webm")).toBe("video-webm");
    expect(detectFromName("clip.mov")).toBe("video-mov");
    expect(detectFromName("song.flac")).toBe("audio-flac");
  });
});

describe("converter detectFromBytes (via detectFile)", () => {
  it("reads magic bytes even with a misleading name", () => {
    const png = bytes("89 50 4e 47 0d 0a 1a 0a");
    expect(detectFile(png, "actually-a-pdf.pdf").type).toBe("image-png");
  });

  it("detects a PDF by magic", () => {
    expect(detectFile(bytes("25 50 44 46 2d 31 2e 37"), "x.bin").type).toBe("pdf");
  });

  it("detects fonts", () => {
    expect(detectFile(bytes("00 01 00 00 00 0f 00 80"), "x").type).toBe("font-ttf");
    expect(detectFile(bytes("77 4f 46 46 00 01 00 00"), "x").type).toBe("font-woff");
    expect(detectFile(bytes("77 4f 46 32 00 01 00 00"), "x").type).toBe("font-woff2");
  });

  it("detects audio magic", () => {
    expect(detectFile(bytes("49 44 33 03 00 00 00"), "x").type).toBe("audio-mp3");
    expect(detectFile(bytes("4f 67 67 53 00 02 00 00"), "x").type).toBe("audio-ogg");
    expect(detectFile(bytes("52 49 46 46 24 00 00 00 57 41 56 45"), "x").type).toBe("audio-wav");
    expect(detectFile(bytes("66 4c 61 43 00 00 00 22"), "x").type).toBe("audio-flac");
  });

  it("detects video magic by ftyp brand and EBML", () => {
    // ftypisom → MP4 video (M4A stays on its own brand).
    expect(detectFile(bytes("00 00 00 18 66 74 79 70 69 73 6f 6d"), "x.bin").type).toBe("video-mp4");
    expect(detectFile(bytes("00 00 00 18 66 74 79 70 6d 70 34 32"), "x.bin").type).toBe("video-mp4");
    // ftypM4A stays audio.
    expect(detectFile(bytes("00 00 00 20 66 74 79 70 4d 34 41 20"), "x.bin").type).toBe("audio-m4a");
    // ftypqt → MOV.
    expect(detectFile(bytes("00 00 00 14 66 74 79 70 71 74 20 20"), "x.bin").type).toBe("video-mov");
    // WebM/Matroska EBML header.
    expect(detectFile(bytes("1a 45 df a3 93 42 82 88 77 65 62 6d"), "x.bin").type).toBe("video-webm");
  });

  it("falls back to the name for text-ish formats", () => {
    const json = new TextEncoder().encode('{"a": 1}');
    expect(detectFile(json, "data.json").type).toBe("json");
  });

  it("marks unreliable detection when nothing matches", () => {
    const result = detectFile(bytes("de ad be ef"), "blob.zzz");
    expect(result.type).toBe("unknown");
    expect(result.reliable).toBe(false);
  });
});
