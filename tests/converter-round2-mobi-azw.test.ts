// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildMobi(html: string, encryption = 0, compression = 1): Uint8Array {
  const body = encode(html);
  const record0 = new Uint8Array(32);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, compression, false);
  recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false);
  recordView.setUint16(12, encryption, false);
  record0.set(encode("MOBI"), 16);
  recordView.setUint32(20, 16, false);
  recordView.setUint32(28, 65001, false);

  const headerSize = 94;
  const output = new Uint8Array(headerSize + record0.length + body.length);
  const view = new DataView(output.buffer);
  output.set(encode("OneKitBook"), 0);
  output.set(encode("BOOKMOBI"), 60);
  view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false);
  view.setUint32(86, headerSize + record0.length, false);
  output.set(record0, headerSize);
  output.set(body, headerSize + record0.length);
  return output;
}

describe("round 2: MOBI to AZW container normalization", () => {
  it("advertises MOBI to AZW", () => {
    expect(targetsFor("mobi")).toContain("azw");
  });

  it("validates and preserves a readable MOBI container as AZW1", async () => {
    const input = buildMobi("<html><body><h1>Local book</h1><p>Readable chapter.</p></body></html>");
    const result = await convertFile({ bytes: input, name: "book.mobi" }, "azw");
    expect(result.name).toBe("book.azw");
    expect(result.mime).toBe("application/vnd.amazon.ebook");
    expect(result.bytes).not.toBe(input);
    expect(result.bytes).toEqual(input);
    expect(new TextDecoder().decode(result.bytes.subarray(60, 68))).toBe("BOOKMOBI");
  });

  it("rejects DRM-protected MOBI rather than relabeling it", async () => {
    await expect(convertFile({ bytes: buildMobi("protected", 1), name: "locked.mobi" }, "azw"))
      .rejects.toThrow(/DRM-protected/);
  });

  it("rejects unsupported HUFF/CDIC compression", async () => {
    await expect(convertFile({ bytes: buildMobi("compressed", 0, 17480), name: "huff.mobi" }, "azw"))
      .rejects.toThrow(/HUFF\/CDIC/);
  });

  it("rejects corrupt MOBI rather than emitting AZW bytes", async () => {
    await expect(convertFile({ bytes: encode("not a Palm database"), name: "bad.mobi" }, "azw"))
      .rejects.toThrow(/MOBI/);
  });
});
