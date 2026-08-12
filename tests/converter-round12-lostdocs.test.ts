// @vitest-environment node
// Round 12: the lost document walls — Shockwave Flash (DefineText/2/EditText),
// HWPX/HWP (HWPML zip), Sony BBeB LRF (zlib text streams), WordPerfect
// (WP6 UTF-16 / WP5 8-bit), all funneling through the text pipeline.
import { describe, expect, it } from "vitest";
import { zlibSync, zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX } from "../src/core/converter/matrix";
import { swfToHtml } from "../src/core/converter/swf";
import { lrfToHtml } from "../src/core/converter/lrf";
import { wpdToHtml } from "../src/core/converter/wpd";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

function utf16le(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 0xff; b[i * 2 + 1] = s.charCodeAt(i) >> 8; }
  return b;
}

/* SWF fixture ------------------------------------------------------------ */

class BitWriter {
  bytes: number[] = [];
  private acc = 0;
  private bits = 0;

  writeBits(value: number, n: number): void {
    for (let i = n - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((value >> i) & 1);
      this.bits += 1;
      if (this.bits === 8) {
        this.bytes.push(this.acc);
        this.acc = 0;
        this.bits = 0;
      }
    }
  }

  writeSignedBits(value: number, n: number): void {
    this.writeBits(value < 0 ? value + (1 << n) : value, n);
  }

  alignByte(): void {
    if (this.bits > 0) {
      this.bytes.push(this.acc << (8 - this.bits));
      this.acc = 0;
      this.bits = 0;
    }
  }

  writeU8(v: number): void {
    this.alignByte();
    this.bytes.push(v & 0xff);
  }

  writeU16(v: number): void {
    this.writeU8(v & 0xff);
    this.writeU8((v >> 8) & 0xff);
  }
}

function swfTag(code: number, payload: Uint8Array): Uint8Array {
  if (payload.length < 0x3f) {
    const out = new Uint8Array(2 + payload.length);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, (code << 6) | payload.length, true);
    out.set(payload, 2);
    return out;
  }
  const out = new Uint8Array(6 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, (code << 6) | 0x3f, true);
  dv.setUint32(2, payload.length, true);
  out.set(payload, 6);
  return out;
}

/** DefineText (11) / DefineText2 (33) with a style + glyph record. */
function defineTextPayload(codes: number[], utf8: boolean): Uint8Array {
  const bw = new BitWriter();
  bw.writeU16(1); // character ID
  // RECT (0, 0, 100, 100): 100 needs 8 signed bits (range −128…127).
  bw.writeBits(8, 5);
  bw.writeSignedBits(0, 8);
  bw.writeSignedBits(0, 8);
  bw.writeSignedBits(100, 8);
  bw.writeSignedBits(100, 8);
  // MATRIX: no scale, no rotate, translate 7-bit zeros.
  bw.writeBits(0, 1);
  bw.writeBits(0, 1);
  bw.writeBits(7, 5);
  bw.writeSignedBits(0, 7);
  bw.writeSignedBits(0, 7);
  bw.alignByte();
  bw.writeU8(8); // glyphBits
  bw.writeU8(8); // advanceBits
  bw.writeU8(utf8 ? 0x8c : 0x88); // style record: hasFont (+hasColor for DefineText2)
  bw.writeU16(1); // font ID
  bw.writeU16(12); // font height
  if (utf8) bw.writeU8(0), bw.writeU8(0), bw.writeU8(0), bw.writeU8(0); // RGBA
  bw.writeU8(codes.length); // glyph count
  for (const c of codes) {
    bw.writeBits(c, 8);
    bw.writeBits(0, 8); // advance
  }
  bw.writeU8(0); // end-of-records
  return new Uint8Array(bw.bytes);
}

function makeSwf(): Uint8Array {
  const text1 = swfTag(11, defineTextPayload([72, 101, 108, 108, 111], false)); // "Hello"
  const text2 = swfTag(33, defineTextPayload([72, 105], true)); // "Hi" UTF-8
  // DefineSprite (39) with a nested DefineText2 ("Sprite text").
  const nested = swfTag(33, defineTextPayload([83, 112, 114, 105, 116, 101, 32, 116, 101, 120, 116], true));
  const sprite = swfTag(39, new Uint8Array([...new Uint8Array(4), ...nested]));
  const body = new Uint8Array([...text1, ...text2, ...sprite]);
  const out = new Uint8Array(8 + body.length);
  out.set(enc("FWS"), 0);
  out[3] = 9; // version
  const dv = new DataView(out.buffer);
  dv.setUint32(4, out.length, true);
  out.set(body, 8);
  return out;
}

/* LRF fixture ------------------------------------------------------------ */

