// @vitest-environment node
// Round 9: WPS Presentation (.dps) content sniffing, legacy PowerPoint
// template/slideshow aliases (.pot/.pps), and the presentation targets
// (pptx/odp) added to the ppt and key rows.
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX } from "../src/core/converter/matrix";
import { zipSync, unzipSync } from "fflate/browser";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const pdfMagic = (b: Uint8Array): boolean => dec(b.slice(0, 5)) === "%PDF-";

function utf16le(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 0xff; b[i * 2 + 1] = s.charCodeAt(i) >> 8; }
  return b;
}
function pptRecord(type: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, type, true); dv.setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}
function makeOle2Ppt(text: string): Uint8Array {
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

/** A minimal-but-real OOXML deck: [Content_Types], presentation + slides. */
function makePptxZip(slides: string[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": enc('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),
    "_rels/.rels": enc('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'),
    "ppt/presentation.xml": enc('<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>')
  };
  slides.forEach((text, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = enc(
      `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    );
  });
  return zipSync(files);
}

describe("WPS Presentation (.dps) content sniffing", () => {
  it("detects an OOXML .dps as pptx through the ZIP probe", () => {
    const zip = makePptxZip(["WPS deck title"]);
    expect(detectFile(zip, "deck.dps").type).toBe("pptx");
  });

  it("converts a .dps OOXML deck to pdf", async () => {
    const zip = makePptxZip(["WPS deck title", "Second slide content"]);
    const out = await convertFile({ bytes: zip, name: "deck.dps", mime: "" }, "pdf");
    expect(pdfMagic(out.bytes)).toBe(true);
  });

  it("converts a .dps OOXML deck to text with the slide content", async () => {
    const zip = makePptxZip(["WPS deck title", "Second slide content"]);
    const out = await convertFile({ bytes: zip, name: "deck.dps", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("Second slide content");
  });

  it("routes a binary OLE2 .dps through the PowerPoint text path", async () => {
    const ole = makeOle2Ppt("Binary WPS deck text");
    const out = await convertFile({ bytes: ole, name: "legacy.dps", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("Binary WPS deck text");
  });

  it("rejects an unreadable .dps honestly", async () => {
    await expect(
      convertFile({ bytes: enc("not a real container"), name: "weird.dps", mime: "" }, "text")
    ).rejects.toThrow();
  });

  it("advertises the dps row with full presentation reach", () => {
    expect(MATRIX.dps).toContain("pptx");
    expect(MATRIX.dps).toContain("odp");
    expect(MATRIX.dps).toContain("pdf");
    expect(MATRIX.dps).toContain("image-png");
  });
});

describe("legacy PowerPoint template/slideshow aliases (.pot/.pps)", () => {
  it("detects a .pot OLE2 file as ppt", () => {
    expect(detectFile(makeOle2Ppt("Template title"), "theme.pot").type).toBe("ppt");
  });

  it("detects a .pps OLE2 file as ppt", () => {
    expect(detectFile(makeOle2Ppt("Slide show title"), "demo.pps").type).toBe("ppt");
  });

  it("converts a .pot file to text like a deck", async () => {
    const out = await convertFile({ bytes: makeOle2Ppt("Template title"), name: "theme.pot", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("Template title");
  });
});

describe("ppt and key gain presentation targets", () => {
  it("ppt → pptx builds a real OOXML package", async () => {
    const ole = makeOle2Ppt("Quarterly review");
    const out = await convertFile({ bytes: ole, name: "deck.ppt", mime: "" }, "pptx");
    expect(zipMagic(out.bytes)).toBe(true);
    expect(Object.keys(unzipSync(out.bytes))).toContain("[Content_Types].xml");
  });

  it("ppt → odp builds an OpenDocument presentation", async () => {
    const ole = makeOle2Ppt("Quarterly review");
    const out = await convertFile({ bytes: ole, name: "deck.ppt", mime: "" }, "odp");
    expect(zipMagic(out.bytes)).toBe(true);
    expect(dec(unzipSync(out.bytes)["mimetype"] as Uint8Array)).toContain("opendocument.presentation");
  });

  it("key → odp builds an OpenDocument presentation", async () => {
    const key = zipSync({
      "Index/Document.xml": enc("<document><body><p>Keynote slide one</p></body></document>"),
      "Metadata/BuildVersionHistory.plist": enc("x")
    });
    const out = await convertFile({ bytes: key, name: "deck.key", mime: "" }, "odp");
    expect(zipMagic(out.bytes)).toBe(true);
    expect(dec(unzipSync(out.bytes)["mimetype"] as Uint8Array)).toContain("opendocument.presentation");
  });

  it("rows advertise the presentation targets", () => {
    expect(MATRIX.ppt).toContain("pptx");
    expect(MATRIX.ppt).toContain("odp");
    expect(MATRIX.key).toContain("pptx");
    expect(MATRIX.key).toContain("odp");
  });
});

describe("matrix consistency after round 9", () => {
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
