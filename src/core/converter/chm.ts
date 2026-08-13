/**
 * Compiled HTML Help (.chm) reader — a faithful port of libmspack's chmd.c
 * structure with the LZX engine from ./lzx.
 *
 * Layout (Microsoft HTML Help / ITSF container):
 *  - the "ITSF" header carries the directory offset (0x2C) and the content
 *    section-0 offset (0x3C);
 *  - at the directory offset an "ITSP" header (0x20 bytes) describes 4 KB
 *    directory chunks, and the first..last "PMGL" leaf chunks enumerate
 *    every file as ENCINT-encoded entries (name, section, offset, length);
 *  - section 0 holds the raw system files: ControlData (the LZX window and
 *    reset interval), SpanInfo (the uncompressed content length) and the
 *    Content stream itself;
 *  - section 1 files (the help pages) live inside the LZX-compressed
 *    content stream, which we decompress in full and slice per entry.
 *
 * The .hhc/.hhs navigation files are skipped; every *.htm/*.html page's
 * text is extracted and joined into one document. Files with no readable
 * content throw the same honest error as the other binary readers.
 */

import { lzxDecompress } from "./lzx";

const MAX_CONTENT = 512 * 1024 * 1024; // 512 MB decompressed, sanity cap

interface ChmEntry {
  name: string;
  section: number;
  offset: number;
  length: number;
}

interface ChmParsed {
  html: string;
  text: string;
}

function u16le(b: Uint8Array, off: number): number {
  return b[off]! | (b[off + 1]! << 8);
}

function u32le(b: Uint8Array, off: number): number {
  return (b[off]! | (b[off + 1]! << 8) | (b[off + 2]! << 16) | (b[off + 3]! << 24)) >>> 0;
}

function u64le(b: Uint8Array, off: number): number {
  return u32le(b, off) + u32le(b, off + 4) * 0x100000000;
}

/** Reads an ENCINT (7-bit little-endian varint with continuation bit). */
function readEncint(bytes: Uint8Array, p: { i: number }, end: number): number {
  let result = 0;
  let c = 0x80;
  let i = 0;
  while ((c & 0x80) && i < 9) {
    if (p.i >= end) throw new Error("Truncated CHM directory entry.");
    c = bytes[p.i++]!;
    result = (result << 7) | (c & 0x7f);
    i++;
  }
  return result;
}

/** UTF-8 decode with replacement for stray bytes (CHM names/pages are UTF-8). */
function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

