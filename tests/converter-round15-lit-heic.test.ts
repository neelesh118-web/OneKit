// @vitest-environment node
// Round 15: Microsoft Reader (.lit) + HEIC/HEIF photos.
// The LIT fixture builds a real ITOLITLS container (header + piece table +
// IFCM directory + NameList + manifest + LZX-compressed binary-HTML spine)
// using the same mini LZX encoder as round 14, then exercises it through
// detect/convert. HEIC is verified two ways: mocked decode for the converter
// routing, and a REAL decode of a bundled iPhone-style sample (1280×854).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { litToHtml, litToText, unbinToHtml } from "../src/core/converter/lit";
import { decodeHeic } from "../src/core/converter/heic";
import { canvasOptions } from "./canvas-options";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/* Mini LZX encoder (identical to the round-14 fixture) -------------------- */

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

function pretreeSym(w: LzxWriter, s: number): void {
  w.writeBits(s < 12 ? s : 24 + (s - 12), s < 12 ? 4 : 5);
}

function writePretreeLens(w: LzxWriter): void {
  for (let s = 0; s < 20; s++) w.writeBits(s < 12 ? 4 : 5, 4);
}

function writeMainTreeLens(w: LzxWriter, mainMax: number): void {
  writePretreeLens(w);
  for (let s = 0; s < 256; s++) pretreeSym(w, 8);
  writePretreeLens(w);
  for (let s = 256; s < mainMax; s++) pretreeSym(w, 8);
}

function writeEmptyLengthTree(w: LzxWriter): void {
  writePretreeLens(w);
  for (const y of [31, 31, 31, 31, 25]) {
    pretreeSym(w, 18);
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

/* Synthetic LIT container ------------------------------------------------- */

function i32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v, true);
  return b;
}
function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}
function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}

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

/** The UnBinary byte stream for `<p>Hello LIT. <a href="index.html">read more</a></p>`. */
function binaryHtml(): Uint8Array {
  const parts: Uint8Array[] = [];
  const flag = (f: number, tag: number): Uint8Array => Uint8Array.from([0x00, f, tag]);
  parts.push(flag(1, 74)); // <p
  parts.push(Uint8Array.from([0x00])); // end attrs
  parts.push(enc("Hello LIT. "));
  parts.push(flag(1, 3)); // <a
  parts.push(Uint8Array.from([0x01])); // href attr code
  // href value: length byte (11 chars incl. the sentinel), sentinel 'X', text
  parts.push(Uint8Array.from([0x0c]));
  parts.push(enc("Xindex.html"));
  parts.push(Uint8Array.from([0x00])); // end attrs
  parts.push(enc("read more"));
  parts.push(flag(2, 3)); // </a>
  parts.push(flag(2, 74)); // </p>
  parts.push(Uint8Array.from([0x00]));
  return concat(...parts);
}

function buildNameList(): Uint8Array {
  const ms = enc("MSCompressed");
  const msUtf16 = new Uint8Array(ms.length * 2);
  ms.forEach((b, i) => {
    msUtf16[i * 2] = b;
    msUtf16[i * 2 + 1] = 0;
  });
  return concat(u16(1), u16(2), u16(0), new Uint8Array(2), u16(ms.length), msUtf16, new Uint8Array(2));
}

function buildManifest(): Uint8Array {
  const sized = (s: string): Uint8Array => concat(Uint8Array.from([s.length]), enc(s));
  return concat(
    Uint8Array.from([1]), enc("1"), // root
    i32(1), u32(0), sized("0"), sized("index.html"), sized("text/html"), Uint8Array.from([0]), // spine item (zpad null)
    i32(0), i32(0), i32(0) // not spine / css / images
  );
}

const LZX_GUID = Uint8Array.from([
  0xc6, 0x07, 0x90, 0x0a, 0x76, 0x40, 0xd3, 0x11, 0x87, 0x89, 0x00, 0x00, 0xf8, 0x10, 0x57, 0x54
]);

