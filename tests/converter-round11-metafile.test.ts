// @vitest-environment node
// Round 11: Windows metafiles (EMF/WMF subset renderers + text extraction),
// XPS packages, Microsoft Publisher (OOXML zip + OLE2 Quill), classic
// Sketch/sK1 drawings, and the full DOC_TARGETS added to the iWork rows.
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX } from "../src/core/converter/matrix";
import { emfToSvg, emfToText, wmfToSvg, wmfToText } from "../src/core/converter/metafile";
import { xpsToHtml } from "../src/core/converter/xps";
import { pubToHtml } from "../src/core/converter/pub";
import { skToHtml, skToSvg } from "../src/core/converter/sketch";
import { canvasOptions } from "./canvas-options";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

function utf16le(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 0xff; b[i * 2 + 1] = s.charCodeAt(i) >> 8; }
  return b;
}

/* EMF fixture ------------------------------------------------------------ */

function emfRecord(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, type, true);
  dv.setUint32(4, out.length, true);
  out.set(payload, 8);
  return out;
}

function rectl(left: number, top: number, right: number, bottom: number): Uint8Array {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setInt32(0, left, true); dv.setInt32(4, top, true);
  dv.setInt32(8, right, true); dv.setInt32(12, bottom, true);
  return out;
}

function makeEmf(): Uint8Array {
  // EMR_HEADER with bounds.
  const header = emfRecord(0x1, rectl(0, 0, 400, 300));
  // EMR_SETTEXTCOLOR (0x24) — dark blue.
  const setColor = emfRecord(0x24, new Uint8Array([0x00, 0x00, 0x80, 0x00]));
  // EMR_EXTTEXTOUTW (0x54): bounds + graphics mode + scales + EMRTEXT.
  const text = "Quarterly revenue up";
  const stringBytes = utf16le(text);
  // EMRTEXT is 40 bytes; the string follows it, offString = 40.
  const emrText = new Uint8Array(40 + stringBytes.length);
  const tdv = new DataView(emrText.buffer);
  tdv.setInt32(0, 40, true); tdv.setInt32(4, 20, true); // ptlReference
  tdv.setUint32(8, text.length, true); // nChars
  tdv.setUint32(12, 40, true); // offString → after the EMRTEXT struct
  tdv.setUint32(16, 0, true); // fOptions
  emrText.set(rectl(30, 10, 380, 40), 20);
  tdv.setUint32(36, 0, true); // offDx
  emrText.set(stringBytes, 40);
  const extText = emfRecord(0x54, new Uint8Array([...rectl(0, 0, 400, 300), ...new Uint8Array(12), ...emrText]));
  // EMR_RECTANGLE (0x2B): bounds + color (0x008000 = green).
  const rect = emfRecord(0x2b, new Uint8Array([...rectl(50, 50, 250, 150), 0x00, 0x80, 0x00, 0x00]));
  return new Uint8Array([...header, ...setColor, ...extText, ...rect]);
}

/* WMF fixture ------------------------------------------------------------ */

function wmfRecord(fn: number, params: Uint8Array): Uint8Array {
  const sizeBytes = 6 + params.length;
  const padded = Math.ceil(sizeBytes / 4) * 4;
  const out = new Uint8Array(padded);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, padded / 2, true);
  dv.setUint16(4, fn, true);
  out.set(params, 6);
  return out;
}

function makeWmf(): Uint8Array {
  const placeable = new Uint8Array(22);
  const pdv = new DataView(placeable.buffer);
  pdv.setUint32(0, 0x9ac6cdd7, true); // key
  pdv.setUint16(4, 1, true); // hmf
  pdv.setInt16(6, 0, true); pdv.setInt16(8, 0, true); // left, top
  pdv.setInt16(10, 400, true); pdv.setInt16(12, 300, true); // right, bottom
  pdv.setUint16(14, 1440, true); // unit
  // META_TEXTOUT (0x521): y, x, count, string.
  const msg = "Sales report Q3";
  const textOut = new Uint8Array([0x14, 0x00, 0x14, 0x00, msg.length & 0xff, 0x00]);
  const textRec = wmfRecord(0x521, new Uint8Array([...textOut, ...enc(msg)]));
  // META_RECTANGLE (0x41B): bottom, right, top, left.
  const rectParams = new Uint8Array(8);
  const rdv = new DataView(rectParams.buffer);
  rdv.setInt16(0, 200, true); rdv.setInt16(2, 300, true); rdv.setInt16(4, 100, true); rdv.setInt16(6, 100, true);
  const rectRec = wmfRecord(0x41b, rectParams);
  return new Uint8Array([...placeable, ...textRec, ...rectRec]);
}

