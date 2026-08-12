/**
 * Document conversions — PDF text extraction, DOCX/EPUB → HTML,
 * HTML ↔ Markdown, XLSX ↔ CSV/JSON, JSON ↔ YAML/XML/CSV, and HTML → PDF.
 * Every library runs on-device; nothing is uploaded.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { toArrayBuffer } from "./util";
import { detectFromBytes } from "./detect";
import { convertImage } from "./images";
// Make pdfjs's worker available on the main thread so extraction works in
// extension popups, Node, and tests without spawning a worker.
import * as pdfjsWorkerModule from "pdfjs-dist/legacy/build/pdf.worker.mjs";
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorkerModule;

import mammoth from "mammoth";
import TurndownService from "turndown";
import { marked } from "marked";
import XLSX from "../../vendor/xlsx.mjs";
import * as yaml from "js-yaml";
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { textToRtf } from "./rtf";
import { buildOdt } from "./odf";
import { buildPptx, slidesToHtml, textToSlides, type Slide } from "./pptx";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* PDF ---------------------------------------------------------------- */

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  let task;
  let pdf;
  try {
    task = getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false
    });
    pdf = await task.promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        const itemAny = item as { str?: string; hasEOL?: boolean };
        line += itemAny.str ?? "";
        if (itemAny.hasEOL) {
          out += line.trimEnd() + "\n";
          line = "";
        }
      }
      out += line.trimEnd() + "\n";
    }
    return out.replace(/\n{3,}/g, "\n\n").trim();
  } catch (err) {
    throw new Error(`Could not read this PDF: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await task?.destroy().catch(() => {});
  }
}

/** PDF → Markdown: extracted text is already valid Markdown. */
export async function pdfToMarkdown(bytes: Uint8Array): Promise<string> {
  return pdfToText(bytes);
}

function pdfTextParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** PDF to reStructuredText with escaped prose and a conventional title. */
export async function pdfToRst(bytes: Uint8Array): Promise<string> {
  const paragraphs = pdfTextParagraphs(await pdfToText(bytes));
  const escaped = paragraphs.map((paragraph) => paragraph.replace(/([\\*`|_])/g, "\\$1"));
  return ["PDF text", "========", "", ...escaped].join("\n").trimEnd() + "\n";
}

/** PDF to a standalone TeX document with reserved prose characters escaped. */
export async function pdfToTex(bytes: Uint8Array): Promise<string> {
  const paragraphs = pdfTextParagraphs(await pdfToText(bytes));
  const escapeTex = (text: string): string => text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}#$%&_])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
  const body = paragraphs.map(escapeTex).join("\n\n");
  return `\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}\n\\title{PDF text}\n\\begin{document}\n\\maketitle\n\n${body}\n\\end{document}\n`;
}

/** PDF → HTML: wrap extracted paragraphs. */
export async function pdfToHtml(bytes: Uint8Array): Promise<string> {
  const text = await pdfToText(bytes);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>PDF text</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

/* PDF → images ------------------------------------------------------- */

export interface PdfImageFile {
  bytes: Uint8Array;
  name: string;
}

/**
 * PDF → PNG/JPEG: renders every page to an image via pdfjs. Multi-page
 * documents produce one image per page (the caller zips them). The
 * canvas factory is injectable so tests can stub the render surface.
 */
export async function pdfToImages(
  bytes: Uint8Array,
  format: "png" | "jpeg",
  deps: { canvasFactory?: () => HTMLCanvasElement; scale?: number } = {}
): Promise<PdfImageFile[]> {
  const scale = Math.min(4, Math.max(1, deps.scale ?? 2));
  const canvasFactory = deps.canvasFactory ?? (() => document.createElement("canvas"));
  const ext = format === "png" ? "png" : "jpg";
  const mime = format === "png" ? "image/png" : "image/jpeg";
  let task;
  let pdf;
  try {
    task = getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false
    });
    pdf = await task.promise;
    const out: PdfImageFile[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = canvasFactory();
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas drawing isn't available in this browser.");
      await page.render({ canvasContext: ctx, viewport } as never).promise;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mime, 0.92);
      });
      if (!blob) throw new Error(`This browser couldn't encode page ${i} as ${mime}.`);
      out.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        name: `page-${String(i).padStart(2, "0")}.${ext}`
      });
    }
    return out;
  } catch (err) {
    if (err instanceof Error && /Could not read this PDF/.test(err.message)) throw err;
    throw new Error(`Could not render this PDF: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await task?.destroy().catch(() => {});
  }
}

/* Images → PDF ------------------------------------------------------- */

/**
 * Images → PDF: packs one or several images into a single PDF, one
 * image per page, fitted to A4 without upscaling. PNG/JPEG embed
 * directly; other raster formats re-encode to PNG first (injectable for
 * tests — the browser path uses canvas).
 */
export async function imagesToPdf(
  files: { bytes: Uint8Array; name: string }[],
  deps: { rasterize?: (bytes: Uint8Array, name: string) => Promise<Uint8Array> } = {}
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("Pick at least one image to make a PDF.");
  const rasterize =
    deps.rasterize ??
    (async (b: Uint8Array, name: string) => {
      const type = detectFromBytes(b, "unknown");
      if (type === "image-png" || type === "image-jpeg") return b;
      try {
        return await convertImage(b, "image-png");
      } catch {
        throw new Error(`Couldn't prepare ${name} for the PDF.`);
      }
    });
  const doc = await PDFDocument.create();
  const maxW = 595.28; // A4 portrait points
  const maxH = 841.89;
  for (const file of files) {
    const ready = await rasterize(file.bytes, file.name);
    const type = detectFromBytes(ready, "unknown");
    const image =
      type === "image-jpeg"
        ? await doc.embedJpg(ready)
        : type === "image-png"
          ? await doc.embedPng(ready)
          : null;
    if (!image) throw new Error(`Couldn't embed ${file.name} in the PDF.`);
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    const page = doc.addPage([maxW, maxH]);
    page.drawImage(image, { x: (maxW - w) / 2, y: (maxH - h) / 2, width: w, height: h });
  }
  return doc.save();
}

/* Text-ish → PDF ----------------------------------------------------- */

/** Plain text → PDF (word-wrapped paragraphs, like the HTML path). */
export function textToPdf(text: string): Promise<Uint8Array> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.replace(/\s*\n\s*/g, " ").trim())}</p>`)
    .join("\n");
  return htmlToPdf(`<!doctype html>\n<html><head><meta charset="utf-8"></head>\n<body>\n${paragraphs}\n</body>\n</html>`);
}

/** Markdown → PDF (renders through the HTML path). */
export async function markdownToPdf(md: string): Promise<Uint8Array> {
  return htmlToPdf(markdownToHtml(md));
}

/**
 * CSV → PDF: renders the rows as an HTML table. The PDF text layout
 * flattens the table to readable rows (cells separated by spaces).
 */
export function csvToPdf(csv: string): Promise<Uint8Array> {
  const rows = parseCsv(csv);
  const table = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("\n");
  return htmlToPdf(`<!doctype html>\n<html><head><meta charset="utf-8"></head>\n<body>\n<table>${table}</table>\n</body>\n</html>`);
}

/** EPUB → PDF (renders the chapters through the HTML path). */
export async function epubToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  return htmlToPdf(epubToHtml(bytes));
}

/** DOCX → PDF (renders the document through the HTML path). */
export async function docxToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  return htmlToPdf(await docxToHtml(bytes));
}

/* DOCX --------------------------------------------------------------- */

export async function docxToHtml(bytes: Uint8Array): Promise<string> {
  try {
    // Node's mammoth build wants a Buffer; the browser build wants an
    // ArrayBuffer. Pass whichever this host understands.
    const maybeBuffer = (globalThis as { Buffer?: { from(a: ArrayBuffer): unknown } }).Buffer;
    const options = maybeBuffer
      ? { buffer: maybeBuffer.from(toArrayBuffer(bytes)) }
      : { arrayBuffer: toArrayBuffer(bytes) };
    const result = await mammoth.convertToHtml(options as never);
    return result.value;
  } catch {
    throw new Error("Could not read this .docx file — it may be corrupt or password-protected.");
  }
}

/* HTML / Markdown ---------------------------------------------------- */

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** HTML → PDF via pdf-lib (A4, Helvetica, word-wrapped paragraphs). */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const text = htmlToText(html);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const lineHeight = size * 1.4;
  const margin = 56;
  const pageW = 595.28;
  const pageH = 841.89;
  const maxWidth = pageW - margin * 2;
  const maxChars = Math.max(20, Math.floor(maxWidth / (size * 0.5)));
  const lines = wrapText(text, maxChars);
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    page.drawText(line, { x: margin, y, size, font, maxWidth });
    y -= lineHeight;
  }
  return doc.save();
}

function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
  }
  return out.length > 0 ? out : [""];
}

/* DOCX writer (minimal OOXML) --------------------------------------- */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds a valid .docx (OOXML package) from a list of paragraph strings.
 * The zip is assembled by hand with fflate — no heavy Office library.
 */
export function buildDocx(paragraphs: string[]): Uint8Array {
  const body = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space=\"preserve\">${escapeXml(p)}</w:t></w:r></w:p>`
    )
    .join("");
  const documentXml =
    `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n` +
    `<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">` +
    `<w:body>${body}` +
    `<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr>` +
    `</w:body></w:document>`;
  const contentTypes =
    `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n` +
    `<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">` +
    `<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>` +
    `<Default Extension=\"xml\" ContentType=\"application/xml\"/>` +
    `<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>` +
    `</Types>`;
  const rels =
    `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n` +
    `<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">` +
    `<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>` +
    `</Relationships>`;
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  return zipSync({
    "[Content_Types].xml": enc(contentTypes),
    "_rels/.rels": enc(rels),
    "word/document.xml": enc(documentXml)
  });
}

