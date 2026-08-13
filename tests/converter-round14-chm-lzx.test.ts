// @vitest-environment node
// Round 14: Microsoft LZX decompression + Compiled HTML Help (.chm).
// The LZX stream is produced by a tiny encoder in this file (all-literal
// VERBATIM blocks with a length-9 main tree, an ALIGNED-style match block,
// and a raw UNCOMPRESSED block), then decoded back — plus a fully synthetic
// CHM container (ITSF + ITSP + PMGL + ControlData + SpanInfo + Content)
// exercised end-to-end through detect/convert.
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { chmToHtml, chmToText } from "../src/core/converter/chm";
import { lzxDecompress } from "../src/core/converter/lzx";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/* Mini LZX encoder ------------------------------------------------------- */

class LzxWriter {
  bytes: number[] = [];
  private acc = 0;
  private nbits = 0;

  writeBits(value: number, n: number): void {
    for (let i = n - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((value >> i) & 1);
      this.nbits += 1;
      if (this.nbits === 8) {
        this.bytes.push(this.acc);
        this.acc = 0;
        this.nbits = 0;
      }
    }
  }

  align(): void {
    if (this.nbits > 0) {
      this.acc <<= 8 - this.nbits;
      this.bytes.push(this.acc);
      this.acc = 0;
      this.nbits = 0;
    }
  }

