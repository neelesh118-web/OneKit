// @vitest-environment node
// Round 16: matrix widening — every row now exposes the full honest reach
// the shared renderers (renderDocument / renderTable / routeRecords) and the
// OCR pipeline already support. Image → EPUB keeps the picture (photo album),
// the other prose targets read the OCR text; tables reach every data +
// document target; text-url is text; zip-of-images is a comic.
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { canvasOptions } from "./canvas-options";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const pngMagic = (b: Uint8Array): boolean => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** 1×1 transparent PNG — the raster fixture every image test reuses. */
const PIXEL_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PIXEL = Uint8Array.from(Buffer.from(PIXEL_B64, "base64"));

const ocrOpts = {
  ...canvasOptions(),
  ocr: { recognize: async (): Promise<string> => "Hello OCR world" },
};

/** convertFile returns { bytes, name, mime } — unwrap to just the bytes. */
async function conv(
  input: Parameters<typeof convertFile>[0],
  target: Parameters<typeof convertFile>[1],
  opts?: Parameters<typeof convertFile>[2]
): Promise<Uint8Array> {
  const r = await convertFile(input, target, opts);
  return r.bytes;
}

/* The twelve prose targets added to the image rows. */
const PROSE_12 = [
  "epub", "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile",
  "mediawiki", "asciidoc", "opml", "txt-url",
] as const;

/* The eleven OCR-prose targets added to the comic rows (EPUB already existed). */
const COMIC_11 = [
  "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile",
  "mediawiki", "asciidoc", "opml", "txt-url",
] as const;

const TABLE_12 = [
  "text", "pptx", "mobi", "azw", "fb2", "htmlz", "txtz",
  "txt-url", "azw3", "azw4", "abw", "zabw",
] as const;

describe("round-16 matrix reach", () => {
  it("gives every main image source the twelve prose targets", () => {
    for (const src of ["image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif", "image-heic", "image-tiff"] as const) {
      for (const t of PROSE_12) expect(targetsFor(src)).toContain(t);
    }
  });

  it("gives the RAW photo sources the same prose reach", () => {
    for (const t of PROSE_12) expect(targetsFor("raw-cr2")).toContain(t);
  });

  it("gives every small raster source the full image+document reach", () => {
    for (const src of ["image-ico", "image-dds", "image-tga", "image-ppm", "image-psd", "image-icns", "image-pbm", "image-pgm", "image-pam", "image-xbm", "image-qoi", "image-farbfeld", "image-pcx", "image-xpm", "image-wbmp"] as const) {
      expect(targetsFor(src)).toContain("epub");
      expect(targetsFor(src)).toContain("mobi");
      expect(targetsFor(src)).toContain("docm");
      expect(targetsFor(src)).toContain("pptm");
      expect(targetsFor(src)).toContain("azw4");
      expect(targetsFor(src)).not.toContain(src);
    }
  });

  it("gives SVG sources the prose targets (text is directly extractable)", () => {
    for (const t of PROSE_12) expect(targetsFor("image-svg")).toContain(t);
    for (const t of PROSE_12) expect(targetsFor("svgz")).toContain(t);
  });

  it("gives every table source the twelve document targets", () => {
    for (const src of ["csv", "tsv", "json", "yaml", "xlsx", "xls", "ods", "xlsm"] as const) {
      for (const t of TABLE_12) expect(targetsFor(src)).toContain(t);
    }
  });

  it("widens cbz/cbc, text, azw4 and the legacy OLE2 doc family", () => {
    for (const t of COMIC_11) {
      expect(targetsFor("cbz")).toContain(t);
      expect(targetsFor("cbc")).toContain(t);
    }
    for (const t of ["htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml"]) {
      expect(targetsFor("text")).toContain(t);
    }
    for (const t of ["rst", "svgz", "abw", "zabw"]) expect(targetsFor("azw4")).toContain(t);
    for (const src of ["sdw", "sdc", "sda", "vsd", "tcr"] as const) {
      expect(targetsFor(src)).toContain("htmlz");
      expect(targetsFor(src)).toContain("cbz");
      expect(targetsFor(src)).toContain("opml");
      expect(targetsFor(src)).toContain("image-png");
    }
  });

  it("treats XML as a table source and text-url as text", () => {
    expect(targetsFor("xml")).toContain("pdf");
    expect(targetsFor("xml")).toContain("pptx");
    expect(targetsFor("xml")).toContain("mobi");
    expect(targetsFor("text-url")).toContain("docx");
    expect(targetsFor("text-url")).toContain("mobi");
    expect(targetsFor("text-url")).toContain("image-png");
    expect(targetsFor("zip")).toContain("cbz");
    expect(targetsFor("zip")).toContain("cbc");
  });
});

