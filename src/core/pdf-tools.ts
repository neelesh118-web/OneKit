import { PDFDocument } from "pdf-lib";

/**
 * PDF toolbox — merge and split PDFs entirely on-device via pdf-lib.
 * Files never leave the browser.
 */

export interface PdfPageInfo {
  /** 1-based page number. */
  number: number;
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d // "%PDF-"
  );
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Merges several PDF byte arrays into one. Returns the merged bytes, or
 * null when nothing usable was provided.
 */
export async function mergePdfs(inputs: Uint8Array[]): Promise<Uint8Array | null> {
  const usable = inputs.filter(isPdfBytes);
  if (usable.length === 0) return null;
  const merged = await PDFDocument.create();
  for (const bytes of usable) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  if (merged.getPageCount() === 0) return null;
  return merged.save();
}

/**
 * Extracts a page range [start, end] (1-based, inclusive) from one PDF.
 * Returns null when the range is empty or out of bounds.
 */
export async function splitPdfRange(
  bytes: Uint8Array,
  start: number,
  end: number
): Promise<Uint8Array | null> {
  if (!isPdfBytes(bytes)) return null;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const from = Math.max(1, Math.round(start));
  const to = Math.min(total, Math.round(end));
  if (from > to || from > total) return null;
  const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, indices);
  for (const page of pages) out.addPage(page);
  return out.save();
}

/** Splits one PDF into single-page PDFs. Returns [] for invalid input. */
export async function splitPdfToPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  if (!isPdfBytes(bytes)) return [];
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const out: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    // copyPages must run on the TARGET document — pages copied from `doc`
    // belong to `doc` and can't be added to a fresh document.
    const single = await PDFDocument.create();
    const page = await single.copyPages(doc, [i]);
    single.addPage(page[0]!);
    out.push(await single.save());
  }
  return out;
}