/** Plain text → DOCX (one paragraph per line). */
export function textToDocx(text: string): Uint8Array {
  const paragraphs = text.split(/\r?\n/).map((l) => (l.trim() === "" ? " " : l));
  return buildDocx(paragraphs.length > 0 ? paragraphs : [" "]);
}

/** Plain text to an OOXML Word template, preserving the editable DOCX body. */
export function textToDotx(text: string): Uint8Array {
  const files = unzipSync(textToDocx(text));
  const contentTypesName = "[Content_Types].xml";
  const contentTypes = files[contentTypesName];
  if (!contentTypes) throw new Error("Could not create the Word template package.");
  const xml = new TextDecoder().decode(contentTypes);
  const documentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  const templateType = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml";
  if (!xml.includes(documentType)) throw new Error("Could not identify the Word document part.");
  files[contentTypesName] = new TextEncoder().encode(xml.replace(documentType, templateType));
  return zipSync(files);
}

/** HTML → DOCX (flattens to paragraphs). */
export function htmlToDocx(html: string): Uint8Array {
  return textToDocx(htmlToText(html));
}

/** Markdown → DOCX (renders to HTML, then flattens to paragraphs). */
export function markdownToDocx(md: string): Uint8Array {
  return htmlToDocx(markdownToHtml(md));
}

/* Data → HTML table -------------------------------------------------- */

function tableHtml(rows: string[][]): string {
  const head =
    rows[0] && rows[0].length > 0
      ? `<tr>${rows[0].map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`
      : "";
  const body = rows
    .slice(1)
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>Table</title>\n<style>table{border-collapse:collapse;font-family:system-ui,sans-serif}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f4f4f4}</style></head>\n<body>\n<table>${head}${body}</table>\n</body>\n</html>`;
}

/** CSV → HTML table. */
export function csvToHtml(csv: string): string {
  return tableHtml(parseCsv(csv));
}

/** CSV → Markdown table (pipes, with an escape for literal pipes). */
export function csvToMarkdown(csv: string): string {
  const rows = parseCsv(csv);
  if (rows.length === 0) return "";
  const esc = (c: string): string => c.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const header = rows[0]!.map(esc);
  const body = rows.slice(1).map((r) => `| ${r.map(esc).join(" | ")} |`);
  return `| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${body.join("\n")}`;
}

/** JSON (object or array of objects) → HTML table. */
export function jsonToHtml(jsonText: string): string {
  const parsed = parseJsonOrThrow(jsonText);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const objects = rows.filter(
    (r): r is Record<string, unknown> => r !== null && typeof r === "object" && !Array.isArray(r)
  );
  if (objects.length === 0) {
    throw new Error("JSON must be an object or an array of objects to make a table.");
  }
  const columns = Array.from(new Set(objects.flatMap((r) => Object.keys(r))));
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    // Nested objects/arrays render as compact JSON instead of "[object Object]".
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const grid: string[][] = [
    columns,
    ...objects.map((o) => columns.map((c) => cell(o[c])))
  ];
  return tableHtml(grid);
}

/** XLSX → HTML table (first sheet). */
export async function xlsxToHtml(bytes: Uint8Array): Promise<string> {
  return csvToHtml(await xlsxToCsv(bytes));
}

/* XLSX / CSV --------------------------------------------------------- */

export async function xlsxToCsv(bytes: Uint8Array): Promise<string> {
  const wb = XLSX.read(bytes, { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("The workbook has no sheets.");
  return XLSX.utils.sheet_to_csv(wb.Sheets[name]!);
}

export async function xlsxToJson(bytes: Uint8Array): Promise<string> {
  const wb = XLSX.read(bytes, { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("The workbook has no sheets.");
  return JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[name]!), null, 2);
}

export async function csvToXlsx(csvText: string): Promise<Uint8Array> {
  const wb = XLSX.read(csvText, { type: "string" });
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(out as ArrayBuffer);
}

/** RFC-4180-ish CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushField();
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    pushField();
    rows.push(row);
  }
  return rows;
}

/** CSV → macro-enabled OOXML workbook without a VBA project. */
export function csvToXlsm(csvText: string): Uint8Array {
  const wb = XLSX.read(csvText, { type: "string" });
  const out = XLSX.write(wb, { bookType: "xlsm", type: "array" });
  return new Uint8Array(out as ArrayBuffer);
}

/** CSV table rendered as a self-contained SVG, ready for the image pipeline. */
export function csvToSvg(text: string): Uint8Array {
  const rows = parseCsv(text);
  if (rows.length === 0 || rows.every((row) => row.every((cell) => cell.trim() === ""))) {
    throw new Error("This CSV contains no table data to render.");
  }
  const columns = Math.max(...rows.map((row) => row.length), 1);
  const cellWidth = 180;
  const rowHeight = 34;
  const width = Math.min(4096, columns * cellWidth);
  const height = Math.min(4096, rows.length * rowHeight);
  const visibleColumns = Math.max(1, Math.floor(width / cellWidth));
  const visibleRows = Math.max(1, Math.floor(height / rowHeight));
  const cells: string[] = [];
  for (let row = 0; row < Math.min(rows.length, visibleRows); row += 1) {
    for (let column = 0; column < Math.min(columns, visibleColumns); column += 1) {
      const x = column * cellWidth;
      const y = row * rowHeight;
      const fill = row === 0 ? "#e8eef8" : row % 2 === 0 ? "#f8fafc" : "#ffffff";
      const value = escapeXml((rows[row]?.[column] ?? "").slice(0, 24));
      cells.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${fill}" stroke="#94a3b8"/>`);
      cells.push(`<text x="${x + 8}" y="${y + 22}" font-family="Arial,sans-serif" font-size="14" font-weight="${row === 0 ? 700 : 400}" fill="#0f172a">${value}</text>`);
    }
  }
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${cells.join("")}</svg>`);
}

/** Readable prose rendered as a bounded SVG page for local raster export. */
export function textToSvg(text: string): Uint8Array {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) throw new Error("This document contains no readable text to render.");
  const maxChars = 84;
  const lines: string[] = [];
  for (const paragraph of normalized.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      if (line && `${line} ${word}`.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
    if (lines.length >= 180) break;
  }
  const width = 960;
  const lineHeight = 26;
  const height = Math.min(4096, Math.max(160, 80 + lines.length * lineHeight));
  const visible = Math.max(1, Math.floor((height - 60) / lineHeight));
  const body = lines.slice(0, visible).map((line, index) =>
    `<text x="48" y="${58 + index * lineHeight}" font-family="Arial,sans-serif" font-size="18" fill="#111827">${escapeXml(line)}</text>`
  ).join("");
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`);
}

