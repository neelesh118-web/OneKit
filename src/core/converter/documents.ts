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

/** Parses SRT/VTT subtitle content into per-cue records (index/start/end/text). */
export function subtitlesToRecords(sub: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
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