function makeLrf(): Uint8Array {
  const stream = new Uint8Array([...utf16le("Chapter one. "), 0xa1, 0xf5, ...utf16le("More LRF text")]);
  const z = zlibSync(stream);
  const total = 0x70 + z.length;
  const out = new Uint8Array(total);
  out.set([0x4c, 0x00, 0x52, 0x00, 0x46, 0x00], 0); // "LRF" UTF-16LE
  const dv = new DataView(out.buffer);
  dv.setUint16(0x08, 1000, true); // version
  dv.setUint16(0x0a, 0, true); // xor key
  dv.setBigUint64(0x10, 1n, true); // number of objects
  dv.setBigUint64(0x18, 0x60n, true); // object index offset
  // One object: id 1, at offset 0x70.
  dv.setUint32(0x60, 1, true);
  dv.setUint32(0x64, 0x70, true);
  dv.setUint32(0x68, z.length, true);
  out.set(z, 0x70);
  return out;
}

/* WPD fixtures ----------------------------------------------------------- */

function makeWp6(): Uint8Array {
  // FF 00 prefix, then UTF-16LE text with a 0x0D function code between runs.
  return new Uint8Array([0xff, 0x00, 0x00, 0x00, ...utf16le("WordPerfect"), 0x0d, ...utf16le(" body text")]);
}

function makeWp5(): Uint8Array {
  return new Uint8Array([0xff, 0x02, ...enc("WP5 legacy text")]);
}

/* HWPX fixture ----------------------------------------------------------- */

function makeHwpx(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": enc("<Types/>"),
    "Contents/content.hpml": enc('<hp:sec><hp:p><hp:t>First HWP paragraph</hp:t><hp:t>Second run</hp:t></hp:p><hp:p><hp:t>Third paragraph</hp:t></hp:p></hp:sec>')
  });
}

/* Tests ------------------------------------------------------------------ */

describe("Shockwave Flash (SWF)", () => {
  const swf = makeSwf();

  it("detects the FWS header", () => {
    expect(detectFile(swf, "movie.swf").type).toBe("swf");
  });

  it("extracts DefineText, DefineText2 and sprite text", () => {
    const html = swfToHtml(swf);
    expect(html).toContain("Hello");
    expect(html).toContain("Hi");
    expect(html).toContain("Sprite text");
  });

  it("converts swf → text and swf → docx end to end", async () => {
    const text = await convertFile({ bytes: swf, name: "movie.swf", mime: "" }, "text");
    expect(dec(text.bytes)).toContain("Hello");
    const docx = await convertFile({ bytes: swf, name: "movie.swf", mime: "" }, "docx");
    expect(zipMagic(docx.bytes)).toBe(true);
  });
});

describe("Sony BBeB (LRF)", () => {
  const lrf = makeLrf();

  it("detects the UTF-16LE LRF header", () => {
    expect(detectFile(lrf, "book.lrf").type).toBe("lrf");
  });

  it("extracts the zlib text stream, dropping the 0xF5 tags", () => {
    const html = lrfToHtml(lrf);
    expect(html).toContain("Chapter one.");
    expect(html).toContain("More LRF text");
  });

  it("converts lrf → epub end to end", async () => {
    const out = await convertFile({ bytes: lrf, name: "book.lrf", mime: "" }, "epub");
    expect(zipMagic(out.bytes)).toBe(true);
  });
});

describe("WordPerfect (WPD)", () => {
  it("detects the 0xFF 0x00 WP6 prefix", () => {
    expect(detectFile(makeWp6(), "doc.wpd").type).toBe("wpd");
  });

  it("extracts WP6 UTF-16 text, skipping function codes", () => {
    const html = wpdToHtml(makeWp6());
    expect(html).toContain("WordPerfect");
    expect(html).toContain("body text");
  });

  it("extracts WP5 8-bit text", () => {
    const html = wpdToHtml(makeWp5());
    expect(html).toContain("WP5 legacy text");
  });

  it("converts wpd → docx end to end", async () => {
    const out = await convertFile({ bytes: makeWp6(), name: "doc.wpd", mime: "" }, "docx");
    expect(zipMagic(out.bytes)).toBe(true);
  });
});

describe("Hangul Word Processor (HWPX/HWP)", () => {
  it("detects the HWPML zip flavour", () => {
    expect(detectFile(makeHwpx(), "doc.hwpx").type).toBe("hwpx");
  });

  it("reads the hp:t run text", async () => {
    const out = await convertFile({ bytes: makeHwpx(), name: "doc.hwpx", mime: "" }, "text");
    expect(dec(out.bytes)).toContain("First HWP paragraph");
    expect(dec(out.bytes)).toContain("Third paragraph");
  });

  it("sniffs a ZIP .hwp through the same reader", async () => {
    const out = await convertFile({ bytes: makeHwpx(), name: "doc.hwp", mime: "" }, "markdown");
    expect(dec(out.bytes)).toContain("First HWP paragraph");
  });
});

describe("matrix consistency after round 12", () => {
  it("new rows advertise the full document set", () => {
    for (const row of ["swf", "hwpx", "hwp", "lrf", "wpd"] as const) {
      expect(new Set(MATRIX[row]).size).toBe(MATRIX[row].length);
      expect(MATRIX[row]).not.toContain(row);
      expect(MATRIX[row]).toContain("pdf");
      expect(MATRIX[row]).toContain("epub");
    }
  });
});
