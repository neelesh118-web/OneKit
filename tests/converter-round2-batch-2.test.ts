// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { zipSync, zlibSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
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
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 1, false);
  view.setUint32(4, 1, false);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", zlibSync(new Uint8Array([0, red, green, blue]))),
    ...chunk("IEND", new Uint8Array())
  ]);
}

describe("round 2 batch 2: CBZ to PDF", () => {
  it("detects a ZIP container with a .cbz name and advertises only PDF", () => {
    const cbz = zipSync({ "001.png": tinyPng(255, 0, 0) });
    expect(detectFile(cbz, "comic.cbz").type).toBe("cbz");
    expect(targetsFor("cbz")).toEqual(["pdf"]);
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1279);
  });

  it("turns naturally ordered image entries into real PDF pages", async () => {
    const cbz = zipSync({
      "pages/10.png": tinyPng(0, 0, 255),
      "pages/2.png": tinyPng(255, 0, 0),
      "ComicInfo.xml": encoder.encode("<ComicInfo/>")
    });
    const result = await convertFile({ bytes: cbz, name: "issue.cbz" }, "pdf");
    expect(result.name).toBe("issue.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2);
  });

  it("rejects a valid archive with no image pages", async () => {
    const cbz = zipSync({ "ComicInfo.xml": encoder.encode("<ComicInfo/>") });
    await expect(convertFile({ bytes: cbz, name: "empty.cbz" }, "pdf")).rejects.toThrow(/no supported image pages/);
  });

  it("rejects a corrupt CBZ archive", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corrupt, name: "bad.cbz" }, "pdf")).rejects.toThrow(/Could not read this ZIP/);
  });
});
