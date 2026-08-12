// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildPrc(html: string, encryption = 0, compression = 1): Uint8Array {
  const body = encode(html), record = new Uint8Array(32), rv = new DataView(record.buffer), headerSize = 94;
  rv.setUint16(0, compression, false); rv.setUint32(4, body.length, false); rv.setUint16(8, 1, false); rv.setUint16(12, encryption, false);
  record.set(encode("MOBI"), 16); rv.setUint32(20, 16, false); rv.setUint32(28, 65001, false);
  const out = new Uint8Array(headerSize + record.length + body.length), view = new DataView(out.buffer);
  out.set(encode("OneKitBook")); out.set(encode("BOOKMOBI"), 60); view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false); view.setUint32(86, headerSize + record.length, false);
  out.set(record, headerSize); out.set(body, headerSize + record.length); return out;
}

describe("round 2: PRC to MOBI validated normalization", () => {
  it("advertises the pair only for validated conversion", () => {
    expect(targetsFor("prc")).toContain("mobi");
  });

  it("preserves a readable MOBI-book PRC as a defensive byte copy", async () => {
    const input = buildPrc("<html><body><h1>PRC book</h1><p>Readable.</p></body></html>");
    const result = await convertFile({ bytes: input, name: "book.prc" }, "mobi");
    expect(result).toMatchObject({ name: "book.mobi", mime: "application/x-mobipocket-ebook" });
    expect(result.bytes).not.toBe(input); expect(result.bytes).toEqual(input);
    expect(new TextDecoder().decode(result.bytes.subarray(60, 68))).toBe("BOOKMOBI");
  });

  it("rejects DRM-protected PRC", async () => {
    await expect(convertFile({ bytes: buildPrc("protected", 1), name: "locked.prc" }, "mobi"))
      .rejects.toThrow(/DRM-protected/);
  });

  it("rejects unsupported HUFF/CDIC compression", async () => {
    await expect(convertFile({ bytes: buildPrc("compressed", 0, 17480), name: "huff.prc" }, "mobi"))
      .rejects.toThrow(/HUFF\/CDIC/);
  });

  it("rejects a generic or corrupt PRC rather than relabeling it", async () => {
    await expect(convertFile({ bytes: encode("generic Palm application"), name: "app.prc" }, "mobi"))
      .rejects.toThrow(/MOBI/);
  });
});
