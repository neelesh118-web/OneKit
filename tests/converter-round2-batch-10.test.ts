// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync, zlibSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

const encoder = new TextEncoder();
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function tinyPng(red: number, green: number, blue: number): Uint8Array {
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length, false);
    const typeBytes = encoder.encode(type);
    out.set(typeBytes, 4);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(new Uint8Array([...typeBytes, ...body])), false);
    return out;
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1, false);
  view.setUint32(4, 1, false);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", header), ...chunk("IDAT", zlibSync(new Uint8Array([0, red, green, blue]))), ...chunk("IEND", new Uint8Array())]);
}

describe("round 2 batch 10: CBZ to image-backed EPUB", () => {
  it("advertises EPUB and preserves the matrix milestone", () => {
    expect(targetsFor("cbz")).toEqual(expect.arrayContaining(["pdf", "epub"]));
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1299);
  });

  it("creates a real EPUB with naturally ordered image pages and navigation", async () => {
    const redPage = tinyPng(255, 0, 0);
    const bluePage = tinyPng(0, 0, 255);
    const cbz = zipSync({ "pages/10.png": bluePage, "pages/2.png": redPage, "ComicInfo.xml": encoder.encode("<ComicInfo/>") });
    const result = await convertFile({ bytes: cbz, name: "issue.cbz" }, "epub");
    expect(result.name).toBe("issue.epub");
    expect(result.mime).toBe("application/epub+zip");
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const files = unzipSync(result.bytes);
    expect(strFromU8(files.mimetype!)).toBe("application/epub+zip");
    expect(files["OEBPS/images/page-001.png"]).toEqual(redPage);
    expect(files["OEBPS/images/page-002.png"]).toEqual(bluePage);
    const opf = strFromU8(files["OEBPS/content.opf"]!);
    expect(opf.match(/<itemref /g)).toHaveLength(2);
    expect(opf.match(/media-type="image\/png"/g)).toHaveLength(2);
    const toc = strFromU8(files["OEBPS/toc.ncx"]!);
    expect(toc.match(/<navPoint /g)).toHaveLength(2);
    expect(strFromU8(files["OEBPS/page-001.xhtml"]!)).toContain("images/page-001.png");
  });

  it("rejects a valid image-free comic archive", async () => {
    const cbz = zipSync({ "ComicInfo.xml": encoder.encode("<ComicInfo/>") });
    await expect(convertFile({ bytes: cbz, name: "empty.cbz" }, "epub")).rejects.toThrow(/no supported image pages/);
  });

  it("rejects a corrupt CBZ archive", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corrupt, name: "bad.cbz" }, "epub")).rejects.toThrow(/Could not read this ZIP/);
  });
});