/** CSV → array of objects keyed by the header row. */
export function csvToJson(csvText: string): unknown[] {
  const rows = parseCsv(csvText).map((r) => r.map((c) => c.trim()));
  if (rows.length === 0 || rows[0]!.length === 0) return [];
  const headers = rows[0]!;
  return rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
}

/* JSON / YAML / XML --------------------------------------------------- */

function parseJsonOrThrow(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON.");
  }
}

export function jsonToYaml(jsonText: string): string {
  return yaml.dump(parseJsonOrThrow(jsonText), { lineWidth: 120 });
}

export function yamlToJson(yamlText: string): string {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch {
    throw new Error("Not valid YAML.");
  }
  return JSON.stringify(parsed ?? null, null, 2);
}

/** Simple JSON → XML: objects become nested elements, arrays repeat the key. */
export function jsonToXml(jsonText: string): string {
  const parsed = parseJsonOrThrow(jsonText);
  return xmlify("root", parsed, 0);
}

function xmlify(tag: string, value: unknown, depth: number): string {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) {
    return value.map((v) => xmlify(tag, v, depth)).join("\n");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${indent}<${tag} />`;
    const inner = entries.map(([k, v]) => xmlify(k, v, depth + 1)).join("\n");
    return `${indent}<${tag}>\n${inner}\n${indent}</${tag}>`;
  }
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `${indent}<${tag}>${escaped}</${tag}>`;
}

export function xmlToJson(xmlText: string): string {
  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xmlText);
    return JSON.stringify(parsed, null, 2);
  } catch {
    throw new Error("Not valid XML.");
  }
}

export function jsonToCsv(jsonText: string): string {
  const parsed = parseJsonOrThrow(jsonText);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const objects = rows.filter(
    (r): r is Record<string, unknown> => r !== null && typeof r === "object" && !Array.isArray(r)
  );
  if (objects.length === 0) {
    throw new Error("JSON must be an object or an array of objects to convert to CSV.");
  }
  const columns = Array.from(new Set(objects.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.join(","),
    ...objects.map((r) => columns.map((c) => esc(r[c])).join(","))
  ];
  return lines.join("\n");
}

export function jsonToText(jsonText: string): string {
  return JSON.stringify(parseJsonOrThrow(jsonText), null, 2);
}

/* EPUB builder -------------------------------------------------------- */

/**
 * Builds a valid EPUB 2 package from a title + HTML body. The zip is
 * assembled by hand: mimetype must be the first, uncompressed entry.
 * Readers (and our own epubToHtml) can open the result.
 */
export function epubFromHtml(title: string, chapterHtml: string): Uint8Array {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const titleText = escapeXml(title);
  const container =
    `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n` +
    `<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">` +
    `<rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles>` +
    `</container>`;
  const opf =
    `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n` +
    `<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"2.0\" unique-identifier=\"uid\">` +
    `<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">` +
    `<dc:title>${titleText}</dc:title>` +
    `<dc:identifier id=\"uid\">onekit-${Date.now()}</dc:identifier>` +
    `<dc:language>en</dc:language></metadata>` +
    `<manifest>` +
    `<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>` +
    `<item id=\"ch1\" href=\"chapter-01.xhtml\" media-type=\"application/xhtml+xml\"/>` +
    `</manifest>` +
    `<spine toc=\"ncx\"><itemref idref=\"ch1\"/></spine></package>`;
  const ncx =
    `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n` +
    `<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\">` +
    `<head><meta name=\"dtb:uid\" content=\"onekit\"/></head>` +
    `<docTitle><text>${titleText}</text></docTitle>` +
    `<navMap><navPoint id=\"n1\" playOrder=\"1\"><navLabel><text>${titleText}</text></navLabel>` +
    `<content src=\"chapter-01.xhtml\"/></navPoint></navMap></ncx>`;
  const chapter =
    `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n` +
    `<!DOCTYPE html><html xmlns=\"http://www.w3.org/1999/xhtml\">` +
    `<head><title>${titleText}</title></head><body>${chapterHtml}</body></html>`;
  return zipSync({
    mimetype: [enc("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": enc(container),
    "OEBPS/content.opf": enc(opf),
    "OEBPS/toc.ncx": enc(ncx),
    "OEBPS/chapter-01.xhtml": enc(chapter)
  });
}

/** Builds an EPUB whose spine contains one full-page comic image per chapter. */
export function epubFromImages(title: string, images: { bytes: Uint8Array; name: string }[]): Uint8Array {
  if (images.length === 0) throw new Error("Pick at least one image to make an EPUB.");
  const enc = (value: string): Uint8Array => new TextEncoder().encode(value);
  const titleText = escapeXml(title);
  const container = `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [enc("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": enc(container)
  };
  const manifest: string[] = [`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`];
  const spine: string[] = [];
  const nav: string[] = [];
  images.forEach((image, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    const jpeg = detectFromBytes(image.bytes, "unknown") === "image-jpeg";
    const extension = jpeg ? "jpg" : "png";
    const media = jpeg ? "image/jpeg" : "image/png";
    const imagePath = `images/page-${sequence}.${extension}`;
    const chapterPath = `page-${sequence}.xhtml`;
    const imageId = `img${sequence}`;
    const chapterId = `page${sequence}`;
    files[`OEBPS/${imagePath}`] = image.bytes;
    files[`OEBPS/${chapterPath}`] = enc(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${index + 1}</title><style>html,body{margin:0;padding:0;text-align:center;background:#fff}img{max-width:100%;height:auto}</style></head><body><img src="${imagePath}" alt="Comic page ${index + 1}"/></body></html>`);
    manifest.push(`<item id="${imageId}" href="${imagePath}" media-type="${media}"/>`, `<item id="${chapterId}" href="${chapterPath}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${chapterId}"/>`);
    nav.push(`<navPoint id="n${sequence}" playOrder="${index + 1}"><navLabel><text>Page ${index + 1}</text></navLabel><content src="${chapterPath}"/></navPoint>`);
  });
  files["OEBPS/content.opf"] = enc(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${titleText}</dc:title><dc:identifier id="uid">onekit-comic-${Date.now()}</dc:identifier><dc:language>en</dc:language></metadata><manifest>${manifest.join("")}</manifest><spine toc="ncx">${spine.join("")}</spine></package>`);
  files["OEBPS/toc.ncx"] = enc(`<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="onekit-comic"/></head><docTitle><text>${titleText}</text></docTitle><navMap>${nav.join("")}</navMap></ncx>`);
  return zipSync(files);
}

/* INI → JSON ---------------------------------------------------------- */

/**
 * Parses an INI file into nested JSON: `[section]` blocks become nested
 * objects, `key = value` lines become properties. Comments (`;`/`#`) and
 * blank lines are skipped.
 */
export function iniToJson(ini: string): string {
  const result: Record<string, string | Record<string, string>> = {};
  let section: string | null = null;
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1]!.trim();
      result[section] = {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
    if (section) {
      (result[section] as Record<string, string>)[key] = val;
    } else {
      result[key] = val;
    }
  }
  return JSON.stringify(result, null, 2);
}

/* VCF / ICS / subtitles ------------------------------------------------ */

/**
 * Parses a VCF (vCard) file into an array of per-contact records.
 * Multi-line fields fold into one value; repeated properties join with
 * a comma. Returns [] for input with no VCARD blocks.
 */
export function vcfToRecords(vcf: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const raw of vcf.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "BEGIN:VCARD") {
      current = {};
      continue;
    }
    if (line === "END:VCARD") {
      if (current) records.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).split(";")[0]!.toUpperCase();
    const value = line.slice(colon + 1).trim();
    if (current[key]) current[key] = `${current[key]}, ${value}`;
    else current[key] = value;
  }
  return records;
}