/** Strips scripts/styles and tags, leaving readable page text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chmToHtml(bytes: Uint8Array): string {
  return parseChm(bytes).html;
}

export function chmToText(bytes: Uint8Array): string {
  return parseChm(bytes).text;
}

function parseChm(bytes: Uint8Array): ChmParsed {
  if (bytes.length < 96 || utf8(bytes.subarray(0, 4)) !== "ITSF") {
    throw new Error("This is not a CHM help file.");
  }
  const dirOffset = u64le(bytes, 0x2c);
  const dataOffset = u64le(bytes, 0x3c);
  if (dirOffset + 32 > bytes.length || dataOffset > bytes.length) {
    throw new Error("This CHM file is truncated or corrupt.");
  }

  // ITSP header at the directory offset. Version 3 headers are 48 bytes
  // (fields through 0x2C); version 2 are 32. Chunks start right after.
  const itsp = bytes.subarray(dirOffset, dirOffset + 64);
  if (utf8(itsp.subarray(0, 4)) !== "ITSP") {
    throw new Error("This CHM directory is corrupt.");
  }
  const itspVersion = u32le(itsp, 0x04);
  const chunkStart = dirOffset + (itspVersion >= 3 ? 0x30 : 0x20);
  const chunkSize = u32le(itsp, 0x10);
  const numChunks = u32le(itsp, 0x20);
  const firstPmgl = u32le(itsp, 0x24);
  const lastPmgl = u32le(itsp, 0x28);
  if (chunkSize < 16 || chunkSize > 8192 || numChunks === 0 || firstPmgl > lastPmgl) {
    throw new Error("This CHM directory is corrupt.");
  }

  // Walk every PMGL leaf chunk and read its ENCINT entries.
  const entries: ChmEntry[] = [];
  for (let c = firstPmgl; c <= lastPmgl && c < numChunks; c++) {
    const chunkOff = chunkStart + c * chunkSize;
    if (chunkOff + chunkSize > bytes.length) break;
    const chunk = bytes.subarray(chunkOff, chunkOff + chunkSize);
    if (utf8(chunk.subarray(0, 4)) !== "PMGL") continue; // skip PMGI index chunks
    const numEntries = u16le(chunk, chunkSize - 2);
    const p = { i: 8 };
    const end = chunkSize - 2;
    for (let n = 0; n < numEntries; n++) {
      const nameLen = readEncint(chunk, p, end);
      if (nameLen > end - p.i) break;
      const name = utf8(chunk.subarray(p.i, p.i + nameLen));
      p.i += nameLen;
      const section = readEncint(chunk, p, end);
      const offset = readEncint(chunk, p, end);
      const length = readEncint(chunk, p, end);
      // Directories and blank entries are stored as zero-length records.
      if (name.length < 2) continue;
      if (offset === 0 && length === 0 && name.endsWith("/")) continue;
      entries.push({ name, section, offset, length });
    }
  }

  const sysFile = (suffix: string): ChmEntry | undefined =>
    entries.find((e) => e.section === 0 && e.name.endsWith(suffix));

  const contentEntry = sysFile("/MSCompressed/Content");
  const controlEntry = sysFile("/MSCompressed/ControlData");
  const spanEntry = sysFile("/MSCompressed/SpanInfo");
  if (!contentEntry || !controlEntry || !spanEntry) {
    throw new Error("This CHM has no compressed content section.");
  }

  const control = bytes.subarray(dataOffset + controlEntry.offset, dataOffset + controlEntry.offset + controlEntry.length);
  if (control.length < 16 || utf8(control.subarray(0, 4)) !== "LZXC") {
    throw new Error("This CHM control data is corrupt.");
  }
  const version = u32le(control, 4);
  let resetInterval = u32le(control, 8);
  let windowSize = u32le(control, 12);
  if (version === 2) {
    resetInterval *= 32768;
    windowSize *= 32768;
  }
  let windowBits = 0;
  for (const [bits, size] of [
    [15, 0x8000],
    [16, 0x10000],
    [17, 0x20000],
    [18, 0x40000],
    [19, 0x80000],
    [20, 0x100000],
    [21, 0x200000],
  ] as const) {
    if (windowSize === size) windowBits = bits;
  }
  if (windowBits === 0 || resetInterval === 0 || resetInterval % 32768 !== 0) {
    throw new Error("This CHM uses an unsupported LZX window.");
  }

  const spanBytes = bytes.subarray(dataOffset + spanEntry.offset, dataOffset + spanEntry.offset + spanEntry.length);
  if (spanBytes.length < 8) throw new Error("This CHM span info is corrupt.");
  const contentLength = u64le(spanBytes, 0);
  if (contentLength <= 0 || contentLength > MAX_CONTENT) {
    throw new Error("This CHM content is too large to read locally.");
  }

  const stream = bytes.subarray(dataOffset + contentEntry.offset, dataOffset + contentEntry.offset + contentEntry.length);
  let decompressed: Uint8Array;
  try {
    decompressed = lzxDecompress(stream, {
      windowBits,
      resetIntervalFrames: resetInterval / 32768,
      outputLength: contentLength,
    });
  } catch (err) {
    throw new Error(`This CHM content couldn't be decompressed locally (${(err as Error).message}).`);
  }

  // Section 1 files live inside the decompressed stream.
  const pages = entries
    .filter((e) => e.section === 1 && e.offset >= 0 && e.offset + e.length <= decompressed.length)
    .sort((a, b) => a.offset - b.offset);

  // Prefer the HTML pages; fall back to the .hhc table of contents, then
  // to any text-ish file, then to the raw stream.
  let htmlPages = pages.filter((e) => /\.htm[l]?$/i.test(e.name));
  if (htmlPages.length === 0) htmlPages = pages.filter((e) => /\.hhc$/i.test(e.name));
  if (htmlPages.length === 0) {
    htmlPages = pages.filter((e) => /\.(txt|shtml|xml)$/i.test(e.name));
  }

  if (htmlPages.length === 0) {
    if (pages.length === 0) {
      throw new Error("This CHM contains no readable content pages.");
    }
    // Last resort: whole-stream text.
    const raw = utf8(decompressed).replace(/[^\u0020-\u007e\u00a0-\uffff\n\r\t]/g, " ").trim();
    if (!raw) throw new Error("This CHM contains no readable content.");
    return { html: `<pre>${escapeHtml(raw)}</pre>`, text: raw };
  }

  const bodies: string[] = [];
  const texts: string[] = [];
  for (const page of htmlPages) {
    const raw = utf8(decompressed.subarray(page.offset, page.offset + page.length));
    // Keep only the body when a body tag exists; otherwise the whole page.
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = bodyMatch ? bodyMatch[1]! : raw;
    const text = htmlToText(content);
    if (text) texts.push(text);
    bodies.push(content);
  }
  if (texts.length === 0) {
    throw new Error("This CHM contains no readable text.");
  }
  const text = texts.join("\n\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>CHM help</title></head><body>${bodies.join("\n<hr/>\n")}</body></html>`;
  return { html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
