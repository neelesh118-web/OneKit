// @vitest-environment node
// Round 8: Apple Keynote (iWork zip), legacy binary PowerPoint (OLE2 text
// records), the pdf target gaps, record sources gaining PDF, dxf document
// targets, and text→comic packs.
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX } from "../src/core/converter/matrix";
import { extractPptText, readOle2, readOle2Stream } from "../src/core/converter/ole2";
import { zipSync, unzipSync } from "fflate/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { canvasOptions } from "./canvas-options";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const magic = (b: Uint8Array, len = 8): string => dec(b.slice(0, len));
// Binary-safe checks (TextDecoder mangles non-UTF-8 bytes).
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const gzipMagic = (b: Uint8Array): boolean => b[0] === 0x1f && b[1] === 0x8b;
const pdfMagic = (b: Uint8Array): boolean => dec(b.slice(0, 5)) === "%PDF-";
/** PalmDB header: the 4-byte type at offset 60, creator at 64. */
const palmType = (b: Uint8Array): string => dec(b.slice(60, 68));

async function makePdf(lines = ["Page one line", "Page two line"]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = pdf.addPage([300, 300]);
    page.drawText(line, { x: 40, y: 150, size: 14, font });
  }
  return pdf.save();
}

// ── Minimal OLE2 compound-file builder (512-byte sectors, FAT chain) ───────
function utf16le(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    b[i * 2] = s.charCodeAt(i) & 0xff;
    b[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return b;
}

function pptRecord(type: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); // recVer + recInstance
  dv.setUint16(2, type, true);
  dv.setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function makeOle2Ppt(text: string, notes: string): Uint8Array {
  const stream = new Uint8Array([
    ...pptRecord(0x0fa0, utf16le(text)), // TextCharsAtom (UTF-16LE)
    ...pptRecord(0x0fa8, enc(notes)), // TextBytesAtom (ANSI)
  ]);
  const SS = 512;
  const padded = new Uint8Array(Math.max(stream.length, 4096));
  padded.set(stream);
  const numStreamSectors = Math.ceil(padded.length / SS);
  const total = 3 + numStreamSectors;
  const out = new Uint8Array(total * SS);

  // Header
  const h = new Uint8Array(SS);
  h.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  const dv = new DataView(h.buffer);
  dv.setUint16(24, 0x3e, true);
  dv.setUint16(26, 3, true);
  dv.setUint16(28, 0xfffe, true);
  h[30] = 9; // sector shift
  h[32] = 6; // mini sector shift
  dv.setUint32(44, 1, true); // 1 FAT sector
  dv.setUint32(48, 2, true); // first directory sector
  dv.setUint32(56, 4096, true); // mini cutoff
  dv.setUint32(60, 0xfffffffe, true); // no mini FAT
  dv.setUint32(76, 1, true); // DIFAT[0] = FAT at sector 1
  for (let i = 80; i < SS; i += 4) dv.setUint32(i, 0xffffffff, true);
  out.set(h, 0);

  // FAT
  const fat = new Uint8Array(SS);
  const fd = new DataView(fat.buffer);
  for (let i = 0; i < 128; i++) fd.setUint32(i * 4, 0xffffffff, true);
  fd.setUint32(2 * 4, 0xfffffffe, true); // directory → end
  for (let i = 0; i < numStreamSectors; i++) {
    fd.setUint32((3 + i) * 4, i === numStreamSectors - 1 ? 0xfffffffe : 4 + i, true);
  }
  out.set(fat, SS);

  // Directory: root + PowerPoint Document
  const dir = new Uint8Array(SS);
  const dd = new DataView(dir.buffer);
  const writeEntry = (idx: number, name: string, type: number, start: number, size: number): void => {
    const off = idx * 128;
    const nameBytes = utf16le(name + "\u0000");
    dir.set(nameBytes, off);
    dd.setUint16(off + 64, nameBytes.length, true);
    dir[off + 66] = type;
    dir[off + 67] = 1;
    dd.setUint32(off + 116, start, true);
    dd.setUint32(off + 120, size, true);
  };
  // Streams < 4096 bytes live in the root mini-stream, which the builder
  // doesn't construct — so declare the padded (regular-sector) size and let
  // the reader walk the FAT chain, exactly like a real large stream.
  writeEntry(0, "Root Entry", 5, 0, 0);
  writeEntry(1, "PowerPoint Document", 2, 3, padded.length);
  out.set(dir, SS * 2);

  // Stream data
  out.set(padded, SS * 3);
  return out;
}

// ── Synthetic iWork (Keynote) zip ──────────────────────────────────────────
function makeKey(zipEntries: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(zipEntries)) files[name] = enc(value);
  return zipSync(files);
}