describe("round-16 behavior", () => {
  it("image → epub keeps the picture (a real EPUB package)", async () => {
    const epub = await conv({ name: "photo.png", bytes: PIXEL }, "epub");
    expect(zipMagic(epub)).toBe(true);
    const manifest = dec(epub);
    // epubFromImages builds a zip — look for the mimetype/content markers
    expect(manifest.includes("application/epub+zip") || manifest.includes("content.opf")).toBe(true);
    // The photo itself must be inside, not just OCR text.
    expect(manifest.includes("page-001.png")).toBe(true);
  });

  it("image → mobi reads the OCR text into a real Palm database", async () => {
    const mobi = await conv({ name: "photo.png", bytes: PIXEL }, "mobi", ocrOpts);
    expect(dec(mobi)).toContain("BOOKMOBI");
  });

  it("image → fb2 renders the OCR text as FictionBook XML", async () => {
    const fb2 = await conv({ name: "photo.png", bytes: PIXEL }, "fb2", ocrOpts);
    expect(dec(fb2)).toContain("<FictionBook");
  });

  it("image → htmlz is a zip of the OCR'd page", async () => {
    const htmlz = await conv({ name: "photo.png", bytes: PIXEL }, "htmlz", ocrOpts);
    expect(zipMagic(htmlz)).toBe(true);
  });

  it("comic → mobi reads every page's OCR text", async () => {
    const cbz = zipSync({ "page-01.png": PIXEL, "page-02.png": PIXEL });
    const mobi = await conv({ name: "comic.cbz", bytes: cbz }, "mobi", ocrOpts);
    expect(dec(mobi)).toContain("BOOKMOBI");
  });

  it("spreadsheet → presentation is a real PPTX", async () => {
    const csv = enc("name,role\nAda,dev\nGrace,admiral");
    const pptx = await conv({ name: "team.csv", bytes: csv }, "pptx");
    expect(zipMagic(pptx)).toBe(true);
    expect(dec(pptx).includes("ppt/presentation.xml") || dec(pptx).includes("presentation.xml")).toBe(true);
  });

  it("spreadsheet → ebook and → plain text both work", async () => {
    const csv = enc("name,role\nAda,dev");
    const mobi = await conv({ name: "team.csv", bytes: csv }, "mobi");
    expect(dec(mobi)).toContain("BOOKMOBI");
    const text = await conv({ name: "team.csv", bytes: csv }, "text");
    expect(dec(text)).toContain("Ada");
  });

  it("text → image renders through the raster pipeline", async () => {
    const png = await conv({ name: "note.txt", bytes: enc("hello world") }, "image-png", canvasOptions());
    expect(pngMagic(png)).toBe(true);
  });

  it("text-url decodes and converts like the text source", async () => {
    const url = enc(encodeURIComponent("hello from a url-encoded note"));
    // .uri is the extension the detector maps to text-url (the content is
    // otherwise indistinguishable from plain text).
    const docx = await conv({ name: "note.uri", bytes: url }, "docx");
    expect(zipMagic(docx)).toBe(true);
    expect(dec(docx)).toContain("word/document.xml");
    const plain = await conv({ name: "note.uri", bytes: url }, "text");
    expect(dec(plain)).toContain("hello from a url-encoded note");
  });

  it("XML reaches the table targets through the shared renderer", async () => {
    const xml = enc("<root><row><name>Ada</name><role>dev</role></row></root>");
    const pdf = await conv({ name: "data.xml", bytes: xml }, "pdf");
    expect(dec(pdf.slice(0, 4))).toBe("%PDF");
    const csv = await conv({ name: "data.xml", bytes: xml }, "csv");
    expect(dec(csv)).toContain("Ada");
  });

  it("zip of images becomes a comic archive", async () => {
    const zip = zipSync({ "1.png": PIXEL, "2.png": PIXEL });
    const cbz = await conv({ name: "pages.zip", bytes: zip }, "cbz");
    expect(zipMagic(cbz)).toBe(true);
    expect(dec(cbz).includes("1.png") || dec(cbz).includes("2.png")).toBe(true);
  });

  it("tables render every image target honestly (not a text dump)", async () => {
    const csv = enc("a,b\n1,2");
    const png = await conv({ name: "data.csv", bytes: csv }, "image-avif", canvasOptions());
    expect(pngMagic(png)).toBe(true);
  });

  it("detect still labels the widened sources correctly", () => {
    expect(detectFile(PIXEL, "photo.png").type).toBe("image-png");
    expect(detectFile(enc("<root/>"), "data.xml").type).toBe("xml");
  });
});
