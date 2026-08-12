/**
 * MOBI/AZW ebook writer — the mirror image of the reader in ebooks.ts.
 * Stores the book's own HTML in a PalmDB record database: a PalmDOC
 * header, a 232-byte MOBI header, an EXTH metadata block, and the text
 * split into 4096-byte records compressed with PalmDOC LZ77 (type 2).
 *
 * The format is documented and the compressor/decompressor are exact
 * inverses, so every file written here round-trips through mobiToHtml.
 * AZW is the same PalmDB/MOBI container (that's literally what AZW is);
 * only the extension differs.
 */

/* Byte helpers ----------------------------------------------------------- */

const encoder = new TextEncoder();

function be16(out: Uint8Array, at: number, v: number): void {
  out[at] = (v >> 8) & 0xff;
  out[at + 1] = v & 0xff;
}

function be32(out: Uint8Array, at: number, v: number): void {
  out[at] = (v >>> 24) & 0xff;
  out[at + 1] = (v >>> 16) & 0xff;
  out[at + 2] = (v >>> 8) & 0xff;
  out[at + 3] = v & 0xff;
}

function fill(out: Uint8Array, at: number, len: number, value: number): void {
  out.fill(value, at, at + len);
}

/* PalmDOC LZ77 compression (type 2) ------------------------------------- */

/**
 * The exact inverse of the PalmDOC decompressor in ebooks.ts:
 *  - 0x00        → literal 0
 *  - 0x01..0x08  → literal run of that many bytes
 *  - 0x09..0x7F  → single literal byte
 *  - 0x80..0xBF  → 2-byte back-reference: 11 bits distance, 3 bits length
 *  - 0xC0..0xFF  → space + one character
 * Literals that can't be written as a single byte (1-8, 0x80-0xFF) go out
 * inside 1-8 byte runs. Matches use a rolling 3-byte hash so compression
 * stays fast even for large books.
 */
export function palmDocCompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  const maxDist = 2047; // the 11-bit distance field
  const maxLen = 10; // 3 + the 3-bit length field
  const minMatch = 4; // 2-byte ref vs 4+ literal bytes

  const hashMap = new Map<number, number[]>();
  const hash3 = (i: number): number => (input[i]! << 16) | (input[i + 1]! << 8) | input[i + 2]!;

  let pending: number[] = [];
  const flushPending = (): void => {
    for (let i = 0; i < pending.length; i += 8) {
      const run = Math.min(8, pending.length - i);
      out.push(run);
      for (let k = 0; k < run; k++) out.push(pending[i + k]!);
    }
    pending = [];
  };

  let i = 0;
  const n = input.length;
  while (i < n) {
    let bestLen = 0;
    let bestDist = 0;
    if (i + 3 <= n) {
      const h = hash3(i);
      const list = hashMap.get(h);
      if (list) {
        for (let k = list.length - 1; k >= 0; k--) {
          const pos = list[k]!;
          const dist = i - pos;
          if (dist > maxDist) break; // list is in order — anything earlier is farther
          if (dist <= 0) continue;
          let len = 3;
          while (len < maxLen && i + len < n && input[i + len] === input[pos + len]) len++;
          if (len > bestLen) {
            bestLen = len;
            bestDist = dist;
            if (len === maxLen) break;
          }
        }
        list.push(i);
        while (list.length > 1 && i - list[0]! > maxDist) list.shift();
      } else {
        hashMap.set(h, [i]);
      }
    }

    if (bestLen >= minMatch) {
      flushPending();
      const pair = ((bestLen - 3) & 0x07) | ((bestDist & 0x7ff) << 3);
      out.push(0x80 | (pair >>> 8), pair & 0xff);
      i += bestLen;
      continue;
    }

    const b = input[i]!;
    if (pending.length === 0 && (b === 0 || (b >= 0x09 && b <= 0x7f))) {
      out.push(b);
    } else {
      pending.push(b);
      if (pending.length >= 64) flushPending();
    }
    i++;
  }
  flushPending();
  return new Uint8Array(out);
}

/* Container -------------------------------------------------------------- */

function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t.slice(0, 200) : undefined;
}

/** Splits bytes into ≤4096-byte records, the first capped by headerSize. */
function splitRecords(text: Uint8Array, headerSize: number, recordSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  const firstCap = Math.max(1, recordSize - headerSize);
  let at = 0;
  const cap = Math.min(firstCap, text.length);
  if (cap > 0) chunks.push(text.subarray(0, cap));
  at = cap;
  while (at < text.length) {
    const end = Math.min(at + recordSize, text.length);
    chunks.push(text.subarray(at, end));
    at = end;
  }
  return chunks;
}

/**
 * Builds a PalmDB record database (type BOOK, creator MOBI) holding a
 * PalmDOC header, a MOBI header, EXTH metadata and the book's HTML.
 */
