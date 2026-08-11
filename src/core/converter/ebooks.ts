/**
 * E-book readers for the two formats that aren't zipped HTML: FB2
 * (FictionBook — plain XML) and MOBI (Palm database + PalmDOC
 * compression). Both produce HTML, which then flows through the same
 * HTML → text / Markdown / PDF / DOCX / EPUB pipelines everything else
 * uses.
 *
 * DRM-protected e-books can't be read — the honest answer is an error,
 * not a mangled file.
 */
import { strFromU8, unzipSync } from "fflate/browser";
import { decodeXmlText, escapeXml, xmlFragmentText } from "./xml-text";

/* FB2 ------------------------------------------------------------------ */

/** True when the bytes look like a FictionBook document. */
export function isFb2(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 2000));
  return /<FictionBook[\s>]/i.test(head);
}

/** Inline FB2 markup that maps onto plain HTML tags. */
const FB2_INLINE: Record<string, string> = {
  emphasis: "em",
  strong: "strong",
  strikethrough: "s",
  sub: "sub",
  sup: "sup",
  code: "code"
};

/** Escapes an FB2 fragment's text while keeping its inline formatting. */
function fb2Inline(fragment: string): string {
  const tags = /<\/?([a-zA-Z0-9-]+)[^>]*>/g;
  let out = "";
  let at = 0;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(fragment)) !== null) {
    out += escapeXml(decodeXmlText(fragment.slice(at, match.index)));
    const mapped = FB2_INLINE[match[1]!.toLowerCase()];
    if (mapped) out += match[0].startsWith("</") ? `</${mapped}>` : `<${mapped}>`;
    at = match.index + match[0].length;
  }
  out += escapeXml(decodeXmlText(fragment.slice(at)));
  return out.replace(/\s+/g, " ").trim();
}

/**
 * FB2 → HTML. Sections become headings, paragraphs stay paragraphs, and
 * the book's title becomes the document title. Embedded images (FB2
 * stores them as base64 blobs) are left out.
 */
export function fb2ToHtml(xml: string): string {
  if (!/<FictionBook[\s>]/i.test(xml)) {
    throw new Error("This doesn't look like an FB2 (FictionBook) document.");
  }
  const bookTitle = fb2Title(xml);
  const author = xmlFragmentText(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(xml)?.[1] ?? "");
  const bodies = [...xml.matchAll(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/gi)].map((m) => m[1]!);
  if (bodies.length === 0) {
    throw new Error("This FB2 file has no body to read.");
  }
  const blocks: string[] = [`<h1>${escapeXml(bookTitle)}</h1>`];
  if (author) blocks.push(`<p><em>${escapeXml(author)}</em></p>`);
  for (const body of bodies) {
    // Walk the block-level elements in document order.
    const pattern = /<(title|subtitle|p|v|text-author|empty-line)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/\1>)/gi;
    for (const m of body.matchAll(pattern)) {
      const tag = m[1]!.toLowerCase();
      const inner = m[2] ?? "";
      if (tag === "empty-line") {
        blocks.push("<br/>");
        continue;
      }
      if (tag === "title" || tag === "subtitle") {
        const heading = xmlFragmentText(inner);
        if (heading) {
          blocks.push(tag === "title" ? `<h2>${escapeXml(heading)}</h2>` : `<h3>${escapeXml(heading)}</h3>`);
        }
        continue;
      }
      const html = fb2Inline(inner);
      if (!html) continue;
      // Verse lines and attributions read as their own paragraphs.
      blocks.push(tag === "text-author" ? `<p><em>${html}</em></p>` : `<p>${html}</p>`);
    }
  }
  return (
    `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeXml(bookTitle)}</title></head>\n` +
    `<body>\n${blocks.join("\n")}\n</body>\n</html>`
  );
}

/** The book's title, used to name and label converted output. */
export function fb2Title(xml: string): string {
  return xmlFragmentText(/<book-title(?:\s[^>]*)?>([\s\S]*?)<\/book-title>/i.exec(xml)?.[1] ?? "") || "FB2 book";
}