function buildLit(windowBits = 15): Uint8Array {
  const unbin = binaryHtml();
  const lzx = lzxEncodeVerbatim(unbin, windowBits);
  const nameList = buildNameList();
  const manifest = buildManifest();

  const control = new Uint8Array(32);
  new DataView(control.buffer).setInt32(0, 3, true);
  control.set(enc("LZXC"), 4);
  new DataView(control.buffer).setUint32(8, 32768, true);
  new DataView(control.buffer).setUint32(12, 1, true); // u=1 → window 15 bits

  const resetTable = new Uint8Array(48);
  new DataView(resetTable.buffer).setInt32(12, 48, true); // entry area → ofsEntry = 56 ≥ len
  new DataView(resetTable.buffer).setInt32(16, unbin.length, true); // uclength

  const contentOffset =
    140 /* secondary header */ + 104 /* sec hdr */ + 544 /* directory */ + 16 + 16 + 16;
  const secStart = 140;
  let c = contentOffset;
  const place = (data: Uint8Array): { offset: number; size: number } => {
    const r = { offset: c - contentOffset, size: data.length };
    c += data.length;
    return r;
  };
  const nl = place(nameList);
  const mf = place(manifest);
  const cd = place(control);
  const tl = place(LZX_GUID);
  const rt = place(resetTable);
  const ct = place(lzx);

  // IFCM directory: 32-byte header + one 512-byte AOLL chunk.
  const chunkSize = 512;
  const directory = new Uint8Array(32 + chunkSize);
  const dv = new DataView(directory.buffer);
  directory.set(enc("IFCM"), 0);
  dv.setInt32(8, chunkSize, true);
  dv.setInt32(24, 1, true); // num chunks
  directory.set(enc("AOLL"), 32);
  dv.setInt32(36, 0, true); // remaining
  let p = 32 + 44; // AOLL tag(4) + remaining(4) + 40-byte header
  const writeEntry = (name: string, section: number, offset: number, size: number): void => {
    const nb = enc(name);
    for (const b of encint(nb.length)) directory[p++] = b;
    directory.set(nb, p);
    p += nb.length;
    for (const b of encint(section)) directory[p++] = b;
    for (const b of encint(offset)) directory[p++] = b;
    for (const b of encint(size)) directory[p++] = b;
  };
  writeEntry("::DataSpace/NameList", 0, nl.offset, nl.size);
  writeEntry("/manifest", 0, mf.offset, mf.size);
  writeEntry("::DataSpace/Storage/MSCompressed/ControlData", 0, cd.offset, cd.size);
  writeEntry("::DataSpace/Storage/MSCompressed/Transform/List", 0, tl.offset, tl.size);
  writeEntry(
    "::DataSpace/Storage/MSCompressed/Transform/{0A9007C6-4076-11D3-8789-0000F8105754}/InstanceData/ResetTable",
    0,
    rt.offset,
    rt.size
  );
  writeEntry("::DataSpace/Storage/MSCompressed/Content", 0, ct.offset, ct.size);
  writeEntry("/data/0/content", 1, 0, unbin.length);
  dv.setUint16(32 + chunkSize - 2, 7, true); // entry count

  const secHdr = new Uint8Array(104);
  const sdv = new DataView(secHdr.buffer);
  sdv.setInt32(4, 8, true); // first block at offset 8
  secHdr.set(enc("CAOL"), 8);
  sdv.setUint32(12, 2, true); // block version
  sdv.setUint32(20, 12, true); // creator id
  sdv.setInt32(28, directory.length, true); // entry_chunklen must match piece 1 size
  sdv.setUint32(36, 0, true); // entry_unknown
  sdv.setInt32(40, 16, true); // count_chunklen
  sdv.setUint32(44, 0, true); // count_unknown
  secHdr.set(enc("ITSF"), 56);
  sdv.setUint32(60, 4, true); // block version
  sdv.setUint32(72, contentOffset, true); // content offset
  sdv.setUint32(80, 0, true); // timestamp
  sdv.setUint32(84, 0x409, true); // language id

  const header = new Uint8Array(60);
  const hdv = new DataView(header.buffer);
  header.set(enc("ITOLITLS"), 0);
  hdv.setUint32(8, 1, true); // version
  hdv.setInt32(12, 60, true); // hdr_len
  hdv.setInt32(16, 5, true); // num pieces
  hdv.setInt32(20, 104, true); // sec hdr len

  // Piece table at 60..140. Piece 1 = directory, piece 2 = counts blob,
  // pieces 3/4 = GUID blobs.
  const dirOffset = 140 + 104;
  const countsOffset = dirOffset + directory.length;
  const guid1Offset = countsOffset + 16;
  const guid2Offset = guid1Offset + 16;
  const pieces = new Uint8Array(5 * 16);
  const pdv = new DataView(pieces.buffer);
  pdv.setUint32(16, dirOffset, true);
  pdv.setInt32(24, directory.length, true);
  pdv.setUint32(32, countsOffset, true);
  pdv.setInt32(40, 16, true);
  pdv.setUint32(48, guid1Offset, true);
  pdv.setInt32(56, 16, true);
  pdv.setUint32(64, guid2Offset, true);
  pdv.setInt32(72, 16, true);

  const counts = new Uint8Array(16);
  const guid1 = new Uint8Array(16);
  const guid2 = new Uint8Array(16);

  return concat(header, pieces, secHdr, directory, counts, guid1, guid2, nameList, manifest, control, LZX_GUID, resetTable, lzx);
}