/* XPS fixture ------------------------------------------------------------ */

function makeXps(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": enc("<Types><Default Extension=\"fpage\" ContentType=\"application/vnd.ms-package.xps-fixedpage+xml\"/></Types>"),
    "_rels/.rels": enc("<Relationships><Relationship Target=\"/FixedDocumentSequence.fdseq\"/></Relationships>"),
    "FixedDocumentSequence.fdseq": enc("<FixedDocumentSequence xmlns=\"http://schemas.microsoft.com/xps/2005/06\"><DocumentReference/></FixedDocumentSequence>"),
    "Documents/1/FixedDocument.fdoc": enc("<FixedDocument/>"),
    "Documents/1/Pages/1.fpage": enc('<FixedPage xmlns="http://schemas.microsoft.com/xps/2005/06" Width="612" Height="792"><Glyphs UnicodeString="First XPS page text"/><Glyphs UnicodeString="More glyph text"/></FixedPage>'),
    "Documents/1/Pages/2.fpage": enc('<FixedPage Width="612" Height="792"><Glyphs UnicodeString="Second page"/></FixedPage>')
  });
}

/* PUB fixtures ----------------------------------------------------------- */

function makePubZip(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": enc("<Types><Default Extension=\"xml\" ContentType=\"application/xml\"/></Types>"),
    "publisher/publisher.xml": enc("<publisher><w:t>Brochure headline</w:t><a:t>Brochure body text</a:t></publisher>"),
    "publisher/document.xml": enc("<document><w:t>Third run of text</w:t></document>")
  });
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

/* sK1 fixture ------------------------------------------------------------ */

const SK1_TEXT = `#sK1
[PageLayout]
[Document]
e Page 0 0 612 792
e Rectangle 50 50 150 100
e Ellipse 200 200 300 250
e Line 10 10 100 100
e SimpleText "Hello from sK1"
`;

/* Tests ------------------------------------------------------------------ */

