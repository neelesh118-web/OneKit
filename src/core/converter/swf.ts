/**
 * Shockwave Flash (.swf) reader. SWF is a documented binary format: a
 * header (FWS = raw, CWS = zlib body), then a sequence of length-prefixed
 * tags. The text lives in DefineText (tag 11, UTF-16 code units),
 * DefineText2 (tag 33, UTF-8) and DefineEditText (tag 37, dynamic text).
 * This reader walks the tags — including inside DefineSprite bodies — and
 * collects the character runs. Layout, vectors and ActionScript are
 * dropped, the same honest rule as every other binary text reader here.
 */
import { inflateSync } from "fflate/browser";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** MSB-first bit reader over a byte array. */
class BitReader {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBits(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.bytes[this.pos >> 3];
      if (byte === undefined) throw new Error("SWF bit stream overrun");
      value = (value << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos += 1;
    }
    return value;
  }

  readSignedBits(n: number): number {
    const value = this.readBits(n);
    const sign = 1 << (n - 1);
    return value & sign ? value - (1 << n) : value;
  }

  align(): void {
    this.pos = (this.pos + 7) & ~7;
  }

  /** Read the byte at the current (aligned) position and advance 8 bits. */
  private byte(): number {
    const b = this.bytes[this.pos >> 3];
    if (b === undefined) throw new Error("SWF stream overrun");
    this.pos += 8;
    return b;
  }

  readU8(): number {
    this.align();
    return this.byte();
  }

  readU16(): number {
    this.align();
    const a = this.byte();
    const b = this.byte();
    return a | (b << 8);
  }

  readI8(): number {
    const v = this.readU8();
    return v & 0x80 ? v - 0x100 : v;
  }

  readI16(): number {
    const v = this.readU16();
    return v & 0x8000 ? v - 0x10000 : v;
  }

  /** Skip n bytes (bit position moves n × 8). */
  skipBytes(n: number): void {
    this.pos += n * 8;
  }

  get done(): boolean {
    return this.pos >= this.bytes.length * 8;
  }
}

/** Consume a RECT (5-bit nBits + 4 signed values) — bounds only. */
function skipRect(r: BitReader): void {
  const n = r.readBits(5);
  r.readSignedBits(n);
  r.readSignedBits(n);
  r.readSignedBits(n);
  r.readSignedBits(n);
}

/** Consume a MATRIX — scale/rotate/translate, unused for text. */
function skipMatrix(r: BitReader): void {
  if (r.readBits(1) === 1) {
    const n = r.readBits(5);
    r.readSignedBits(n);
    r.readSignedBits(n);
  }
  if (r.readBits(1) === 1) {
    const n = r.readBits(5);
    r.readSignedBits(n);
    r.readSignedBits(n);
  }
  const n = r.readBits(5);
  r.readSignedBits(n);
  r.readSignedBits(n);
}

/** DefineText (tag 11) / DefineText2 (tag 33) → character runs. */
function extractGlyphText(tagData: Uint8Array, utf8: boolean): string {
  const r = new BitReader(tagData);
  if (tagData.length < 2) return "";
  r.readU16(); // character ID
  skipRect(r);
  skipMatrix(r);
  const glyphBits = r.readU8();
  const advanceBits = r.readU8();
  if (glyphBits === 0 || glyphBits > 24 || advanceBits > 24) return "";
  const codes: number[] = [];
  let guard = 0;
  // Each text record starts with one byte: the high bit set means a style
  // record (flags byte), otherwise the byte IS the glyph count. A bare
  // 0x00 byte ends the records.
  while (!r.done && guard++ < 100000) {
    const flags = r.readBits(8);
    if (flags === 0) break; // end-of-records marker
    if (flags & 0x80) {
      // Style record.
      if (flags & 0x08) {
        r.readU16(); // font ID
        r.readU16(); // font height
      }
      if (flags & 0x04) r.skipBytes(utf8 ? 4 : 3); // color RGBA / RGB
      if (flags & 0x02) r.readI8(); // y offset
      if (flags & 0x01) r.readI8(); // x offset
      if (flags & 0x10) {
        r.readI16(); // move x
        r.readI16(); // move y
      }
    } else {
      // Glyph record: this byte is the count; character codes follow in
      // glyphBits-wide fields.
      const count = flags;
      for (let i = 0; i < count; i++) {
        const index = r.readBits(glyphBits);
        r.readBits(advanceBits); // advance — layout only
        codes.push(index);
      }
    }
  }
  if (codes.length === 0) return "";
  if (utf8) {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(codes));
  }
  return String.fromCharCode(...codes);
}

