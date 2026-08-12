// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { convertFile, MIME_BY_TARGET } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor, TARGET_LABELS } from "../src/core/converter/matrix";
import { samplesToWav, type DecodedAudio } from "../src/core/converter/audio";
import { isPdfBytes, pdfPageCount } from "../src/core/pdf-tools";
import { parseWav } from "../src/core/converter/audio";

const encoder = new TextEncoder();
const toBytes = (s: string): Uint8Array => encoder.encode(s);

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function makeTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 300]);
  page.drawText("Hello from the converter", { x: 40, y: 260, size: 12, font });
  return doc.save();
}

describe("converter matrix honesty", () => {
  it("every source has at least the targets the matrix promises", () => {
    const sources = [
      "image-png", "image-svg", "pdf", "docx", "xlsx", "epub", "html", "markdown",
      "text", "csv", "json", "yaml", "xml", "zip", "tar", "gzip",
      "font-ttf", "font-woff", "font-woff2", "audio-mp3", "audio-wav", "audio-ogg", "audio-m4a"
    ] as const;
    for (const s of sources) {
      expect(targetsFor(s).length, `matrix entry for ${s}`).toBeGreaterThan(0);
    }
    expect(targetsFor("unknown")).toEqual([]);
  });
});

describe("converter convertFile", () => {
  it("converts text → Base64 with a sensible output name", async () => {
    const result = await convertFile({ bytes: toBytes("hello"), name: "notes.txt" }, "txt-base64");
    expect(result.name).toBe("notes.txt");
    expect(result.mime).toBe("text/plain");
    expect(toBytes("hello").length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(result.bytes)).toBeTruthy();
  });

  it("converts JSON → YAML", async () => {
    const result = await convertFile(
      { bytes: toBytes('{"name": "OneKit", "tools": 55}'), name: "data.json" },
      "yaml"
    );
    expect(result.name).toBe("data.yaml");
    expect(result.mime).toBe(MIME_BY_TARGET.yaml);
    expect(new TextDecoder().decode(result.bytes)).toContain("name: OneKit");
  });

  it("converts a real PDF → text", async () => {
    const pdf = await makeTextPdf();
    const result = await convertFile({ bytes: pdf, name: "doc.pdf" }, "text");
    expect(result.name).toBe("doc.txt");
    expect(new TextDecoder().decode(result.bytes)).toContain("Hello from the converter");
  });

  it("converts HTML → a real PDF", async () => {
    const result = await convertFile(
      { bytes: toBytes("<h1>Title</h1><p>Body text here.</p>"), name: "page.html" },
      "pdf"
    );
    expect(result.name).toBe("page.pdf");
    expect(isPdfBytes(result.bytes)).toBe(true);
    expect(await pdfPageCount(result.bytes)).toBeGreaterThanOrEqual(1);
  });

  it("converts WAV → MP3 through the orchestrator", async () => {
    const rate = 8000;
    const samples = new Float32Array(rate);
    for (let i = 0; i < rate; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3;
    const wav = samplesToWav(rate, 1, samples);
    const result = await convertFile({ bytes: wav, name: "tone.wav" }, "audio-mp3");
    expect(result.name).toBe("tone.mp3");
    expect(result.mime).toBe("audio/mpeg");
    expect(result.bytes.length).toBeGreaterThan(1000);
  });

  it("converts MP3 (fake-decoded) → WAV", async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0]); // ID3 magic
    const decoder = async (): Promise<DecodedAudio> => ({
      sampleRate: 16000,
      channels: 1,
      samples: new Float32Array([0.5, -0.5, 0.25])
    });
    const result = await convertFile(
      { bytes: mp3, name: "song.mp3" },
      "audio-wav",
      { audioDecoder: decoder }
    );
    expect(result.name).toBe("song.wav");
    const parsed = parseWav(result.bytes);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.sampleRate).toBe(16000);
  });

  it("converts ZIP → TAR preserving contents", async () => {
    const { filesToZip, unzipToFiles } = await import("../src/core/converter/archives");
    const { fromTar } = await import("../src/core/converter/tar");
    const zip = filesToZip({ "a.txt": toBytes("A"), "b.txt": toBytes("BB") });
    const result = await convertFile({ bytes: zip, name: "pack.zip" }, "tar");
    expect(result.name).toBe("pack.tar");
    const back = fromTar(result.bytes);
    expect(new TextDecoder().decode(back["a.txt"])).toBe("A");
    expect(new TextDecoder().decode(back["b.txt"])).toBe("BB");
    expect(Object.keys(unzipToFiles(zip)).length).toBe(2);
  });

  it("converts font TTF → WOFF", async () => {
    const FontLib = (await import("fonteditor-core")).default;
    const F = (FontLib as unknown as { default?: typeof FontLib }).default ?? FontLib;
    const ttf = new Uint8Array(
      (F as { Font: { create(): { write(o: { type: string }): ArrayBuffer } } }).Font.create().write({ type: "ttf" })
    );
    const result = await convertFile({ bytes: ttf, name: "font.ttf" }, "font-woff");
    expect(result.name).toBe("font.woff");
    const magic = String.fromCharCode(result.bytes[0]!, result.bytes[1]!, result.bytes[2]!, result.bytes[3]!);
    expect(magic).toBe("wOFF");
  });

  it("throws honestly for unknown formats", async () => {
    await expect(
      convertFile({ bytes: new Uint8Array([0xde, 0xad, 0xbe, 0xef]), name: "blob.xyz" }, "text")
    ).rejects.toThrow(/Couldn't detect/);
  });

  it("throws honestly for unsupported pairs", async () => {
    // Text → spreadsheet isn't offered; PDF → Excel isn't offered locally either.
    await expect(
      convertFile({ bytes: new TextEncoder().encode("hello"), name: "note.txt" }, "xlsx")
    ).rejects.toThrow(/isn't supported locally/);
    await expect(
      convertFile({ bytes: await makeTextPdf(), name: "doc.pdf" }, "xlsx")
    ).rejects.toThrow(/isn't supported locally/);
  });

  it("throws honestly for corrupt images", async () => {
    await expect(
      convertFile({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]), name: "img.png" }, "image-jpeg")
    ).rejects.toThrow(/Could not decode this image/);
  });

  it("threads image quality and max-dimension settings through", async () => {
    let canvasW = 0;
    let canvasH = 0;
    let blobQuality: number | undefined;
    const ctx = {
      drawImage(): void {},
      translate(): void {},
      rotate(): void {},
      scale(): void {}
    };
    const deps = {
      canvasFactory: () =>
        ({
          get width() {
            return canvasW;
          },
          set width(v: number) {
            canvasW = v;
          },
          get height() {
            return canvasH;
          },
          set height(v: number) {
            canvasH = v;
          },
          getContext: (kind: string) => (kind === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void, _mime?: string, quality?: number): void {
            blobQuality = quality;
            cb(new Blob([new Uint8Array([5, 5, 5])]));
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 32, height: 16, close(): void {} }) as unknown as ImageBitmap
    };
    const result = await convertFile(
      { bytes: pngHeader, name: "big.png" },
      "image-jpeg",
      { canvas: deps, image: { quality: 0.4, maxDimension: 8 } }
    );
    expect(result.name).toBe("big.jpg");
    expect(canvasW).toBe(8); // 32 → 8 (longest side)
    expect(canvasH).toBe(4); // 16 → 4, proportional
    expect(blobQuality).toBe(0.4);
    expect(Array.from(result.bytes)).toEqual([5, 5, 5]);
  });
});