/** Parses an ICS (iCalendar) file into per-event records. */
export function icsToRecords(ics: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const raw of ics.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) records.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).split(";")[0]!.toUpperCase();
    const value = line.slice(colon + 1).trim();
    if (current[key]) current[key] = `${current[key]}, ${value}`;
    else current[key] = value;
  }
  return records;
}

/** Records → CSV (reuses the JSON→CSV table writer). */
export function recordsToCsv(records: Record<string, string>[]): string {
  return jsonToCsv(JSON.stringify(records));
}

/** Records → HTML table. */
export function recordsToHtml(records: Record<string, string>[]): string {
  return jsonToHtml(JSON.stringify(records));
}

/** SRT → VTT: swap the comma millisecond separator and add the WEBVTT header. */
export function srtToVtt(srt: string): string {
  const out: string[] = ["WEBVTT", ""];
  let inCue = false;
  for (const line of srt.replace(/\r/g, "").split("\n")) {
    const m = line.match(
      /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (m) {
      if (inCue) out.push("");
      inCue = true;
      out.push(`${m[1]}:${m[2]}:${m[3]}.${m[4]} --> ${m[5]}:${m[6]}:${m[7]}.${m[8]}`);
      continue;
    }
    if (/^\d+$/.test(line.trim())) continue; // cue numbers aren't used in VTT
    if (line.trim() === "") continue;
    out.push(line);
  }
  return out.join("\n").trim() + "\n";
}

/** VTT → SRT: swap the dot millisecond separator and number the cues. */
export function vttToSrt(vtt: string): string {
  const out: string[] = [];
  let counter = 1;
  for (const line of vtt.replace(/\r/g, "").split("\n")) {
    const m = line.match(
      /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/
    );
    if (m) {
      out.push(String(counter++));
      out.push(`${m[1]}:${m[2]}:${m[3]},${m[4]} --> ${m[5]}:${m[6]}:${m[7]},${m[8]}`);
      continue;
    }
    if (line.trim() === "" || line.trim() === "WEBVTT") continue;
    out.push(line);
  }
  return out.join("\n") + "\n";
}

/** Subtitle file → plain text: keep the cue text, drop timing and numbers. */
export function subtitlesToText(sub: string): string {
  const out: string[] = [];
  for (const line of sub.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    if (!t || t === "WEBVTT" || /^\d+$/.test(t)) continue;
    if (/\d+:\d+/.test(t)) continue; // timestamp lines
    out.push(t);
  }
  return out.join("\n");
}

/* LRC lyrics ----------------------------------------------------------- */

export interface LrcCue {
  timeMs: number;
  text: string;
}

/** Parses LRC lyrics ([mm:ss.xx] lines) into timed cues, sorted by time. */
export function lrcToCues(lrc: string): LrcCue[] {
  const cues: LrcCue[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const m = line.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\](.*)/);
    if (!m) continue;
    const minutes = Number(m[1]);
    const seconds = Number(m[2]);
    const fraction = m[3] ? Number(m[3]!.padEnd(3, "0")) : 0;
    cues.push({ timeMs: (minutes * 60 + seconds) * 1000 + fraction, text: (m[4] ?? "").trim() });
  }
  return cues.sort((a, b) => a.timeMs - b.timeMs);
}

function srtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const f = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(f).padStart(3, "0")}`;
}

/** LRC → SRT (each line becomes a cue; ends 3s after start unless timed). */
export function lrcToSrt(lrc: string): string {
  const cues = lrcToCues(lrc);
  const blocks = cues.map((c, i) => {
    const end = cues[i + 1] ? cues[i + 1]!.timeMs : c.timeMs + 3000;
    return `${i + 1}\n${srtTime(c.timeMs)} --> ${srtTime(end)}\n${c.text}`;
  });
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

/** LRC → VTT (reuses the SRT→VTT converter). */
export function lrcToVtt(lrc: string): string {
  return srtToVtt(lrcToSrt(lrc));
}

/** LRC → plain text (just the lyric lines). */
export function lrcToText(lrc: string): string {
  return lrcToCues(lrc)
    .map((c) => c.text)
    .filter(Boolean)
    .join("\n");
}

/* Sitemap / RSS -------------------------------------------------------- */

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Parses an XML sitemap into per-URL records. */
export function sitemapToRecords(xml: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>([^<]*)<\/loc>/);
    if (!loc) continue;
    const record: Record<string, string> = { loc: loc[1]!.trim() };
    const lastmod = block.match(/<lastmod>([^<]*)<\/lastmod>/);
    if (lastmod) record.lastmod = lastmod[1]!.trim();
    records.push(record);
  }
  return records;
}

/** Parses an RSS 2.0 or Atom feed into per-item records. */
export function rssToRecords(feed: string): Record<string, string>[] {
  const isAtom = /<feed[\s>]/i.test(feed);
  const blocks = isAtom
    ? (feed.match(/<entry>[\s\S]*?<\/entry>/g) ?? [])
    : (feed.match(/<item>[\s\S]*?<\/item>/g) ?? []);
  const records: Record<string, string>[] = [];
  for (const b of blocks) {
    const record: Record<string, string> = {};
    const title = b.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const link = isAtom
      ? b.match(/<link[^>]*href="([^"]*)"/)
      : b.match(/<link>([^<]*)<\/link>/);
    const desc = b.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/);
    if (title) record.title = stripTags(title[1]!).slice(0, 300);
    if (link) record.link = (link[1] ?? "").trim();
    if (desc) record.description = stripTags(desc[1]!).slice(0, 500);
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

/* GPX ----------------------------------------------------------------- */

/**
 * Parses a GPX file into per-point records (lat/lon/ele/time). Both
 * <trkpt> track points and <wpt> waypoints are read, so KML→GPX output
 * round-trips back to KML.
 * Returns [] when no points are present.
 */
export function gpxToRecords(gpx: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const points: string[] = [];
  const trkpts = gpx.match(/<trkpt[^>]*>[\s\S]*?<\/trkpt>/g);
  const wpts = gpx.match(/<wpt[^>]*>[\s\S]*?<\/wpt>/g);
  if (trkpts) points.push(...trkpts);
  if (wpts) points.push(...wpts);
  for (const p of points) {
    const record: Record<string, string> = {};
    const lat = p.match(/lat="([^"]*)"/);
    const lon = p.match(/lon="([^"]*)"/);
    const ele = p.match(/<ele>([^<]*)<\/ele>/);
    const time = p.match(/<time>([^<]*)<\/time>/);
    if (lat) record.lat = lat[1]!;
    if (lon) record.lon = lon[1]!;
    if (ele) record.ele = ele[1]!;
    if (time) record.time = time[1]!;
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

/* KML / bookmarks / structured helpers --------------------------------- */

/**
 * Parses a KML file into per-placemark records (name + point lat/lon).
 * Returns [] when no <Placemark> elements with coordinates are present.
 */
export function kmlToRecords(kml: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const marks = kml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? [];
  for (const m of marks) {
    const name = m.match(/<name>([\s\S]*?)<\/name>/);
    const coords = m.match(/<coordinates>([^<]*)<\/coordinates>/);
    const point = m.match(/<Point>[\s\S]*?<\/Point>/);
    const desc = m.match(/<description>([\s\S]*?)<\/description>/);
    if (!coords && !point) continue; // no geometry to convert
    const record: Record<string, string> = {};
    if (name) record.name = stripTags(name[1]!);
    // KML coordinates are "lon,lat[,alt]" — normalize to lat/lon for the tables.
    if (coords) {
      const parts = coords[1]!.trim().split(/[,\s]+/);
      if (parts.length >= 2) {
        record.lon = parts[0]!;
        record.lat = parts[1]!;
        if (parts[2]) record.alt = parts[2]!;
      }
    }
    if (desc) record.description = stripTags(desc[1]!).slice(0, 500);
    records.push(record);
  }
  return records;
}

/** KML → GPX: turns every Placemark/Point into a <wpt> waypoint. */
export function kmlToGpx(kml: string): string {
  const records = kmlToRecords(kml);
  if (records.length === 0) throw new Error("No placemarks with coordinates found in this KML file.");
  const wpts = records
    .filter((r) => r.lat && r.lon)
    .map((r) => {
      const name = r.name ? `    <name>${escapeXml(r.name)}</name>` : "";
      return `  <wpt lat="${r.lat}" lon="${r.lon}">\n${name}\n  </wpt>`;
    })
    .join("\n");
  if (!wpts) throw new Error("No placemarks with coordinates found in this KML file.");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OneKit">\n${wpts}\n</gpx>\n`;
}

