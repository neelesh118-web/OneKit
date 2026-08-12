// @vitest-environment node
// Round 13: binary CGM (ISO 8632) metafiles — element-walker text extraction
// + subset SVG rendering, the .cbr RAR honesty error, and comic-book OCR
// prose targets (real tesseract.js through the same runOcr path).
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { cgmToSvg, cgmToText } from "../src/core/converter/cgm";
import { canvasOptions } from "./canvas-options";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const pngMagic = (b: Uint8Array): boolean => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/* CGM fixture ------------------------------------------------------------ */

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** One CGM element: class/id nibble header byte + parameter length byte. */
function element(cls: number, id: number, params: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + params.length);
  out[0] = (cls << 4) | id;
  out[1] = params.length;
  out.set(params, 2);
  return out;
}

/** Big-endian 16-bit integers (CGM's default integer VDC). */
function i16(...vals: number[]): Uint8Array {
  const b = new Uint8Array(vals.length * 2);
  vals.forEach((v, i) => {
    b[i * 2] = (v >> 8) & 0xff;
    b[i * 2 + 1] = v & 0xff;
  });
  return b;
}

/** A CGM String parameter: length byte + characters. */
function cgmStr(s: string): Uint8Array {
  const b = enc(s);
  const out = new Uint8Array(1 + b.length);
  out[0] = b.length;
  out.set(b, 1);
  return out;
}

function buildCgm(): Uint8Array {
  return concat(
    element(0, 1, enc("BEGMF")), // begin metafile
    element(0, 6, new Uint8Array(0)), // begin metafile body
    element(0, 3, new Uint8Array(0)), // begin picture
    element(0, 4, new Uint8Array(0)), // begin picture body
    // TEXT: position (100,200), height 50, orientation, string "Hello CGM".
    element(4, 4, concat(i16(100, 200), i16(50), i16(1000, 0, 0, 1000), cgmStr("Hello CGM"))),
    // RESTRICTED TEXT: flag + extent then the string.
    element(4, 5, concat(i16(300, 400), i16(40), i16(1000, 0, 0, 1000), new Uint8Array([0]), i16(300, 400, 500, 440), cgmStr("Restricted text"))),
    // RECTANGLE: corners (0,0) and (100,80).
    element(4, 11, i16(0, 0, 100, 80)),
    // POLYGON: triangle.
    element(4, 7, i16(0, 0, 200, 0, 100, 150)),
    element(0, 5, new Uint8Array(0)), // end picture
    element(0, 2, new Uint8Array(0)) // end metafile
  );
}

const CGM = buildCgm();
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);
const ocrOpts = {
  ocr: { recognize: async (): Promise<string> => "Hello OCR world" }
};

describe("round 13: binary CGM metafiles", () => {
  it("detects CGM by its BEGIN METAFILE magic and its extension", () => {
    expect(detectFile(CGM, "drawing.cgm").type).toBe("cgm");
    expect(detectFile(CGM, "drawing.bin").type).toBe("cgm");
  });

  it("reads the TEXT and RESTRICTED TEXT records as prose", () => {
    const text = cgmToText(CGM);
    expect(text).toContain("Hello CGM");
    expect(text).toContain("Restricted text");
  });

  it("renders the primitive subset to a real SVG", () => {
    const svg = cgmToSvg(CGM);
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<rect");
    expect(svg).toContain("Hello CGM");
    expect(svg).toContain("viewBox=\"0 0 1000 1000\"");
  });

  it("advertises the full document + image target set", () => {
    const targets = targetsFor("cgm");
    for (const t of ["text", "html", "pdf", "docx", "epub", "mobi", "fb2", "image-png", "image-svg", "svgz", "cbz"] as const) {
      expect(targets).toContain(t);
    }
  });

  it("converts cgm → text / pdf / docx / html", async () => {
    const text = await convertFile({ name: "drawing.cgm", bytes: CGM }, "text");
    expect(dec(text.bytes)).toContain("Hello CGM");

    const pdf = await convertFile({ name: "drawing.cgm", bytes: CGM }, "pdf");
    expect(dec(pdf.bytes.subarray(0, 5))).toBe("%PDF-");

    const docx = await convertFile({ name: "drawing.cgm", bytes: CGM }, "docx");
    expect(zipMagic(docx.bytes)).toBe(true);

    const html = await convertFile({ name: "drawing.cgm", bytes: CGM }, "html");
    expect(dec(html.bytes)).toContain("Hello CGM");
  });

  it("converts cgm → a raster image through the SVG renderer", async () => {
    const png = await convertFile({ name: "drawing.cgm", bytes: CGM }, "image-png", canvasOptions());
    expect(pngMagic(png.bytes)).toBe(true);
  });
});

describe("round 13: .cbr honesty + comic OCR prose", () => {
  it("says .cbr (RAR) can't be read instead of failing with a zip error", async () => {
    const rar = concat(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]), enc("garbage"));
    expect(detectFile(rar, "comic.cbr").type).toBe("cbz");
    await expect(convertFile({ name: "comic.cbr", bytes: rar }, "pdf")).rejects.toThrow(/RAR comic books/);
  });

  it("advertises OCR prose targets on the cbz row", () => {
    for (const t of ["text", "markdown", "rst", "abw", "xhtml", "ps", "odg", "azw3"] as const) {
      expect(targetsFor("cbz")).toContain(t);
      expect(targetsFor("cbc")).toContain(t);
    }
  });

  it("converts a comic book to text by OCR-ing every page", async () => {
    const cbz = zipSync({ "page-01.png": PIXEL });
    const text = await convertFile({ name: "comic.cbz", bytes: cbz }, "text", ocrOpts);
    expect(dec(text.bytes)).toContain("Hello OCR world");
  });

  it("converts a comic book to an OCR document target", async () => {
    const cbz = zipSync({ "page-01.png": PIXEL });
    const rst = await convertFile({ name: "comic.cbz", bytes: cbz }, "rst", ocrOpts);
    expect(dec(rst.bytes)).toContain("Hello OCR world");
  });
});
