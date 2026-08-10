/**
 * Document conversions — PDF text extraction, DOCX/EPUB → HTML,
 * HTML ↔ Markdown, XLSX ↔ CSV/JSON, JSON ↔ YAML/XML/CSV, and HTML → PDF.
 * Every library runs on-device; nothing is uploaded.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { toArrayBuffer } from "./util";
// Make pdfjs's worker available on the main thread so extraction works in
// extension popups, Node, and tests without spawning a worker.
import * as pdfjsWorkerModule from "pdfjs-dist/legacy/build/pdf.worker.mjs";
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorkerModule;

import mammoth from "mammoth";
import TurndownService from "turndown";
import { marked } from "marked";
import * as XLSX from "xlsx";
import * as yaml from "js-yaml";
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
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