/** DefineEditText (tag 37) → the initial text, best-effort. */
function extractEditText(tagData: Uint8Array): string {
  try {
    const r = new BitReader(tagData);
    if (tagData.length < 2) return "";
    r.readU16();
    skipRect(r);
    const flags = r.readU8();
    if (flags & 0x01) {
      // FontClass string.
      const len = r.readU8();
      if (len > 0) r.skipBytes(len);
    }
    if (flags & 0x02) {
      r.readU16(); // font ID
      r.readU16(); // font height
      r.skipBytes(4); // font color RGBA
    }
    if (flags & 0x04) r.readU16(); // max length
    r.readU8(); // align
    r.skipBytes(2); // left margin
    r.skipBytes(2); // right margin
    r.skipBytes(2); // indent
    r.skipBytes(2); // leading
    r.skipBytes(2); // variable height
    if (!(flags & 0x08)) return ""; // no initial text
    const len = r.readU8();
    if (len === 0 || len > 512) return "";
    const bytes: number[] = [];
    for (let i = 0; i < len; i++) bytes.push(r.readU8());
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return "";
  }
}

/** Walk a tag stream, collecting text from the text-bearing tags. */
function walkTags(body: Uint8Array, out: string[], depth: number): void {
  if (depth > 8) return;
  let pos = 0;
  const dv = new DataView(body.buffer, body.byteOffset);
  while (pos + 2 <= body.length) {
    const codeAndLen = dv.getUint16(pos, true);
    pos += 2;
    const code = codeAndLen >> 6;
    let len = codeAndLen & 0x3f;
    if (len === 0x3f) {
      if (pos + 4 > body.length) break;
      len = dv.getUint32(pos, true);
      pos += 4;
    }
    if (len === 0 || pos + len > body.length) break;
    const tagData = body.subarray(pos, pos + len);
    if (code === 11) {
      const text = extractGlyphText(tagData, false).trim();
      if (text) out.push(text);
    } else if (code === 33) {
      const text = extractGlyphText(tagData, true).trim();
      if (text) out.push(text);
    } else if (code === 37) {
      const text = extractEditText(tagData).trim();
      if (text) out.push(text);
    } else if (code === 39 && tagData.length > 6) {
      // DefineSprite: sprite ID + frame count, then a nested tag stream.
      walkTags(tagData.subarray(4), out, depth + 1);
    }
    pos += len;
  }
}

/** SWF → HTML: the readable text, tag order preserved. */
export function swfToHtml(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error("This .swf file is too short to be valid.");
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
  if (sig !== "FWS" && sig !== "CWS" && sig !== "ZWS") {
    throw new Error("This .swf file doesn't carry an FWS/CWS/ZWS header.");
  }
  if (sig === "ZWS") {
    throw new Error("ZWS (LZMA) SWF files can't be decompressed locally.");
  }
  let body: Uint8Array;
  try {
    body = sig === "CWS" ? inflateSync(bytes.subarray(8)) : bytes.subarray(8);
  } catch {
    throw new Error("Couldn't decompress this .swf file's body — it may be corrupt.");
  }
  const texts: string[] = [];
  walkTags(body, texts, 0);
  if (texts.length === 0) {
    throw new Error("Couldn't find readable text inside this .swf file.");
  }
  const bodyHtml = texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>SWF text</title></head><body><h1>SWF text</h1>${bodyHtml}</body></html>`;
}