const LIT = buildLit();

describe("round 15: LIT (Microsoft Reader)", () => {
  it("detects LIT by ITOLITLS magic and extension", () => {
    expect(detectFile(LIT, "book.lit").type).toBe("lit");
    expect(detectFile(LIT, "noextension").type).toBe("lit");
  });

  it("decodes the binary-HTML spine through LZX + UnBinary", () => {
    expect(litToText(LIT)).toContain("Hello LIT.");
    expect(litToText(LIT)).toContain("read more");
    const html = litToHtml(LIT);
    expect(html).toContain("<p>");
    expect(html).toContain("</p>");
    expect(html).toContain('href="index.html"');
  });

  it("unbinToHtml handles text, tags, attrs and closing tags", () => {
    const html = unbinToHtml(binaryHtml());
    expect(html).toBe('<p>Hello LIT. <a href="index.html">read more</a></p>');
  });

  it("advertises the full document target set", () => {
    const targets = targetsFor("lit");
    for (const t of ["text", "html", "pdf", "docx", "epub", "mobi", "fb2", "azw3", "cbz", "image-png"] as const) {
      expect(targets).toContain(t);
    }
  });

  it("converts lit → text / pdf / docx", async () => {
    const text = await convertFile({ name: "book.lit", bytes: LIT }, "text");
    expect(dec(text.bytes)).toContain("Hello LIT.");

    const pdf = await convertFile({ name: "book.lit", bytes: LIT }, "pdf");
    expect(dec(pdf.bytes.subarray(0, 5))).toBe("%PDF-");

    const docx = await convertFile({ name: "book.lit", bytes: LIT }, "docx");
    expect(docx.bytes[0]).toBe(0x50); // PK zip
  });

  it("throws an honest error for a non-LIT file", () => {
    expect(() => litToText(enc("not a lit file at all"))).toThrow(/lit/i);
  });
});

describe("round 15: HEIC photos", () => {
  it("detects HEIC by ftyp brand and extension", () => {
    const heic = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/sample.heic"));
    expect(detectFile(heic, "photo.heic").type).toBe("image-heic");
    expect(detectFile(heic, "noextension").type).toBe("image-heic");
  });

  it("advertises the full raster + document target set", () => {
    const targets = targetsFor("image-heic");
    for (const t of ["image-png", "image-jpeg", "image-webp", "pdf", "docx", "pptx", "html"] as const) {
      expect(targets).toContain(t);
    }
    expect(targets).not.toContain("image-heic"); // no honest local encoder
  });

  it("routes a decoded HEIC through the raster pipeline", async () => {
    const heic = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/sample.heic"));
    // A genuine tiny 1×1 JFIF JPEG (real bytes pdf-lib can decode and embed).
    const tinyJpegB64 =
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
    const fake = Uint8Array.from(atob(tinyJpegB64), (c) => c.charCodeAt(0));
    const opts = {
      ...canvasOptions(),
      heicDecode: { toJpeg: async (): Promise<Uint8Array> => fake }
    };
    const png = await convertFile({ name: "photo.heic", bytes: heic }, "image-png", opts);
    expect(png.bytes[0]).toBe(0x89); // PNG magic
    expect(png.bytes[1]).toBe(0x50);

    const pdf = await convertFile({ name: "photo.heic", bytes: heic }, "pdf", opts);
    expect(dec(pdf.bytes.subarray(0, 5))).toBe("%PDF-");

    const docx = await convertFile({ name: "photo.heic", bytes: heic }, "docx", opts);
    expect(docx.bytes[0]).toBe(0x50); // PK zip
  });

  it("really decodes an iPhone-style HEIC via the bundled libheif WASM", async () => {
    const heic = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/sample.heic"));
    const bitmap = await decodeHeic(heic);
    expect(bitmap.width).toBe(1280);
    expect(bitmap.height).toBe(854);
    expect(bitmap.data.length).toBe(1280 * 854 * 4);
    // The sample's top-left pixel is a known non-transparent blue-grey.
    expect(bitmap.data[3]).toBe(255);
  });

  it("throws an honest error for bytes that aren't HEIC", async () => {
    await expect(decodeHeic(enc("definitely not a heic file"))).rejects.toThrow(/HEIC|heif/i);
  });
});