describe("EMF metafile", () => {
  it("detects the EMF header magic", () => {
    expect(detectFile(makeEmf(), "drawing.emf").type).toBe("emf");
  });

  it("extracts the EXTTEXTOUTW strings", () => {
    expect(emfToText(makeEmf())).toContain("Quarterly revenue up");
  });

  it("renders the supported records to SVG", () => {
    const svg = emfToSvg(makeEmf());
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("Quarterly revenue up");
  });

  it("converts emf → text and emf → docx end to end", async () => {
    const out = await convertFile({ bytes: makeEmf(), name: "drawing.emf", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("Quarterly revenue up");
    const docx = await convertFile({ bytes: makeEmf(), name: "drawing.emf", mime: "" }, "docx");
    expect(zipMagic(docx.bytes)).toBe(true);
  });
});

describe("WMF metafile", () => {
  it("detects the placeable-header magic", () => {
    expect(detectFile(makeWmf(), "drawing.wmf").type).toBe("wmf");
  });

  it("extracts the TEXTOUT strings", () => {
    expect(wmfToText(makeWmf())).toContain("Sales report Q3");
  });

  it("renders the supported records to SVG", () => {
    const svg = wmfToSvg(makeWmf());
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("Sales report Q3");
  });

  it("converts wmf → pdf end to end", async () => {
    const out = await convertFile({ bytes: makeWmf(), name: "drawing.wmf", mime: "" }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("XPS packages", () => {
  it("detects the XPS ZIP flavour", () => {
    expect(detectFile(makeXps(), "doc.xps").type).toBe("xps");
  });

  it("extracts the Glyphs text page by page", () => {
    const html = xpsToHtml(makeXps());
    expect(html).toContain("First XPS page text");
    expect(html).toContain("Second page");
    expect(html).toContain("Page 2");
  });

  it("converts xps → epub end to end", async () => {
    const out = await convertFile({ bytes: makeXps(), name: "doc.xps", mime: "" }, "epub");
    expect(zipMagic(out.bytes)).toBe(true);
  });
});

describe("Microsoft Publisher", () => {
  it("detects the OOXML pub flavour", () => {
    expect(detectFile(makePubZip(), "flyer.pub").type).toBe("pub");
  });

  it("reads the OOXML *:t runs", () => {
    const html = pubToHtml(makePubZip());
    expect(html).toContain("Brochure headline");
    expect(html).toContain("Third run of text");
  });

  it("reads legacy binary Publisher from the Quill stream", () => {
    const ole = makeOle2Text("Quill", "Legacy publisher body");
    expect(detectFile(ole, "old.pub").type).toBe("pub");
    expect(pubToHtml(ole)).toContain("Legacy publisher body");
  });

  it("converts pub → docx end to end", async () => {
    const out = await convertFile({ bytes: makePubZip(), name: "flyer.pub", mime: "" }, "docx");
    expect(zipMagic(out.bytes)).toBe(true);
  });
});

describe("sK1 / Sketch drawings", () => {
  it("detects the #sK1 text header", () => {
    expect(detectFile(enc(SK1_TEXT), "logo.sk1").type).toBe("sk1");
    expect(detectFile(enc(SK1_TEXT), "logo.sk").type).toBe("sk1");
  });

  it("renders basic shapes and quoted strings to SVG", () => {
    const svg = skToSvg(enc(SK1_TEXT));
    expect(svg).toContain("<rect");
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("<line");
    expect(svg).toContain("Hello from sK1");
  });

  it("extracts the text objects as prose", () => {
    expect(skToHtml(enc(SK1_TEXT))).toContain("Hello from sK1");
  });

  it("falls back to plain text for unparseable files", async () => {
    const out = await convertFile({ bytes: enc("Just some random notes.\nNothing sketchy here."), name: "notes.sk", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("random notes");
  });
});

describe("iWork rows gain the full document set", () => {
  const pagesFixture = zipSync({
    "Index/Document.xml": enc("<document><body><p>Hello from Pages document</p></body></document>"),
    "Metadata/BuildVersionHistory.plist": enc("<plist/>")
  });

  it("advertises the new targets in the matrix", () => {
    for (const row of ["pages", "numbers", "key", "ppt"] as const) {
      expect(MATRIX[row]).toContain("image-png");
      expect(MATRIX[row]).toContain("azw3");
      expect(MATRIX[row]).toContain("abw");
      expect(MATRIX[row]).toContain("svgz");
    }
    expect(MATRIX.pages).toContain("pptx");
    expect(MATRIX.numbers).toContain("pdf");
  });

  it("converts pages → pptx and pages → image end to end", async () => {
    const pptx = await convertFile({ bytes: pagesFixture, name: "report.pages", mime: "" }, "pptx");
    expect(zipMagic(pptx.bytes)).toBe(true);
    const img = await convertFile({ bytes: pagesFixture, name: "report.pages", mime: "" }, "image-png", canvasOptions());
    expect(img.bytes[0]).toBe(0x89); // PNG magic
  });
});

describe("matrix consistency after round 11", () => {
  it("new rows are advertised with no self-targets or duplicates", () => {
    for (const row of ["xps", "pub", "emf", "wmf", "sk1"] as const) {
      expect(new Set(MATRIX[row]).size).toBe(MATRIX[row].length);
      expect(MATRIX[row]).not.toContain(row);
      expect(MATRIX[row]).toContain("pdf");
      expect(MATRIX[row]).toContain("docx");
    }
  });
});
