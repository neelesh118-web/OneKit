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
