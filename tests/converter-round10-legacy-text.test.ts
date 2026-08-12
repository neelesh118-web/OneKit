// @vitest-environment node
// Round 10: Psion TCR (zlib text), the legacy OLE2 office family
// (StarWriter/StarCalc/StarDraw, Visio) via text-run extraction, and the
// raster targets (image-png/jpeg/webp/gif) added to ppt and key.
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX } from "../src/core/converter/matrix";
import { canvasOptions } from "./canvas-options";
import { zlibSync } from "fflate/browser";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const pdfMagic = (b: Uint8Array): boolean => dec(b.slice(0, 5)) === "%PDF-";

function utf16le(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 0xff; b[i * 2 + 1] = s.charCodeAt(i) >> 8; }
  return b;
}

/** Synthetic OLE2 with one named stream holding UTF-16LE prose. */
function makeOle2Text(streamName: string, text: string): Uint8Array {
  const stream = utf16le(text);
  const SS = 512;
  const padded = new Uint8Array(Math.max(stream.length, 4096));
  padded.set(stream);
  const numStreamSectors = Math.ceil(padded.length / SS);
  const total = 3 + numStreamSectors;
  const out = new Uint8Array(total * SS);
  const h = new Uint8Array(SS);
  h.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  const dv = new DataView(h.buffer);
  dv.setUint16(24, 0x3e, true); dv.setUint16(26, 3, true); dv.setUint16(28, 0xfffe, true);
  h[30] = 9; h[32] = 6;
  dv.setUint32(44, 1, true); dv.setUint32(48, 2, true); dv.setUint32(56, 4096, true);
  dv.setUint32(60, 0xfffffffe, true); dv.setUint32(76, 1, true);
  for (let i = 80; i < SS; i += 4) dv.setUint32(i, 0xffffffff, true);
  out.set(h, 0);
  const fat = new Uint8Array(SS);
  const fd = new DataView(fat.buffer);
  for (let i = 0; i < 128; i++) fd.setUint32(i * 4, 0xffffffff, true);
  fd.setUint32(2 * 4, 0xfffffffe, true);
  for (let i = 0; i < numStreamSectors; i++) fd.setUint32((3 + i) * 4, i === numStreamSectors - 1 ? 0xfffffffe : 4 + i, true);
  out.set(fat, SS);
  const dir = new Uint8Array(SS);
  const dd = new DataView(dir.buffer);
  const writeEntry = (idx: number, name: string, type: number, start: number, size: number): void => {
    const off = idx * 128;
    const nameBytes = utf16le(name + "\u0000");
    dir.set(nameBytes, off);
    dd.setUint16(off + 64, nameBytes.length, true);
    dir[off + 66] = type; dir[off + 67] = 1;
    dd.setUint32(off + 116, start, true); dd.setUint32(off + 120, size, true);
  };
  writeEntry(0, "Root Entry", 5, 0, 0);
  writeEntry(1, streamName, 2, 3, padded.length);
  out.set(dir, SS * 2);
  out.set(padded, SS * 3);
  return out;
}