describe("legacy binary PowerPoint (.ppt) via OLE2", () => {
  const ole = makeOle2Ppt("Quarterly Sales Review", "Bullet: launch in March");

  it("detects the OLE2 PowerPoint stream as ppt", () => {
    expect(detectFile(ole, "deck.ppt").type).toBe("ppt");
  });

  it("reads the text records out of the compound file", () => {
    const file = readOle2(ole);
    const stream = readOle2Stream(file, "PowerPoint Document");
    expect(stream).toBeDefined();
    const text = extractPptText(stream!);
    expect(text).toContain("Quarterly Sales Review");
    expect(text).toContain("Bullet: launch in March");
  });

  it("converts ppt → text", async () => {
    const out = await convertFile({ bytes: ole, name: "deck.ppt", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("Quarterly Sales Review");
  });

  it("converts ppt → docx with the slide text inside", async () => {
    const out = await convertFile({ bytes: ole, name: "deck.ppt", mime: "" }, "docx");
    expect(zipMagic(out.bytes)).toBe(true);
    const files = unzipSync(out.bytes);
    const xml = dec(files["word/document.xml"] as Uint8Array);
    expect(xml).toContain("Quarterly Sales Review");
  });

  it("converts ppt → pdf", async () => {
    const out = await convertFile({ bytes: ole, name: "deck.ppt", mime: "" }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("rejects a non-OLE2 file honestly", async () => {
    await expect(
      convertFile({ bytes: enc("just some text"), name: "fake.ppt", mime: "" }, "text")
    ).rejects.toThrow();
  });

  it("advertises the ppt row in the matrix", () => {
    expect(MATRIX.ppt).toContain("docx");
    expect(MATRIX.ppt).toContain("epub");
  });
});

describe("Apple Keynote (.key) via the iWork container", () => {
  const key = makeKey({
    "Index/Document.xml": "<document><body><p>Keynote slide one</p><p>Keynote slide two</p></body></document>",
    "Metadata/BuildVersionHistory.plist": "x"
  });

  it("detects the iWork zip as key", () => {
    expect(detectFile(key, "deck.key").type).toBe("key");
  });

  it("extracts slide text and converts to a document", async () => {
    const out = await convertFile({ bytes: key, name: "deck.key", mime: "" }, "markdown");
    expect(dec(out.bytes)).toContain("Keynote slide one");
  });

  it("converts key → docx", async () => {
    const out = await convertFile({ bytes: key, name: "deck.key", mime: "" }, "docx");
    expect(zipMagic(out.bytes)).toBe(true);
  });

  it("converts key → pdf", async () => {
    const out = await convertFile({ bytes: key, name: "deck.key", mime: "" }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("advertises the key row in the matrix", () => {
    expect(MATRIX.key).toContain("pdf");
    expect(MATRIX.key).toContain("html");
  });
});

describe("pdf target gaps (round 6/7 writers never wired to the pdf row)", () => {
  it("pdf → azw3 produces a Kindle (PalmDB) container", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "azw3");
    expect(palmType(out.bytes)).toBe("BOOKMOBI");
  });

  it("pdf → mhtml produces a MIME archive", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "mhtml");
    expect(magic(out.bytes, 8)).toBe("MIME-Ver");
  });

  it("pdf → eps produces a PostScript file", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "eps");
    expect(magic(out.bytes, 4)).toBe("%!PS");
  });

  it("pdf → abw produces an AbiWord document", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "abw");
    expect(dec(out.bytes.slice(0, 200))).toContain("abiword");
  });

  it("pdf → zabw produces a gzipped AbiWord document", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "zabw");
    expect(gzipMagic(out.bytes)).toBe(true);
  });

  it("pdf → rst keeps the extracted text", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "rst");
    expect(dec(out.bytes)).toContain("Page one line");
  });

  it("pdf → svgz compresses the rendering", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "svgz");
    expect(gzipMagic(out.bytes)).toBe(true);
  });

  it("pdf → azw4 wraps the rendered PDF in a PalmDB container", async () => {
    const out = await convertFile({ bytes: await makePdf(), name: "doc.pdf", mime: "" }, "azw4");
    expect(palmType(out.bytes)).toBe("BOOKMOBI");
  });
});

