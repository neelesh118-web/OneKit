// @vitest-environment node
import { describe, expect, it } from "vitest";
import { palmDocCompress, mobiFromHtml } from "../src/core/converter/ebooks-write";
import { isMobi, mobiToHtml } from "../src/core/converter/ebooks";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor, targetExtension } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";
import { csvToXlsx } from "../src/core/converter/documents";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ImageConvertDeps, ImageTarget } from "../src/core/converter/images";

const enc = new TextEncoder();
const toBytes = (s: string): Uint8Array => enc.encode(s);

function fakeDeps(width: number, height: number, encodeTarget: ImageTarget): ImageConvertDeps {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 30;
    rgba[i * 4 + 1] = 160;
    rgba[i * 4 + 2] = 90;
    rgba[i * 4 + 3] = 255;
  }
  const ctx = {
    drawImage(): void {},
    translate(): void {},
    rotate(): void {},
    scale(): void {},
    getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
      return { width: w, height: h, data: rgba };
    }
  };
  const canvas = {
    width,
    height,
    getContext: (kind: string) => (kind === "2d" ? ctx : null),
    toBlob(cb: (b: Blob | null) => void, _mime?: string, _quality?: number): void {
      if (encodeTarget === "image-svg") {
        cb(null);
        return;
      }
      cb(new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], { type: "application/octet-stream" }));
    }
  };
  return {
    canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    decode: async () => ({ width, height, close(): void {} }) as unknown as ImageBitmap
  };
}