/* MOBI ----------------------------------------------------------------- */

/** True when the bytes are a Palm database holding a MOBI/PalmDOC book. */
export function isMobi(bytes: Uint8Array): boolean {
  if (bytes.length < 78) return false;
  const type = String.fromCharCode(...bytes.subarray(60, 68));
  return type === "BOOKMOBI" || type === "TEXtREAd";
}

interface PalmRecord {
  start: number;
  end: number;
}

/** The Palm database's record table: one offset per record. */
function palmRecords(bytes: Uint8Array): PalmRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(76, false);
  const records: PalmRecord[] = [];
  for (let i = 0; i < count; i++) {
    const at = 78 + i * 8;
    if (at + 8 > bytes.length) break;
    const start = view.getUint32(at, false);
    const nextAt = at + 8;
    const end = i + 1 < count && nextAt + 4 <= bytes.length ? view.getUint32(nextAt, false) : bytes.length;
    if (start >= bytes.length) break;
    records.push({ start, end: Math.min(end, bytes.length) });
  }
  return records;
}

/** PalmDOC LZ77 decompression (compression type 2). */
function palmDocDecompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const b = input[i]!;
    i++;
    if (b === 0) {
      out.push(0);
    } else if (b <= 8) {
      // Literal run: the next b bytes are copied verbatim.
      for (let k = 0; k < b && i < input.length; k++) out.push(input[i++]!);
    } else if (b <= 0x7f) {
      out.push(b);
    } else if (b <= 0xbf) {
      // Two-byte back-reference: 11 bits of distance, 3 bits of length.
      if (i >= input.length) break;
      const pair = (b << 8) | input[i]!;
      i++;
      const distance = (pair >> 3) & 0x07ff;
      const length = (pair & 0x07) + 3;
      if (distance === 0 || distance > out.length) break;
      const from = out.length - distance;
      for (let k = 0; k < length; k++) out.push(out[from + k] ?? 0);
    } else {
      // 0xC0-0xFF stands for a space followed by one character.
      out.push(0x20, b ^ 0x80);
    }
  }
  return new Uint8Array(out);
}

/**
 * Text records can carry trailing bookkeeping entries, announced by the
 * MOBI header's extra-data flags. They must come off before
 * decompression or the text ends in garbage. Each entry ends with its
 * own length, encoded backwards, seven bits per byte.
 */
function trimTrailingEntries(record: Uint8Array, flags: number): Uint8Array {
  let end = record.length;
  for (let bit = 15; bit > 0; bit--) {
    if (!(flags & (1 << bit))) continue;
    let size = 0;
    let shift = 0;
    for (let i = 0; i < 4; i++) {
      const b = record[end - 1 - i];
      if (b === undefined) break;
      size |= (b & 0x7f) << shift;
      shift += 7;
      if (b & 0x80) break;
    }
    end -= size;
    if (end <= 0) return new Uint8Array(0);
  }
  if (flags & 1) {
    // The multibyte-overlap entry's length lives in its last two bits.
    const last = record[end - 1];
    if (last !== undefined) end -= (last & 0x03) + 1;
  }
  return record.subarray(0, Math.max(0, end));
}

/**
 * MOBI → HTML. Reads the PalmDOC text records, decompresses them and
 * returns the book's own HTML with the reader-specific markup and
 * byte-offset anchors dropped.
 */