describe("Psion TCR (zlib-compressed text)", () => {
  const tcr = new Uint8Array([0xea, 0x03, 0x01, ...zlibSync(enc("The quick brown fox jumps over the lazy dog.\nSecond line here."))]);

  it("detects the TCR magic", () => {
    expect(detectFile(tcr, "notes.tcr").type).toBe("tcr");
  });

  it("converts tcr → text", async () => {
    const out = await convertFile({ bytes: tcr, name: "notes.tcr", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("quick brown fox");
  });

  it("converts tcr → docx", async () => {
    const out = await convertFile({ bytes: tcr, name: "notes.tcr", mime: "" }, "docx");
    expect(zipMagic(out.bytes)).toBe(true);
  });

  it("converts tcr → pdf", async () => {
    const out = await convertFile({ bytes: tcr, name: "notes.tcr", mime: "" }, "pdf");
    expect(pdfMagic(out.bytes)).toBe(true);
  });

  it("rejects corrupt tcr bytes honestly", async () => {
    await expect(
      convertFile({ bytes: new Uint8Array([0xea, 0x03, 0x01, 1, 2, 3, 4]), name: "bad.tcr", mime: "" }, "text")
    ).rejects.toThrow();
  });
});

describe("legacy OLE2 office family (sdw/sdc/sda/vsd)", () => {
  it("detects a StarWriter document stream as sdw", () => {
    expect(detectFile(makeOle2Text("StarWriterDocument", "StarWriter body text here"), "doc.sdw").type).toBe("sdw");
  });

  it("detects a StarCalc document stream as sdc", () => {
    expect(detectFile(makeOle2Text("StarCalcDocument", "Sheet cell contents here"), "sheet.sdc").type).toBe("sdc");
  });

  it("detects a StarDraw document stream as sda", () => {
    expect(detectFile(makeOle2Text("StarDrawDocument", "Drawing text here"), "draw.sda").type).toBe("sda");
  });

  it("detects a Visio document stream as vsd", () => {
    expect(detectFile(makeOle2Text("VisioDocument", "Diagram label text here"), "flow.vsd").type).toBe("vsd");
  });

  it("sdw → text extracts the prose", async () => {
    const out = await convertFile(
      { bytes: makeOle2Text("StarWriterDocument", "StarWriter body text here"), name: "doc.sdw", mime: "" },
      "text"
    );
    expect(dec(out.bytes)).toContain("StarWriter body text here");
  });

  it("vsd → pdf renders the extracted text", async () => {
    const out = await convertFile(
      { bytes: makeOle2Text("VisioDocument", "Diagram label text here"), name: "flow.vsd", mime: "" },
      "pdf"
    );
    expect(pdfMagic(out.bytes)).toBe(true);
  });

  it("sdc → docx builds a Word file with the sheet text", async () => {
    const out = await convertFile(
      { bytes: makeOle2Text("StarCalcDocument", "Revenue total one thousand"), name: "sheet.sdc", mime: "" },
      "docx"
    );
    expect(zipMagic(out.bytes)).toBe(true);
  });

  it("rejects a stream-less OLE2 honestly", async () => {
    await expect(
      convertFile({ bytes: makeOle2Text("Workbook", "no prose stream"), name: "doc.sdw", mime: "" }, "text")
    ).rejects.toThrow();
  });
});

function pptRecord(type: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, type, true); dv.setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function makeOle2PptText(text: string): Uint8Array {
  const stream = new Uint8Array([...pptRecord(0x0fa0, utf16le(text))]);
  const SS = 512;
  const padded = new Uint8Array(Math.max(stream.length, 4096));
  padded.set(stream);
  const numStreamSectors = Math.ceil(padded.length / SS);
  const total = 3 + numStreamSectors;
  const out = new Uint8Array(total * SS);
  const h = new Uint8Array(SS);
  h.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  const dv = new DataView(h.buffer);
  dv.setUint16(24, 0x3e, true); dv.setUint16(26, 3, true); dv.setUint16(28, 0xfffe, true);
  h[30] = 9; h[32] = 6;
  dv.setUint32(44, 1, true); dv.setUint32(48, 2, true); dv.setUint32(56, 4096, true);
  dv.setUint32(60, 0xfffffffe, true); dv.setUint32(76, 1, true);
  for (let i = 80; i < SS; i += 4) dv.setUint32(i, 0xffffffff, true);
  out.set(h, 0);
  const fat = new Uint8Array(SS);
  const fd = new DataView(fat.buffer);
  for (let i = 0; i < 128; i++) fd.setUint32(i * 4, 0xffffffff, true);
  fd.setUint32(2 * 4, 0xfffffffe, true);
  for (let i = 0; i < numStreamSectors; i++) fd.setUint32((3 + i) * 4, i === numStreamSectors - 1 ? 0xfffffffe : 4 + i, true);
  out.set(fat, SS);
  const dir = new Uint8Array(SS);
  const dd = new DataView(dir.buffer);
  const writeEntry = (idx: number, name: string, type: number, start: number, size: number): void => {
    const off = idx * 128;
    const nameBytes = utf16le(name + "\u0000");
    dir.set(nameBytes, off);
    dd.setUint16(off + 64, nameBytes.length, true);
    dir[off + 66] = type; dir[off + 67] = 1;
    dd.setUint32(off + 116, start, true); dd.setUint32(off + 120, size, true);
  };
  writeEntry(0, "Root Entry", 5, 0, 0);
  writeEntry(1, "PowerPoint Document", 2, 3, padded.length);
  out.set(dir, SS * 2);
  out.set(padded, SS * 3);
  return out;
}

describe("ppt and key raster targets", () => {
  const ppt = makeOle2PptText("Quarterly sales review");

  it("ppt → image-png renders the text as a picture", async () => {
    const out = await convertFile({ bytes: ppt, name: "deck.ppt", mime: "" }, "image-png", canvasOptions());
    expect(out.bytes[0]).toBe(0x89); // PNG magic
    expect(out.bytes[1]).toBe(0x50);
  });

  it("key → image-png renders the slide text", async () => {
    const { zipSync } = await import("fflate/browser");
    const key = zipSync({
      "Index/Document.xml": enc("<document><body><p>Keynote slide one</p></body></document>"),
      "Metadata/BuildVersionHistory.plist": enc("x")
    });
    const out = await convertFile({ bytes: key, name: "deck.key", mime: "" }, "image-png", canvasOptions());
    expect(out.bytes[0]).toBe(0x89);
  });

  it("rows advertise the raster targets", () => {
    expect(MATRIX.ppt).toContain("image-png");
    expect(MATRIX.ppt).toContain("image-jpeg");
    expect(MATRIX.key).toContain("image-png");
    expect(MATRIX.key).toContain("image-gif");
  });
});

describe("matrix consistency after round 10", () => {
  it("no duplicates or self-targets", () => {
    const reencode = new Set([
      "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif",
      "image-tiff", "image-svg", "image-qoi", "image-farbfeld", "image-pcx",
      "audio-wav", "audio-aiff", "audio-au", "audio-voc", "audio-ogg", "audio-mp3",
      "audio-mp4", "audio-flac", "audio-midi", "video-mp4", "video-webm", "video-mov"
    ]);
    for (const [source, targets] of Object.entries(MATRIX)) {
      expect(new Set(targets).size, `${source} has duplicates`).toBe(targets.length);
      if (reencode.has(source)) continue;
      expect(targets, `${source} must not list itself`).not.toContain(source);
    }
  });
});