export function mobiFromHtml(html: string, opts?: { title?: string }): Uint8Array {
  const title = (opts?.title || extractTitle(html) || "Book").slice(0, 199);
  const text = encoder.encode(html);
  const titleBytes = encoder.encode(title);

  // EXTH record: cde-type 1 (mobipocket), language "en", creator "OneKit".
  const exthRecords: [number, Uint8Array][] = [
    [501, new Uint8Array([0, 1])],
    [524, encoder.encode("en")],
    [204, encoder.encode("OneKit")]
  ];
  let exthDataLen = 0;
  for (const [, data] of exthRecords) exthDataLen += 8 + data.length;
  const exthLength = 12 + exthDataLen;

  const MOBI_HEADER_LEN = 232;
  const headerSize = 16 + MOBI_HEADER_LEN + exthLength + titleBytes.length;
  const chunks = splitRecords(text, headerSize, 4096);
  const recordCount = chunks.length;

  // Record 0: PalmDOC header + MOBI header + EXTH + title.
  const record0 = new Uint8Array(headerSize);
  // PalmDOC header.
  be16(record0, 0, 2); // compression: PalmDOC LZ77
  be32(record0, 4, text.length); // uncompressed text length
  be16(record0, 8, recordCount); // number of text records
  be16(record0, 10, 4096); // record size
  // MOBI header (at record offset 16).
  const mobi = 16;
  record0[mobi] = 0x4d; record0[mobi + 1] = 0x4f; record0[mobi + 2] = 0x42; record0[mobi + 3] = 0x49; // "MOBI"
  be32(record0, mobi + 4, MOBI_HEADER_LEN);
  be32(record0, mobi + 8, 2); // mobi type: book
  be32(record0, mobi + 12, 65001); // text encoding: UTF-8
  be32(record0, mobi + 16, 0); // unique id
  be32(record0, mobi + 20, 6); // file version
  fill(record0, mobi + 24, 40, 0xff); // ortho/infl/names/keys + 6 extra indexes
  be32(record0, mobi + 64, 0xffffffff); // first non-book index
  be32(record0, mobi + 68, MOBI_HEADER_LEN + exthLength); // full name offset
  be32(record0, mobi + 72, titleBytes.length); // full name length
  be32(record0, mobi + 76, 0x0409); // locale (en-US)
  be32(record0, mobi + 80, 0); // input language
  be32(record0, mobi + 84, 0); // output language
  be32(record0, mobi + 88, 6); // min version
  be32(record0, mobi + 92, 0xffffffff); // first image index
  be32(record0, mobi + 112, 0x40); // EXTH flags
  be32(record0, mobi + 148, 0xffffffff); // DRM offset (none)
  be32(record0, mobi + 172, 1); // first content record
  be32(record0, mobi + 176, recordCount); // last content record
  be32(record0, mobi + 184, 0xffffffff); // FCIS record number
  be32(record0, mobi + 196, 0xffffffff); // FLIS record number
  // (offsets 116-147, 152-171, 180, 188-195, 204-231 stay zero — padding)
  // EXTH block.
  const exth = mobi + MOBI_HEADER_LEN;
  record0[exth] = 0x45; record0[exth + 1] = 0x58; record0[exth + 2] = 0x54; record0[exth + 3] = 0x48; // "EXTH"
  be32(record0, exth + 4, exthLength);
  be32(record0, exth + 8, exthRecords.length);
  let at = exth + 12;
  for (const [type, data] of exthRecords) {
    be32(record0, at, type);
    be32(record0, at + 4, 8 + data.length);
    record0.set(data, at + 8);
    at += 8 + data.length;
  }
  record0.set(titleBytes, at);
  // The title must sit exactly where the MOBI header's fullNameOffset claims.
  if (mobi + MOBI_HEADER_LEN + exthLength !== at) {
    throw new Error("Internal MOBI layout error.");
  }

  // PalmDB container: 78-byte header + 8-byte record entries + records.
  const records = [record0, ...chunks.map((c) => palmDocCompress(c))];
  const total = records.length;
  const listEnd = 78 + total * 8;
  const file = new Uint8Array(listEnd + records.reduce((s, r) => s + r.length, 0));
  const name = encoder.encode(title.slice(0, 31));
  file.set(name, 0);
  file.set(encoder.encode("BOOK"), 60);
  file.set(encoder.encode("MOBI"), 64);
  be16(file, 76, total);
  let off = listEnd;
  for (let r = 0; r < total; r++) {
    be32(file, 78 + r * 8, off);
    if (r === 0) file[78 + r * 8 + 4] = 0x02; // header record: secret bit
    const rec = records[r]!;
    file.set(rec, off);
    off += rec.length;
  }
  return file;
}

/**
 * AZW4 writer: wraps an existing PDF in a PalmDB database, exactly the
 * container Amazon uses for "Print Replica" Kindle files. The reader
 * (extractAzw4Pdf in ebooks.ts) finds the %PDF- stream back, so every
 * file written here round-trips into the PDF pipeline.
 */
export function azw4FromPdf(pdf: Uint8Array, opts?: { title?: string }): Uint8Array {
  const title = (opts?.title || "Book").slice(0, 31);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < pdf.length; i += 4096) {
    chunks.push(pdf.subarray(i, Math.min(i + 4096, pdf.length)));
  }
  const total = chunks.length;
  const listEnd = 78 + total * 8;
  const file = new Uint8Array(listEnd + pdf.length);
  file.set(encoder.encode(title), 0);
  file.set(encoder.encode("BOOK"), 60);
  file.set(encoder.encode("MOBI"), 64);
  be16(file, 76, total);
  let off = listEnd;
  for (let r = 0; r < total; r++) {
    be32(file, 78 + r * 8, off);
    const rec = chunks[r]!;
    file.set(rec, off);
    off += rec.length;
  }
  return file;
}