/** GPX → KML: turns every <wpt>/<trkpt> into a Placemark/Point. */
export function gpxToKml(gpx: string): string {
  const records = gpxToRecords(gpx);
  if (records.length === 0) throw new Error("No track points found in this GPX file.");
  const marks = records
    .filter((r) => r.lat && r.lon)
    .map((r, i) => {
      return `  <Placemark>\n    <name>Point ${i + 1}</name>\n    <Point>\n      <coordinates>${r.lon},${r.lat}</coordinates>\n    </Point>\n  </Placemark>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n${marks}\n</Document>\n</kml>\n`;
}

/**
 * Parses a Netscape-format bookmarks export into per-bookmark records
 * (folder, title, url, add date). Returns [] when no <a> links are present.
 */
export function bookmarksToRecords(html: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const lines = html.replace(/\r/g, "").split("\n");
  const folders: string[] = [];
  for (const line of lines) {
    const folder = line.match(/<H3[^>]*>([\s\S]*?)<\/H3>/i);
    if (folder) {
      const name = stripTags(folder[1]!);
      const depth = (line.match(/<DT>/g) ?? []).length;
      // A simple depth model: each H3 opens a folder; DT closing is not tracked,
      // so later H3s replace the current path for flat exports (the common case).
      folders[depth] = name;
      // NOTE: no `continue` — a bookmark may share a line with its H3 in
      // single-line exports, so the <A> below must still be parsed.
    }
    const a = line.match(/<A HREF="([^"]*)"[^>]*ADD_DATE="([^"]*)"[^>]*>([\s\S]*?)<\/A>/i);
    if (!a) continue;
    const record: Record<string, string> = {
      title: stripTags(a[3]!),
      url: a[1]!
    };
    if (a[2]) record.added = a[2]!;
    const folderName = folders.filter(Boolean).slice(-1)[0];
    if (folderName) record.folder = folderName;
    records.push(record);
  }
  return records;
}

/**
 * Parses a BibTeX file into per-entry records. Each record carries the
 * entry type and key plus every declared field (title, author, year, …).
 * Returns [] when no @type{key, …} entries are present.
 */
export function bibToRecords(bib: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const starts = bib.matchAll(/@(\w+)\s*\{/g);
  for (const start of starts) {
    const type = start[1]!.toLowerCase();
    // Scan with brace matching so values containing braces (e.g. "{A {nested}")
    // don't end the entry early, and entries without a trailing newline still work.
    let depth = 1;
    let i = start.index! + start[0].length;
    const bodyStart = i;
    while (i < bib.length && depth > 0) {
      const ch = bib[i]!;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const body = bib.slice(bodyStart, i - 1);
    const keyMatch = body.match(/^\s*([^,{]+),/);
    if (!keyMatch) continue;
    const record: Record<string, string> = { type, key: keyMatch[1]!.trim() };
    // Field values are brace-matched so titles like "{A {Nested} Title}" keep
    // their full value (a naive [\s\S]*?\} would stop at the first brace).
    for (const field of body.matchAll(/(\w+)\s*=\s*\{/g)) {
      let depth = 1;
      let j = field.index! + field[0].length;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
        j++;
      }
      record[field[1]!.toLowerCase()] = body.slice(field.index! + field[0].length, j - 1).trim();
    }
    if (Object.keys(record).length > 2) records.push(record);
  }
  return records;
}

/**
 * Parses a JSON Lines file (one JSON value per line) into records.
 * Scalar lines are wrapped, object lines are flattened to string values.
 * Returns [] when no parseable JSON lines are present.
 */
export function jsonlToRecords(jsonl: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  for (const raw of jsonl.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const record: Record<string, string> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        record[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
      }
      records.push(record);
    } else {
      records.push({ value: JSON.stringify(value) });
    }
  }
  return records;
}

/**
 * Parses an M3U/M3U8 playlist into per-track records (duration, title, path).
 * Non-#EXT lines become untitled entries with an empty duration.
 */
export function m3uToRecords(m3u: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let pending: Record<string, string> | null = null;
  for (const raw of m3u.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      pending = {};
      const dur = line.match(/#EXTINF:([\d.]+)/);
      if (dur) pending.duration = dur[1]!;
      const title = line.match(/,(.*)$/);
      if (title && title[1]!.trim()) pending.title = title[1]!.trim();
      continue;
    }
    if (line.startsWith("#")) continue; // #EXTM3U header and comments
    if (!line) continue;
    if (pending) {
      pending.path = line;
      records.push(pending);
      pending = null;
    } else {
      records.push({ path: line });
    }
  }
  return records;
}

/** A parsed EML message: key headers plus the decoded plain-text body. */
export interface EmlRecord {
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

/**
 * Parses an EML email into one record: headers (from/to/subject/date) plus
 * the decoded body text. Quoted-printable is decoded, HTML bodies are
 * stripped to text, and base64 bodies are decoded when they decode cleanly.
 */
export function emlToRecords(eml: string): EmlRecord[] {
  const headers: Record<string, string> = {};
  let bodyStart = 0;
  const lines = eml.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "") {
      bodyStart = i + 1;
      break;
    }
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) headers[m[1]!.toLowerCase()] = (m[2] ?? "").trim();
    else if (line.startsWith(" ") || line.startsWith("\t")) {
      // folded header continuation
      const last = Object.keys(headers).pop();
      if (last) headers[last] = `${headers[last]} ${line.trim()}`;
    }
  }
  let body = lines.slice(bodyStart).join("\n").trim();
  const cte = (headers["content-transfer-encoding"] ?? "").toLowerCase();
  if (cte.includes("quoted-printable")) {
    body = body
      .replace(/=(?:\r?\n)/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  } else if (cte.includes("base64")) {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(body.replace(/\s+/g, "")), (c) => c.charCodeAt(0))
      );
      if (decoded.length > 0) body = decoded;
    } catch {
      /* keep the raw body if base64 decoding fails */
    }
  }
  const contentType = (headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("text/html") || /<[a-z][\s\S]*>/i.test(body)) {
    body = htmlToText(body);
  }
  return [
    {
      from: headers["from"] ?? "",
      to: headers["to"] ?? "",
      subject: headers["subject"] ?? "",
      date: headers["date"] ?? "",
      body: body.slice(0, 10_000)
    }
  ];
}

/** EML → HTML: a readable message page with a header block and the body. */
export function emlToHtml(eml: string): string {
  const record = emlToRecords(eml)[0]!;
  const row = (label: string, value: string) =>
    value ? `<tr><th style="text-align:left;padding:2px 12px 2px 0">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(record.subject || "Email")}</title></head>
<body>
<table>${row("From", record.from)}${row("To", record.to)}${row("Date", record.date)}${row("Subject", record.subject)}</table>
<hr>
<p style="white-space:pre-wrap">${escapeHtml(record.body)}</p>
</body>
</html>`;
}

/* Bencode (torrent metadata) ----------------------------------------- */

interface BencodeNode { value: unknown; next: number }

function parseBencode(text: string, i: number): BencodeNode {
  const ch = text[i]!;
  if (ch === "i") {
    const end = text.indexOf("e", i);
    return { value: Number(text.slice(i + 1, end)), next: end + 1 };
  }
  if (ch === "l") {
    const arr: unknown[] = [];
    let j = i + 1;
    while (text[j] !== "e") {
      const node = parseBencode(text, j);
      arr.push(node.value);
      j = node.next;
    }
    return { value: arr, next: j + 1 };
  }
  if (ch === "d") {
    const dict: Record<string, unknown> = {};
    let j = i + 1;
    while (text[j] !== "e") {
      const keyNode = parseBencode(text, j);
      const valNode = parseBencode(text, keyNode.next);
      dict[String(keyNode.value)] = valNode.value;
      j = valNode.next;
    }
    return { value: dict, next: j + 1 };
  }
  // byte string: <len>:<bytes>
  const colon = text.indexOf(":", i);
  const len = Number(text.slice(i, colon));
  return { value: text.slice(colon + 1, colon + 1 + len), next: colon + 1 + len };
}

