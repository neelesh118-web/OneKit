import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  isPdfBytes,
  mergePdfs,
  pdfPageCount,
  splitPdfRange,
  splitPdfToPages
} from "../src/core/pdf-tools";

/** Builds a real 2-page PDF with pdf-lib. */
async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    doc.addPage([200, 200]);
  }
  return doc.save();
}

describe("pdf-tools", () => {
  it("recognizes PDF magic bytes", async () => {
    const pdf = await makePdf(1);
    expect(isPdfBytes(pdf)).toBe(true);
    expect(isPdfBytes(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
    expect(isPdfBytes(new Uint8Array([]))).toBe(false);
  });

  it("counts pages", async () => {
    expect(await pdfPageCount(await makePdf(3))).toBe(3);
  });

  it("merges PDFs into one document", async () => {
    const merged = await mergePdfs([await makePdf(2), await makePdf(1)]);
    expect(merged).not.toBeNull();
    expect(await pdfPageCount(merged!)).toBe(3);
  });

  it("returns null when no valid PDFs are provided", async () => {
    expect(await mergePdfs([new Uint8Array([1, 2, 3])])).toBeNull();
    expect(await mergePdfs([])).toBeNull();
  });

  it("extracts a page range (1-based, inclusive)", async () => {
    const pdf = await makePdf(4);
    const range = await splitPdfRange(pdf, 2, 3);
    expect(range).not.toBeNull();
    expect(await pdfPageCount(range!)).toBe(2);
  });

  it("clamps out-of-bounds ranges and rejects empty ones", async () => {
    const pdf = await makePdf(2);
    expect(await splitPdfRange(pdf, 1, 99)).not.toBeNull();
    expect(await splitPdfRange(pdf, 3, 4)).toBeNull();
    expect(await splitPdfRange(pdf, 2, 1)).toBeNull();
    expect(await splitPdfRange(new Uint8Array([0]), 1, 1)).toBeNull();
  });

  it("splits a PDF into single pages", async () => {
    const pages = await splitPdfToPages(await makePdf(3));
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(await pdfPageCount(page)).toBe(1);
    }
    expect(await splitPdfToPages(new Uint8Array([0]))).toEqual([]);
  });
});