async function tinyPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 250, size: 14, font });
  return new Uint8Array(await doc.save());
}

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Test Book</title></head>
<body><h1>Chapter One</h1><p>The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.</p></body></html>`;

describe("PalmDOC compressor", () => {
  it("round-trips through mobiToHtml with repeated + edge-case bytes", () => {
    // \x01-\x08 and 0x80-0xFF can't be single literals; repeats exercise back-refs.
    const tricky =
      "ab\x01\x02\x03\x04\x05\x06\x07\x08" +
      "\u00ff\u00fe\u00fd\u0080\u0081" +
      "the quick brown fox ".repeat(20) +
      "end";
    const written = mobiFromHtml(`<html><body>${tricky}</body></html>`, { title: "T" });
    expect(isMobi(written)).toBe(true);
    expect(mobiToHtml(written)).toContain(tricky);
  });

  it("compresses genuinely (PalmDOC output smaller than input for repeats)", () => {
    const input = enc.encode("hello hello hello hello hello hello hello hello");
    const compressed = palmDocCompress(input);
    expect(compressed.length).toBeLessThan(input.length);
  });
});

describe("MOBI container", () => {
  it("writes a readable PalmDB/MOBI file with the right structure", () => {
    const written = mobiFromHtml(HTML, { title: "Test Book" });
    expect(isMobi(written)).toBe(true);
    expect(detectFile(written, "book.mobi").type).toBe("mobi");
    const view = new DataView(written.buffer, written.byteOffset, written.byteLength);
    const count = view.getUint16(76, false);
    expect(count).toBeGreaterThan(0);
    // Record 0's PalmDOC header: compression type 2, encryption 0.
    const rec0 = view.getUint32(78, false);
    expect(view.getUint16(rec0, false)).toBe(2);
    expect(view.getUint16(rec0 + 12, false)).toBe(0);
    expect(String.fromCharCode(...written.subarray(60, 68))).toBe("BOOKMOBI");
  });

  it("round-trips the book's HTML through mobiToHtml", () => {
    const written = mobiFromHtml(HTML, { title: "Test Book" });
    const read = mobiToHtml(written);
    expect(read).toContain("Chapter One");
    expect(read).toContain("quick brown fox");
  });
});

describe("source → MOBI pairs", () => {
  it("pdf → mobi extracts the page text into a Kindle ebook", async () => {
    const pdf = await tinyPdf("Invoice total: 42 dollars");
    const result = await convertFile({ bytes: pdf, name: "invoice.pdf" }, "mobi");
    expect(result.name).toBe("invoice.mobi");
    expect(result.mime).toBe("application/x-mobipocket-ebook");
    expect(isMobi(result.bytes)).toBe(true);
    expect(mobiToHtml(result.bytes)).toContain("Invoice total: 42 dollars");
  });

  it("epub → mobi keeps the content", async () => {
    const epubResult = await convertFile({ bytes: toBytes("# E\n\nHello from an epub."), name: "e.md" }, "epub");
    const result = await convertFile({ bytes: epubResult.bytes, name: "e.epub" }, "mobi");
    expect(result.name).toBe("e.mobi");
    expect(mobiToHtml(result.bytes)).toContain("Hello from an epub");
  });

  it("docx → mobi keeps the text", async () => {
    const docx = await convertFile({ bytes: toBytes("A wordy document"), name: "d.txt" }, "docx");
    const result = await convertFile({ bytes: docx.bytes, name: "d.docx" }, "mobi");
    expect(mobiToHtml(result.bytes)).toContain("A wordy document");
  });

  it("html → mobi, markdown → mobi, txt → mobi, fb2 → mobi all produce readable books", async () => {
    const cases: [string, string][] = [
      ["page.html", "<html><body><p>From html.</p></body></html>"],
      ["page.md", "# Title\n\nFrom markdown."],
      ["page.txt", "Just plain text here."]
    ];
    for (const [name, content] of cases) {
      const result = await convertFile({ bytes: toBytes(content), name }, "mobi");
      expect(result.name).toBe(name.replace(/\.[a-z]+$/, "") + ".mobi");
      expect(isMobi(result.bytes)).toBe(true);
      const read = mobiToHtml(result.bytes);
      expect(read.length).toBeGreaterThan(20);
    }
    const fb2 =
      '<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">' +
      "<description><title-info><book-title>FB</book-title></title-info></description>" +
      "<body><section><title><p>C1</p></title><p>From fictionbook.</p></section></body></FictionBook>";
    const result = await convertFile({ bytes: toBytes(fb2), name: "book.fb2" }, "mobi");
    expect(mobiToHtml(result.bytes)).toContain("From fictionbook");
  });

  it("mobi → azw re-packages the same container under the Kindle extension", async () => {
    const mobi = mobiFromHtml(HTML, { title: "Test Book" });
    const result = await convertFile({ bytes: mobi, name: "book.mobi" }, "azw");
    expect(result.name).toBe("book.azw");
    expect(result.mime).toBe("application/vnd.amazon.ebook");
    expect(isMobi(result.bytes)).toBe(true);
    expect(mobiToHtml(result.bytes)).toContain("Chapter One");
  });
});

describe("matrix wiring", () => {
  it("advertises mobi/azw and the free wins", () => {
    expect(targetsFor("pdf")).toContain("mobi");
    expect(targetsFor("pdf")).toContain("image-svg");
    expect(targetsFor("epub")).toContain("mobi");
    expect(targetsFor("docx")).toContain("mobi");
    expect(targetsFor("html")).toContain("mobi");
    expect(targetsFor("markdown")).toContain("mobi");
    expect(targetsFor("text")).toContain("mobi");
    expect(targetsFor("fb2")).toContain("mobi");
    expect(targetsFor("mobi")).toContain("azw");
    expect(targetsFor("mobi")).not.toContain("mobi"); // no self-conversion
    expect(targetsFor("xlsm")).toContain("xlsx");
    expect(targetExtension("mobi")).toBe("mobi");
    expect(targetExtension("azw")).toBe("azw");
  });
});

describe("free wins", () => {
  // pdf → svg runs through the browser canvas pipeline (pdfjs page render →
  // svg wrap), so the honest node-side check is the matrix advertisement —
  // asserted in "matrix wiring" above.

  it("xlsm → xlsx strips the macro stream and keeps the cells", async () => {
    const xlsx = await csvToXlsx("name,amount\nWidget,42");
    const files = unzipSync(xlsx);
    files["xl/vbaProject.bin"] = new Uint8Array([1, 2, 3, 4]);
    const ct = strFromU8(files["[Content_Types].xml"]!).replace(
      "</Types>",
      '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>'
    );
    files["[Content_Types].xml"] = strToU8(ct);
    const xlsm = zipSync(files);
    expect(unzipSync(xlsm)["xl/vbaProject.bin"]).toBeDefined();

    const result = await convertFile({ bytes: xlsm, name: "book.xlsm" }, "xlsx");
    expect(result.name).toBe("book.xlsx");
    const out = unzipSync(result.bytes);
    expect(out["xl/vbaProject.bin"]).toBeUndefined();
    expect(strFromU8(out["[Content_Types].xml"]!)).not.toContain("vbaProject");
    expect(strFromU8(out["xl/worksheets/sheet1.xml"]!)).toContain("Widget");
  });
});