/**
 * Parses a .torrent file into per-file records (path, size) plus announce
 * trackers. Returns [] when the bencode root isn't a dict.
 */
export function torrentToRecords(torrent: string): Record<string, string>[] {
  const root = parseBencode(torrent, 0).value as Record<string, unknown>;
  const info = (root["info"] ?? {}) as Record<string, unknown>;
  const trackers: string[] = [];
  const announce = root["announce"];
  if (typeof announce === "string") trackers.push(announce);
  const announceList = root["announce-list"];
  if (Array.isArray(announceList)) {
    for (const group of announceList) {
      if (Array.isArray(group)) for (const t of group) if (typeof t === "string") trackers.push(t);
    }
  }
  const name = typeof info["name"] === "string" ? info["name"] : "unnamed";
  const records: Record<string, string>[] = [];
  const files = info["files"];
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files as Record<string, unknown>[]) {
      const path = Array.isArray(f["path"]) ? (f["path"] as string[]).join("/") : "";
      records.push({
        torrent: name,
        path,
        size: String(f["length"] ?? ""),
        trackers: trackers.slice(0, 3).join(", ")
      });
    }
  } else {
    records.push({
      torrent: name,
      path: typeof info["name"] === "string" ? info["name"] : "",
      size: String(info["length"] ?? ""),
      trackers: trackers.slice(0, 3).join(", ")
    });
  }
  return records;
}

/**
 * Generic XML → CSV for tabular XML: repeated same-tag children of the root
 * become rows and their child elements become columns. Errors honestly when
 * the XML isn't shaped like rows.
 */