  finish(): Uint8Array {
    this.align();
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Pretree with 20 symbols: 0..11 at 4 bits, 12..19 at 5 bits (Kraft-valid:
 * 12/16 + 8/32 = 1). Canonical codes: the length-4 group starts at 0, the
 * length-5 group at firstCode[5] = (0 + 12) << 1 = 24.
 */
function pretreeSym(w: LzxWriter, s: number): void {
  w.writeBits(s < 12 ? s : 24 + (s - 12), s < 12 ? 4 : 5);
}

function writePretreeLens(w: LzxWriter): void {
  for (let s = 0; s < 20; s++) w.writeBits(s < 12 ? 4 : 5, 4);
}

/**
 * All main-tree symbols get length 9 (their code = the symbol value). The
 * decoder reads the tree in two readLengths calls ([0,256) and [256,max)),
 * each with its own pretree — the encoder must mirror that split.
 */
function writeMainTreeLens(w: LzxWriter, mainMax: number): void {
  writePretreeLens(w);
  for (let s = 0; s < 256; s++) pretreeSym(w, 8); // 8 → (0 - 8 + 17) % 17 = 9
  writePretreeLens(w);
  for (let s = 256; s < mainMax; s++) pretreeSym(w, 8);
}

/** Empty length tree: 249 zeros as four 51-runs and one 45-run of symbol 18. */
function writeEmptyLengthTree(w: LzxWriter): void {
  writePretreeLens(w);
  for (const y of [31, 31, 31, 31, 25]) {
    pretreeSym(w, 18); // run of (read 5 bits + 20) zeros
    w.writeBits(y, 5);
  }
}

function lzxEncodeVerbatim(data: Uint8Array, windowBits: number): Uint8Array {
  const numOffsets = [30, 32, 34, 36][windowBits - 15]! << 3;
  const mainMax = 256 + numOffsets;
  const w = new LzxWriter();
  w.writeBits(0, 1); // intel filesize = 0
  w.writeBits(1, 3); // VERBATIM block
  w.writeBits(data.length & 0xffff, 16);
  w.writeBits((data.length >> 16) & 0xff, 8);
  writeMainTreeLens(w, mainMax);
  writeEmptyLengthTree(w);
  for (const b of data) w.writeBits(b, 9);
  return w.finish();
}

function lzxEncodeUncompressed(data: Uint8Array): Uint8Array {
  const w = new LzxWriter();
  w.writeBits(0, 1); // intel filesize = 0
  w.writeBits(0, 3); // UNCOMPRESSED block
  w.writeBits(data.length & 0xffff, 16);
  w.writeBits((data.length >> 16) & 0xff, 8);
  w.align(); // pad partial byte; decoder discards the leftover bits
  for (const v of [1, 1, 1]) {
    w.writeBits(v & 0xff, 8);
    w.writeBits((v >> 8) & 0xff, 8);
    w.writeBits((v >> 16) & 0xff, 8);
    w.writeBits((v >>> 24) & 0xff, 8);
  }
  for (const b of data) w.writeBits(b, 8);
  return w.finish();
}

function lzxDecode(input: Uint8Array, windowBits: number, outputLength: number): Uint8Array {
  return lzxDecompress(input, { windowBits, resetIntervalFrames: 1, outputLength });
}

/* Synthetic CHM builder --------------------------------------------------- */

/**
 * ENCINT: 7-bit varint where the high bit marks "more bytes follow" and
 * the FIRST byte read carries the MOST significant 7 bits (the reader
 * assembles result = (result << 7) | (c & 0x7f), so high group goes first).
 */
function encint(v: number): number[] {
  const groups: number[] = [];
  let x = v;
  do {
    groups.push(x & 0x7f);
    x >>>= 7;
  } while (x > 0);
  groups.reverse();
  return groups.map((p, i) => (i < groups.length - 1 ? 0x80 : 0) | p);
}

function buildPmgl(entries: { name: string; section: number; offset: number; length: number }[]): Uint8Array {
  const chunk = new Uint8Array(4096);
  const dv = new DataView(chunk.buffer);
  chunk.set(enc("PMGL"), 0);
  dv.setUint32(4, 16, true); // quickref size
  let p = 8;
  for (const e of entries) {
    const name = enc(e.name);
    for (const b of encint(name.length)) chunk[p++] = b;
    chunk.set(name, p);
    p += name.length;
    for (const b of encint(e.section)) chunk[p++] = b;
    for (const b of encint(e.offset)) chunk[p++] = b;
    for (const b of encint(e.length)) chunk[p++] = b;
  }
  dv.setUint16(4094, entries.length, true);
  return chunk;
}

function buildChm(html: string, windowBits = 15): Uint8Array {
  const content = enc(html);
  const lzx = lzxEncodeVerbatim(content, windowBits);

  const itsf = new Uint8Array(0x60);
  const itsfDv = new DataView(itsf.buffer);
  itsf.set(enc("ITSF"), 0);
  itsfDv.setUint32(4, 3, true);
  itsfDv.setUint32(8, 0x60, true);
  const dirOffset = 0x60;
  const dataOffset = dirOffset + 0x30 + 4096; // v3 ITSP header is 48 bytes
  itsfDv.setBigUint64(0x2c, BigInt(dirOffset), true);
  itsfDv.setBigUint64(0x3c, BigInt(dataOffset), true);

  const itsp = new Uint8Array(0x30);
  const itspDv = new DataView(itsp.buffer);
  itsp.set(enc("ITSP"), 0);
  itspDv.setUint32(4, 3, true);
  itspDv.setUint32(8, 0x28, true);
  itspDv.setUint32(0x10, 4096, true);
  itspDv.setUint32(0x14, 2, true);
  itspDv.setUint32(0x18, 1, true);
  itspDv.setUint32(0x1c, 0xffffffff, true);
  itspDv.setUint32(0x20, 1, true);
  itspDv.setUint32(0x24, 0, true);
  itspDv.setUint32(0x28, 0, true);

  const pmgl = buildPmgl([
    { name: "::DataSpace/Storage/MSCompressed/ControlData", section: 0, offset: 0, length: 24 },
    { name: "::DataSpace/Storage/MSCompressed/SpanInfo", section: 0, offset: 256, length: 8 },
    { name: "::DataSpace/Storage/MSCompressed/Content", section: 0, offset: 512, length: lzx.length },
    { name: "/index.html", section: 1, offset: 0, length: content.length },
  ]);

  const control = new Uint8Array(24);
  const cd = new DataView(control.buffer);
  control.set(enc("LZXC"), 0);
  cd.setUint32(4, 1, true);
  cd.setUint32(8, 32768, true); // reset interval
  cd.setUint32(12, windowBits === 15 ? 32768 : 65536, true); // window size

  const span = new Uint8Array(8);
  new DataView(span.buffer).setBigUint64(0, BigInt(content.length), true);

  const file = new Uint8Array(dataOffset + 512 + lzx.length);
  file.set(itsf, 0);
  file.set(itsp, dirOffset);
  file.set(pmgl, dirOffset + 0x30);
  file.set(control, dataOffset);
  file.set(span, dataOffset + 256);
  file.set(lzx, dataOffset + 512);
  return file;
}

const PAGE_HTML =
  '<html><head><title>Sample Help</title></head><body><h1>CHM Heading</h1>' +
  "<p>Hello from a CHM help file.</p><p>Second paragraph here.</p></body></html>";

describe("round 14: LZX decompression", () => {
  it("round-trips a verbatim block of literals", () => {
    const data = enc("Hello LZX literal block");
    const out = lzxDecode(lzxEncodeVerbatim(data, 15), 15, data.length);
    expect(dec(out)).toBe("Hello LZX literal block");
  });

  it("decodes a verbatim block with an LZ77 match", () => {
    // "ABC" then a match: slot 4 (offset base 2 + 1 extra bit = 3), length 3.
    const w = new LzxWriter();
    w.writeBits(0, 1);
    w.writeBits(1, 3);
    w.writeBits(6, 16);
    w.writeBits(0, 8);
    writeMainTreeLens(w, 496);
    writeEmptyLengthTree(w);
    w.writeBits(65, 9); // 'A'
    w.writeBits(66, 9); // 'B'
    w.writeBits(67, 9); // 'C'
    w.writeBits(256 + (4 << 3) | 1, 9); // slot 4, length header 1 → length 3
    w.writeBits(1, 1); // extra offset bit → offset 3
    const out = lzxDecode(w.finish(), 15, 6);
    expect(dec(out)).toBe("ABCABC");
  });

  it("round-trips an uncompressed block", () => {
    const data = enc("raw uncompressed bytes 12345");
    const out = lzxDecode(lzxEncodeUncompressed(data), 15, data.length);
    expect(dec(out)).toBe("raw uncompressed bytes 12345");
  });

  it("handles a 64 KB window with the same stream", () => {
    const data = enc("wide window works too");
    const out = lzxDecode(lzxEncodeVerbatim(data, 16), 16, data.length);
    expect(dec(out)).toBe("wide window works too");
  });

  it("rejects a stream that overruns its declared length", () => {
    const data = enc("12345678");
    const encoded = lzxEncodeVerbatim(data, 15);
    expect(() => lzxDecode(encoded, 15, data.length + 5)).toThrow(/LZX/);
  });
});

describe("round 14: CHM container", () => {
  it("detects CHM by ITSF magic and extension", () => {
    const chm = buildChm(PAGE_HTML);
    expect(detectFile(chm, "help.chm").type).toBe("chm");
    expect(detectFile(chm, "noextension").type).toBe("chm");
  });

  it("extracts page text through the LZX content stream", () => {
    const chm = buildChm(PAGE_HTML);
    expect(chmToText(chm)).toContain("Hello from a CHM help file.");
    expect(chmToText(chm)).toContain("CHM Heading");
    expect(chmToHtml(chm)).toContain("<h1>CHM Heading</h1>");
  });

  it("handles the 64 KB window variant", () => {
    const chm = buildChm(PAGE_HTML, 16);
    expect(chmToText(chm)).toContain("Second paragraph here.");
  });

  it("advertises the full document target set", () => {
    const targets = targetsFor("chm");
    for (const t of ["text", "html", "pdf", "docx", "epub", "mobi", "fb2", "azw3", "cbz", "image-png"] as const) {
      expect(targets).toContain(t);
    }
  });

  it("converts chm → text / pdf / docx", async () => {
    const chm = buildChm(PAGE_HTML);
    const text = await convertFile({ name: "help.chm", bytes: chm }, "text");
    expect(dec(text.bytes)).toContain("Hello from a CHM help file.");

    const pdf = await convertFile({ name: "help.chm", bytes: chm }, "pdf");
    expect(dec(pdf.bytes.subarray(0, 5))).toBe("%PDF-");

    const docx = await convertFile({ name: "help.chm", bytes: chm }, "docx");
    expect(docx.bytes[0]).toBe(0x50); // PK zip
  });

  it("throws an honest error for a truncated CHM", () => {
    const chm = buildChm(PAGE_HTML);
    expect(() => chmToText(chm.subarray(0, 64))).toThrow(/CHM/);
  });
});