describe("record sources gain PDF (et, geojson, csv)", () => {
  it("et (CSV payload) → pdf", async () => {
    const et = enc("name,value\nWidgets,42\nGadgets,7\n");
    expect(detectFile(et, "sheet.et").type).toBe("et");
    const out = await convertFile({ bytes: et, name: "sheet.et", mime: "" }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("geojson → pdf", async () => {
    const gj = enc('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"HQ"},"geometry":{"type":"Point","coordinates":[1,2]}}]}');
    const out = await convertFile({ bytes: gj, name: "places.geojson", mime: "" }, "pdf");
    expect(pdfMagic(out.bytes)).toBe(true);
  });

  it("csv → pdf is still advertised", async () => {
    expect(MATRIX.csv).toContain("pdf");
    expect(MATRIX.et).toContain("pdf");
  });
});

describe("dxf document targets", () => {
  const DXF = enc(
    "0\nSECTION\n2\nENTITIES\n" +
      "0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n50\n" +
      "0\nTEXT\n8\n0\n10\n50\n20\n60\n40\n0.5\n1\nNorth arrow\n" +
      "0\nENDSEC\n0\nEOF\n"
  );

  it("dxf → docx carries the entity inventory", async () => {
    const out = await convertFile({ bytes: DXF, name: "plan.dxf", mime: "" }, "docx");
    expect(zipMagic(out.bytes)).toBe(true);
  });

  it("dxf → markdown keeps the entities as text", async () => {
    const out = await convertFile({ bytes: DXF, name: "plan.dxf", mime: "" }, "markdown");
    expect(dec(out.bytes)).toContain("North arrow");
  });

  it("dxf row advertises the document targets", () => {
    expect(MATRIX.dxf).toContain("docx");
    expect(MATRIX.dxf).toContain("epub");
    expect(MATRIX.dxf).toContain("odt");
  });
});

describe("text → comic packs", () => {
  it("text → cbz renders a single-page comic zip", async () => {
    const out = await convertFile({ bytes: enc("Comic page text"), name: "story.txt", mime: "" }, "cbz", canvasOptions());
    expect(zipMagic(out.bytes)).toBe(true);
    expect(Object.keys(unzipSync(out.bytes)).some((n) => /\.png$/i.test(n))).toBe(true);
  });

  it("text row advertises cbz and cbc", () => {
    expect(MATRIX.text).toContain("cbz");
    expect(MATRIX.text).toContain("cbc");
  });
});

describe("matrix consistency after round 8", () => {
  it("no source lists itself (re-encodes excepted)", () => {
    const reencode = new Set([
      "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif",
      "image-tiff", "image-svg", "image-qoi", "image-farbfeld", "image-pcx",
      "audio-wav", "audio-aiff", "audio-au", "audio-voc", "audio-ogg", "audio-mp3",
      "audio-mp4", "audio-m4b", "audio-flac", "audio-midi", "video-mp4", "video-webm", "video-mov"
    ]);
    for (const [source, targets] of Object.entries(MATRIX)) {
      if (reencode.has(source)) continue;
      expect(targets, `${source} must not list itself`).not.toContain(source);
    }
  });

  it("no duplicate targets per source", () => {
    for (const [source, targets] of Object.entries(MATRIX)) {
      expect(new Set(targets).size, `${source} has duplicates`).toBe(targets.length);
    }
  });
});