export function xmlToCsv(xml: string): string {
  const root = xml.match(/<([\w-]+)[^>]*>([\s\S]*?)<\/\1>/);
  if (!root) throw new Error("No root element found in this XML.");
  const body = root[2]!;
  const rows = body.match(/<([\w-]+)[^>]*>[\s\S]*?<\/\1>/g) ?? [];
  if (rows.length === 0) throw new Error("This XML has no repeated child elements — not tabular data.");
  const tags = new Set(rows.map((r) => (r.match(/^<([\w-]+)/) ?? [])[1] ?? ""));
  if (tags.size !== 1) {
    throw new Error("This XML isn't shaped like rows — no single repeated element to convert.");
  }
  const parsedRows: Record<string, string>[] = [];
  const columns: string[] = [];
  // Reuse the already-extracted row elements (the tag-set check above proved
  // they share one tag), so no dynamically constructed regex is needed.
  for (const row of rows) {
    const cells: Record<string, string> = {};
    for (const cell of row.matchAll(/<([\w-]+)[^>]*>([\s\S]*?)<\/\1>/g)) {
      cells[cell[1]!] = cell[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    for (const col of Object.keys(cells)) if (!columns.includes(col)) columns.push(col);
    parsedRows.push(cells);
  }
  const quote = (s: string): string => (/[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const grid = [columns, ...parsedRows.map((r) => columns.map((c) => quote(r[c] ?? "")))];
  return grid.map((row) => row.join(",")).join("\n");
}

/** HTML → CSV: extracts the first <table> as CSV. Errors when no table exists. */
export function htmlToCsv(html: string): string {
  const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/i);
  if (!table) throw new Error("No HTML <table> found in this file.");
  const rows = table[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const grid = rows.map((row) =>
    (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map((cell) =>
      htmlToText(cell.replace(/<t[dh][^>]*>/gi, " "))
    )
  );
  if (grid.length === 0) throw new Error("No table rows found in this HTML file.");
  const quote = (cell: string): string =>
    /[,"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return grid.map((row) => row.map(quote).join(",")).join("\n");
}

/** SRT/VTT → LRC: timed cues become [mm:ss.xx] lyric lines. */
export function subtitlesToLrc(sub: string): string {
  const cues = subtitlesToRecords(sub);
  if (cues.length === 0) throw new Error("No timed cues found in this subtitle file.");
  const lrcTime = (t: string): string => {
    const m = t.match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) return "00:00.00";
    const ms = Math.round(Number(m[4]!.padEnd(3, "0")) / 10);
    return `${m[1]}:${m[2]}.${String(ms).padStart(2, "0")}`;
  };
  return cues.map((c) => `[${lrcTime(c.start)}]${c.text}`).join("\n") + "\n";
}

/** JSON array → JSONL: one JSON value per line (scalars become a single line). */
export function jsonToJsonl(jsonText: string): string {
  const parsed = parseJsonOrThrow(jsonText);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map((item) => JSON.stringify(item)).join("\n") + "\n";
}

/** CSV → JSONL: each row becomes a JSON object line. */
export function csvToJsonl(csvText: string): string {
  return jsonToJsonl(JSON.stringify(csvToJson(csvText)));
}

/* OFX / GEDCOM -------------------------------------------------------- */

/**
 * Parses an OFX/QFX bank statement into per-transaction records. Each
 * <STMTTRN> block becomes one record with the fields banks commonly export
 * (type, date, amount, name/memo, FITID).
 */
export function ofxToRecords(ofx: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const blocks = ofx.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) ?? [];
  const clean = (s: string): string => s.replace(/<[^>]+>/g, "").trim();
  for (const block of blocks) {
    const record: Record<string, string> = {};
    const fields: Array<[string, string]> = [
      ["TRNTYPE", "type"], ["DTPOSTED", "date"], ["TRNAMT", "amount"],
      ["NAME", "name"], ["MEMO", "memo"], ["FITID", "fitid"], ["CHECKNUM", "check"], ["CUR", "currency"]
    ];
    for (const [tag, key] of fields) {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      if (m) record[key] = clean(m[1]!);
    }
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

/**
 * Parses a GEDCOM family-tree export into per-person records. Each
 * `0 @id@ INDI` block becomes one record with name, sex, and the birth
 * and death dates that appear under their BIRT/DEAT events.
 */
export function gedcomToRecords(gedcom: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const lines = gedcom.split(/\r?\n/);
  let current: Record<string, string> | null = null;
  let birthNext = false;
  let deathNext = false;
  for (const raw of lines) {
    const line = raw.trim();
    const indi = line.match(/^0\s+(@\w+@)\s+INDI\s*$/i);
    if (indi) {
      if (current) records.push(current);
      current = { id: indi[1]! };
      birthNext = false;
      deathNext = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("0 ")) {
      // A different top-level record ends this person's block.
      records.push(current);
      current = null;
      continue;
    }
    const level = /^(\d)/.exec(line)?.[1];
    if (level !== "1" && level !== "2") continue;
    const name = line.match(/^1\s+NAME\s+(.+)$/i);
    if (name) {
      const parts = name[1]!.trim();
      const m = parts.match(/^([^/]+)\s*\/([^/]*)\//);
      current.given = (m?.[1] ?? parts).trim();
      current.surname = (m?.[2] ?? "").trim();
      continue;
    }
    if (/^1\s+SEX\s+(\w)/i.test(line)) {
      current.sex = (line.match(/^1\s+SEX\s+(\w)/i) ?? [])[1]!;
      continue;
    }
    if (/^1\s+BIRT\s*$/i.test(line)) {
      birthNext = true;
      continue;
    }
    if (/^1\s+DEAT\s*$/i.test(line)) {
      deathNext = true;
      continue;
    }
    const date = line.match(/^2\s+DATE\s+(.+)$/i);
    if (date) {
      if (birthNext) {
        current.birthDate = date[1]!.trim();
        birthNext = false;
      } else if (deathNext) {
        current.deathDate = date[1]!.trim();
        deathNext = false;
      }
    }
  }
  if (current) records.push(current);
  return records;
}

/* mbox / LDIF / CUE ---------------------------------------------------- */

const MBOX_SEPARATOR = /^from\s+\S+\s+\w{3}\s+\w{3}\s+\d+/im;

/**
 * Parses an mbox email archive into per-message records (from/to/subject/
 * date from the headers, plus the first 2 KB of the plain-text body).
 */
export function mboxToRecords(mbox: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const lines = mbox.split(/\r?\n/);
  let current: Record<string, string> | null = null;
  let inBody = false;
  let bodyLines: string[] = [];
  const finish = (): void => {
    if (!current) return;
    current.body = bodyLines.join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
    records.push(current);
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (MBOX_SEPARATOR.test(line)) {
      finish();
      current = {};
      inBody = false;
      bodyLines = [];
      continue;
    }
    if (!current) continue;
    if (!inBody) {
      // Header section: blank line ends it, everything after is body.
      if (line.trim() === "") {
        inBody = true;
        continue;
      }
      const header = line.match(/^([\w-]+):\s*(.*)$/);
      if (header) {
        const key = header[1]!.toLowerCase();
        if (key === "from" || key === "to" || key === "subject" || key === "date") {
          current[key] = header[2]!.trim();
        }
        continue;
      }
      inBody = true; // malformed header line — treat the rest as body
    }
    if (line.trim()) bodyLines.push(line);
  }
  finish();
  return records;
}

/**
 * Parses an LDIF (LDAP data interchange) export into per-entry records.
 * Records are blank-line separated `attribute: value` blocks; the version
 * header and comment lines are skipped.
 */
export function ldifToRecords(ldif: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of ldif.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      if (!t && current) {
        records.push(current);
        current = null;
      }
      continue;
    }
    if (/^version:/i.test(t)) continue;
    const m = t.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    if (!current) current = {};
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (current[key]) current[key] = `${current[key]}; ${value}`;
    else current[key] = value;
  }
  if (current) records.push(current);
  return records;
}

/**
 * Parses a CUE sheet into per-track records (number, title, performer,
 * index time, file). A leading disc-level TITLE/PERFORMER is carried over.
 */
export function cueToRecords(cue: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let discTitle = "";
  let discPerformer = "";
  let currentFile = "";
  let current: Record<string, string> | null = null;
  const quote = (s: string): string => (s.match(/"([^"]*)"/) ?? [])[1] ?? s;
  for (const line of cue.split(/\r?\n/)) {
    const t = line.trim();
    const file = t.match(/^FILE\s+"([^"]+)"/i);
    if (file) {
      // A FILE line just names the source audio; tracks below it own it.
      currentFile = file[1]!;
      continue;
    }
    const track = t.match(/^TRACK\s+(\d+)\s+\w+/i);
    if (track) {
      if (current) records.push(current);
      current = { track: track[1]!, file: currentFile };
      continue;
    }
    const title = t.match(/^TITLE\s+(.+)$/i);
    if (title) {
      if (current) current.title = quote(title[1]!);
      else discTitle = quote(title[1]!);
      continue;
    }
    const performer = t.match(/^PERFORMER\s+(.+)$/i);
    if (performer) {
      if (current) current.performer = quote(performer[1]!);
      else discPerformer = quote(performer[1]!);
      continue;
    }
    const index = t.match(/^INDEX\s+\d+\s+(.+)$/i);
    if (index && current) current.index = index[1]!.trim();
  }
  if (current) records.push(current);
  for (const r of records) {
    if (!r.title) r.title = discTitle;
    if (!r.performer) r.performer = discPerformer;
  }
  return records;
}

/* TOML ---------------------------------------------------------------- */

/** Parses a TOML scalar/array/inline-table into a JSON-compatible value. */
function parseTomlValue(raw: string): unknown {
  // Strip an inline comment that isn't inside quotes.
  let value = raw;
  let inQuote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '"' || ch === "'") {
      if (inQuote === ch) inQuote = null;
      else if (!inQuote) inQuote = ch;
    } else if (ch === "#" && !inQuote) {
      value = value.slice(0, i).trim();
      break;
    }
  }
  if (value.startsWith('"') || value.startsWith("'")) {
    try {
      return JSON.parse(value.replace(/^'|'$/g, '"').replace(/\\'/g, "'"));
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith("[")) {
    const inner = value.slice(1, -1);
    if (!inner.trim()) return [];
    // Split on commas that are outside quotes/brackets.
    const parts: string[] = [];
    let depth = 0;
    let q: string | null = null;
    let cur = "";
    for (const ch of inner) {
      if (ch === '"' || ch === "'") {
        if (q === ch) q = null;
        else if (!q) q = ch;
      } else if (!q && (ch === "[" || ch === "{")) depth++;
      else if (!q && (ch === "]" || ch === "}")) depth--;
      if (!q && ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((p) => parseTomlValue(p));
  }
  if (value.startsWith("{")) {
    const obj: Record<string, unknown> = {};
    const inner = value.slice(1, -1);
    for (const part of inner.split(",")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      obj[part.slice(0, eq).trim()] = parseTomlValue(part.slice(eq + 1).trim());
    }
    return obj;
  }
  return value;
}

/**
 * Minimal TOML → JSON: sections, dotted keys, strings, numbers, booleans,
 * arrays and inline tables. Exotic TOML (dates, multiline strings) is
 * treated honestly as its literal text rather than guessed at.
 */
export function tomlToJson(toml: string): string {
  const root: Record<string, unknown> = {};
  let current = root;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const section = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (section) {
      const path = section[1]!.trim().split(".").map((s) => s.trim());
      let node = root;
      for (const key of path) {
        const next = node[key];
        if (typeof next !== "object" || next === null || Array.isArray(next)) {
          node[key] = {};
        }
        node = node[key] as Record<string, unknown>;
      }
      current = node;
      continue;
    }
    const kv = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!kv) continue;
    // Dotted keys (server.host = …) nest into tables under the current section.
    const keyParts = kv[1]!.trim().split(".");
    let node = current;
    for (const part of keyParts.slice(0, -1)) {
      const next = node[part];
      if (typeof next !== "object" || next === null) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[keyParts[keyParts.length - 1]!] = parseTomlValue(kv[2]!.trim());
  }
  return JSON.stringify(root, null, 2);
}

/** JSON → TOML: objects become [section] tables, object arrays become [[tables]]. */
export function jsonToToml(jsonText: string): string {
  const parsed = parseJsonOrThrow(jsonText);
  const lines: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
      } else if (Array.isArray(v) && v.every((item) => item !== null && typeof item === "object")) {
        for (const item of v) {
          lines.push(`[[${key}]]`);
          walk(item as Record<string, unknown>, "");
        }
      } else {
        lines.push(`${key} = ${tomlScalar(v)}`);
      }
    }
  };
  walk(parsed as Record<string, unknown>, "");
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

function tomlScalar(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlScalar).join(", ")}]`;
  return "{}";
}

/* QIF ----------------------------------------------------------------- */

const QIF_FIELDS: Record<string, string> = {
  D: "date", T: "amount", U: "amount", P: "payee", M: "memo", N: "number",
  C: "cleared", L: "category", A: "address", S: "split_category",
  E: "split_memo", "$": "split_amount"
};

/**
 * Parses a QIF (Quicken interchange) export into per-transaction records.
 * Every record gets the standard fields (date/amount/payee/memo/…) that
 * are present; unknown single-letter fields are kept as field_X.
 */
export function qifToRecords(qif: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  for (const line of qif.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "^") {
      if (Object.keys(current).length > 0) records.push(current);
      current = {};
      continue;
    }
    if (t.startsWith("!") || !t) continue;
    const m = t.match(/^([A-Za-z$])(.*)$/);
    if (!m) continue;
    current[QIF_FIELDS[m[1]!] ?? `field_${m[1]!}`] = m[2]!.trim();
  }
  if (Object.keys(current).length > 0) records.push(current);
  return records;
}

/** One parsed subtitle cue. */
export interface SubtitleCue {
  index: string;
  start: string;
  end: string;
  text: string;
}

/** Parses SRT/VTT subtitle content into per-cue records (index/start/end/text). */
export function subtitlesToRecords(sub: string): SubtitleCue[] {
  const records: SubtitleCue[] = [];
  let index = 0;
  let cue: { start: string; end: string; text: string[] } | null = null;
  for (const line of sub.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    const time = t.match(
      /^(\d{1,2}:\d{2}:\d{2}[,.\d]*)\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.\d]*)/
    );
    if (time) {
      if (cue) records.push({ index: String(index), start: cue.start, end: cue.end, text: cue.text.join(" ") });
      index += 1;
      cue = { start: time[1]!, end: time[2]!, text: [] };
      continue;
    }
    if (cue && t && t !== "WEBVTT" && !/^\d+$/.test(t)) cue.text.push(t);
  }
  if (cue) records.push({ index: String(index), start: cue.start, end: cue.end, text: cue.text.join(" ") });
  return records;
}

/** Records → Markdown table (reuses the table writer on CSV). */
export function recordsToMarkdown(records: Record<string, string>[]): string {
  return csvToMarkdown(jsonToCsv(JSON.stringify(records)));
}

/** Records → readable text lines ("key: value" per field, blank line per record). */
export function recordsToText(records: Record<string, string>[]): string {
  return records
    .map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join("\n"))
    .join("\n\n");
}

/* EPUB ---------------------------------------------------------------- */

/**
 * EPUB → HTML: reads the OPF manifest + spine and concatenates the
 * chapter documents in reading order.
 */
export function epubToHtml(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Could not read this EPUB — the file may be corrupt.");
  }
  const names = Object.keys(files);
  const opfName = names.find((n) => n.toLowerCase().endsWith(".opf"));
  if (!opfName) {
    throw new Error("Could not find the EPUB's content.opf — this may not be a valid EPUB.");
  }
  const opf = strFromU8(files[opfName]!);
  const attr = (tag: string, name: string): string | undefined => {
    const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
    return m?.[1];
  };
  const idToHref: Record<string, string> = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = attr(m[0], "id");
    const href = attr(m[0], "href");
    if (id && href) idToHref[id] = decodeURIComponent(href);
  }
  const baseDir = opfName.includes("/") ? opfName.slice(0, opfName.lastIndexOf("/")) : "";
  const parts: string[] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = attr(m[0], "idref");
    if (!idref) continue;
    const href = idToHref[idref];
    if (!href) continue;
    const clean = href.split("#")[0]!;
    const path = baseDir ? `${baseDir}/${clean}` : clean;
    const entry = files[path] ?? files[clean];
    if (entry) parts.push(strFromU8(entry));
  }
  const body = parts.join("\n") || "<p>This EPUB has no readable chapters.</p>";
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>EPUB</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

/** Extracts an image-only EPUB into a CBZ while preserving spine order. */
export function epubImagesToCbz(bytes: Uint8Array): Uint8Array {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error("Could not read this EPUB — the file may be corrupt."); }
  const opfName = Object.keys(files).find((name) => name.toLowerCase().endsWith(".opf"));
  if (!opfName) throw new Error("Could not find the EPUB's content.opf — this may not be a valid EPUB.");
  const opf = strFromU8(files[opfName]!);
  const attr = (tag: string, name: string): string | undefined => {
    const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
    return match?.[1] ?? match?.[2];
  };
  const manifest: Record<string, string> = {};
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = attr(match[0], "id");
    const href = attr(match[0], "href");
    if (id && href) manifest[id] = decodeURIComponent(href.split("#")[0]!);
  }
  const base = opfName.includes("/") ? opfName.slice(0, opfName.lastIndexOf("/")) : "";
  const resolve = (dir: string, href: string): string => {
    const output: string[] = [];
    for (const part of `${dir ? `${dir}/` : ""}${href}`.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") output.pop(); else output.push(part);
    }
    return output.join("/");
  };
  const pages: Record<string, Uint8Array> = {};
  let page = 0;
  for (const match of opf.matchAll(/<itemref\b[^>]*>/gi)) {
    const href = manifest[attr(match[0], "idref") ?? ""];
    if (!href) throw new Error("This EPUB's spine is incomplete and cannot become a CBZ.");
    const chapterPath = resolve(base, href);
    const chapterBytes = files[chapterPath];
    if (!chapterBytes) throw new Error("This EPUB's spine references a missing chapter.");
    const chapter = strFromU8(chapterBytes);
    const body = chapter.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? chapter;
    const images = [...body.matchAll(/<img\b[^>]*>/gi)];
    const prose = body.replace(/<img\b[^>]*>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim();
    if (images.length !== 1 || prose) throw new Error("Only image-backed EPUBs with exactly one image per spine page can become CBZ.");
    const src = attr(images[0]![0], "src");
    if (!src) throw new Error("An image-backed EPUB page has no image source.");
    const chapterDir = chapterPath.includes("/") ? chapterPath.slice(0, chapterPath.lastIndexOf("/")) : "";
    const imagePath = resolve(chapterDir, decodeURIComponent(src.split("#")[0]!));
    const image = files[imagePath];
    const extension = imagePath.match(/\.(png|jpe?g|gif|webp|bmp)$/i)?.[1]?.toLowerCase();
    if (!image || !extension) throw new Error("An EPUB spine page references a missing or unsupported image.");
    page += 1;
    pages[`page-${String(page).padStart(3, "0")}.${extension === "jpeg" ? "jpg" : extension}`] = image;
  }
  if (!page) throw new Error("This EPUB has no image-backed spine pages to place in a CBZ.");
  return zipSync(pages);
}

/* Office writers (RTF / ODT / PPTX) ---------------------------------- */

/**
 * HTML → RTF. The text and its paragraph breaks survive; styling and
 * images don't. Word, Pages and LibreOffice all open the result.
 */
export function htmlToRtf(html: string): string {
  return textToRtf(htmlToText(html));
}

/** HTML → OpenDocument text (one paragraph per line). */
export function htmlToOdt(html: string): Uint8Array {
  return buildOdt(htmlToText(html).split(/\r?\n/));
}

/**
 * HTML → PPTX. Blank-line-separated blocks become slides, each block's
 * first line its title — the honest shape for turning prose into a deck.
 */
export function htmlToPptx(html: string): Uint8Array {
  return buildPptx(textToSlides(htmlToText(html)));
}

/** HTML → macro-enabled OOXML presentation without a fabricated VBA project. */
export function htmlToPptm(html: string): Uint8Array {
  const files = unzipSync(htmlToPptx(html));
  const contentTypes = files["[Content_Types].xml"];
  if (!contentTypes) throw new Error("The generated presentation has no content-types manifest.");
  const xml = strFromU8(contentTypes).replace(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml"
  );
  files["[Content_Types].xml"] = new TextEncoder().encode(xml);
  return zipSync(files);
}

/** HTML → FictionBook 2 XML, preserving readable text as paragraphs. */
export function htmlToFb2(html: string, title: string): Uint8Array {
  const paragraphs = htmlToText(html)
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `      <p>${escapeXml(line)}</p>`)
    .join("\n") || "      <p></p>";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>nonfiction</genre>
      <author><first-name>OneKit</first-name><last-name>Converter</last-name></author>
      <book-title>${escapeXml(title)}</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section>
${paragraphs}
    </section>
  </body>
</FictionBook>`;
  return new TextEncoder().encode(xml);
}

/** Slide decks (PPTX/ODP) → the HTML every other document target flows through. */
export function slidesToDocumentHtml(slides: Slide[], title: string): string {
  return slidesToHtml(slides, title);
}

/* Spreadsheet writers (TSV / XLS / ODS) ------------------------------- */

/** CSV → TSV, quoting-aware (tabs and newlines inside cells are stripped). */
export function csvToTsv(csv: string): string {
  return parseCsv(csv)
    .map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

/** CSV → Excel 97-2003 (.xls), written by the same SheetJS build that reads it. */
export function csvToXls(csvText: string): Uint8Array {
  const wb = XLSX.read(csvText, { type: "string" });
  return new Uint8Array(XLSX.write(wb, { bookType: "biff8", type: "array" }) as ArrayBuffer);
}

/** CSV → OpenDocument spreadsheet (.ods). */
export function csvToOds(csvText: string): Uint8Array {
  const wb = XLSX.read(csvText, { type: "string" });
  return new Uint8Array(XLSX.write(wb, { bookType: "ods", type: "array" }) as ArrayBuffer);
}
