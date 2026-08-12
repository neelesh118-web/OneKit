// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { csvToOds, xlsxToCsv } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
function azw(html: string, encryption = 0): Uint8Array {
  const body = encode(html), record = new Uint8Array(32), rv = new DataView(record.buffer), header = 94;
  rv.setUint16(0, 1, false); rv.setUint32(4, body.length, false); rv.setUint16(8, 1, false); rv.setUint16(12, encryption, false);
  record.set(encode("MOBI"), 16); rv.setUint32(20, 16, false); rv.setUint32(28, 65001, false);
  const out = new Uint8Array(header + record.length + body.length), view = new DataView(out.buffer);
  out.set(encode("OneKitBook")); out.set(encode("BOOKMOBI"), 60); view.setUint16(76, 2, false);
  view.setUint32(78, header, false); view.setUint32(86, header + record.length, false); out.set(record, header); out.set(body, header + record.length); return out;
}

describe("round 2 ranks 2514 and 2669", () => {
  it("advertises AZW to FB2 and ODS to XLSM", () => {
    expect(targetsFor("azw")).toContain("fb2"); expect(targetsFor("ods")).toContain("xlsm");
  });

  it("converts validated AZW text to real FB2 XML", async () => {
    const result = await convertFile({ bytes: azw("<h1>Local book</h1><p>Readable chapter.</p>"), name: "book.azw" }, "fb2");
    const xml = new TextDecoder().decode(result.bytes);
    expect(result).toMatchObject({ name: "book.fb2", mime: "application/x-fictionbook+xml" });
    expect(xml).toContain("<FictionBook"); expect(xml).toContain("Readable chapter.");
  });

  it("converts ODS to genuine macro-enabled OOXML with intact cells and no VBA", async () => {
    const result = await convertFile({ bytes: await csvToOds("name,score\nAda,99"), name: "scores.ods" }, "xlsm");
    expect(result).toMatchObject({ name: "scores.xlsm", mime: "application/vnd.ms-excel.sheet.macroEnabled.12" });
    const files = unzipSync(result.bytes);
    expect(strFromU8(files["[Content_Types].xml"]!)).toContain("application/vnd.ms-excel.sheet.macroEnabled.main+xml");
    expect(files["xl/vbaProject.bin"]).toBeUndefined(); expect(await xlsxToCsv(result.bytes)).toContain("Ada,99");
  });

  it("rejects protected AZW and corrupt ODS", async () => {
    await expect(convertFile({ bytes: azw("locked", 1), name: "locked.azw" }, "fb2")).rejects.toThrow(/DRM/);
    await expect(convertFile({ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), name: "bad.ods" }, "xlsm")).rejects.toThrow();
  });
});