export function mobiToHtml(bytes: Uint8Array): string {
  if (!isMobi(bytes)) {
    throw new Error("This doesn't look like a MOBI e-book.");
  }
  const records = palmRecords(bytes);
  const header = records[0];
  if (!header) throw new Error("This MOBI file has no records to read.");
  const head = bytes.subarray(header.start, header.end);
  if (head.length < 16) throw new Error("This MOBI file's header is incomplete.");
  const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const compression = headView.getUint16(0, false);
  const textLength = headView.getUint32(4, false);
  const textRecordCount = headView.getUint16(8, false);
  const encryption = headView.getUint16(12, false);
  if (encryption !== 0) {
    throw new Error("This e-book is DRM-protected, so it can't be converted locally.");
  }
  if (compression !== 1 && compression !== 2) {
    throw new Error(
      "This MOBI file uses HUFF/CDIC compression, which can't be read locally. Try an unprotected .mobi or an .epub."
    );
  }

  // The MOBI header (when present) gives the text encoding and whether
  // records carry trailing entries.
  let encoding = 1252;
  let extraFlags = 0;
  if (head.length >= 32 && String.fromCharCode(...head.subarray(16, 20)) === "MOBI") {
    const headerLength = headView.getUint32(20, false);
    encoding = headView.getUint32(28, false);
    // The flags sit at 0xF2 of record 0 - not of the MOBI header - and
    // only exist once the MOBI header is long enough to declare them.
    if (headerLength >= 0xe4 && head.length >= 0xf4) {
      extraFlags = headView.getUint16(0xf2, false);
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let i = 1; i <= textRecordCount && i < records.length; i++) {
    const record = bytes.subarray(records[i]!.start, records[i]!.end);
    const trimmed = extraFlags ? trimTrailingEntries(record, extraFlags) : record;
    const text = compression === 2 ? palmDocDecompress(trimmed) : trimmed;
    chunks.push(text);
    total += text.length;
  }
  if (total === 0) throw new Error("This MOBI file has no readable text.");
  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.length;
  }
  const label = encoding === 65001 ? "utf-8" : "windows-1252";
  const raw = new TextDecoder(label, { fatal: false }).decode(
    merged.subarray(0, textLength > 0 ? Math.min(total, textLength) : total)
  );

  const body = raw
    // Reader-only markup that isn't HTML.
    .replace(/<\/?mbp:[^>]*>/gi, "")
    .replace(/<\/?guide[^>]*>/gi, "")
    .replace(/<reference[^>]*>/gi, "")
    // Internal jump targets point at byte offsets that no longer exist.
    .replace(/\sfilepos=["']?\d+["']?/gi, "")
    .trim();
  if (/<html[\s>]/i.test(body)) return body;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>MOBI book</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

function compressedBookFiles(bytes: Uint8Array, extension: string): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error(`Could not read this .${extension} ebook - it may be corrupt or password-protected.`);
  }
}

/** HTMLZ -> its primary HTML document. */
export function htmlzToHtml(bytes: Uint8Array): string {
  const files = compressedBookFiles(bytes, "htmlz");
  const names = Object.keys(files).filter((name) => !name.endsWith("/"));
  const name = names.find((entry) => /(^|\/)(index|book)\.x?html?$/i.test(entry)) ??
    names.find((entry) => /\.x?html?$/i.test(entry));
  if (!name) throw new Error("This .htmlz ebook contains no HTML document to read.");
  const html = strFromU8(files[name]!);
  if (!/<(?:html|body|h[1-6]|p)\b/i.test(html)) {
    throw new Error("The HTML document inside this .htmlz ebook is not readable HTML.");
  }
  return html;
}

/** TXTZ -> readable HTML, joining text chapters in archive-name order. */
export function txtzToHtml(bytes: Uint8Array): string {
  const files = compressedBookFiles(bytes, "txtz");
  const names = Object.keys(files).filter((name) => /\.txt$/i.test(name)).sort((a, b) => a.localeCompare(b));
  if (!names.length) throw new Error("This .txtz ebook contains no text document to read.");
  const escape = (text: string): string => text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const chapters = names.map((name) => {
    const text = strFromU8(files[name]!);
    if (text.includes("\0")) throw new Error(`The text entry ${name} contains binary data.`);
    const paragraphs = text.trim().split(/\r?\n\s*\r?\n/)
      .map((p) => `<p>${escape(p).replace(/\r?\n/g, "<br>")}</p>`).join("\n");
    return `<section><h2>${escape(name.replace(/^.*\//, ""))}</h2>${paragraphs}</section>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>TXTZ ebook</title></head><body>${chapters}</body></html>`;
}
