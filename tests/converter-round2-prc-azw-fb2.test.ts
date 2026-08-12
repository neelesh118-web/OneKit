// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildBookPrc(html: string, encryption = 0): Uint8Array {
  const body = encode(html);
  const record0 = new Uint8Array(248);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, 1, false);
  recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false);
  recordView.setUint16(10, 4096, false);
  recordView.setUint16(12, encryption, false);
  record0.set(encode("MOBI"), 16);
  recordView.setUint32(20, 232, false);
  recordView.setUint32(24, 2, false);
  recordView.setUint32(28, 65001, false);
  const headerSize = 94;
  const out = new Uint8Array(headerSize + record0.length + body.length);
  const view = new DataView(out.buffer);
  out.set(encode("OneKitBook"), 0);
  out.set(encode("BOOKMOBI"), 60);
  view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false);
  view.setUint32(86, headerSize + record0.length, false);
  out.set(record0, headerSize);
  out.set(body, headerSize + record0.length);
  return out;
}

describe("round 2: PRC ebook outputs", () => {
  it("advertises the demand-ranked AZW and FB2 targets", () => {
    expect(targetsFor("prc")).toEqual(expect.arrayContaining(["azw", "fb2"]));
  });

  it("validates and preserves a classic BOOKMOBI PRC as AZW1", async () => {
    const input = buildBookPrc("<html><body><h1>Local book</h1><p>Readable chapter.</p></body></html>");
    const result = await convertFile({ bytes: input, name: "book.prc" }, "azw");
    expect(result.name).toBe("book.azw");
    expect(result.mime).toBe("application/vnd.amazon.ebook");
    expect(result.bytes).not.toBe(input);
    expect(result.bytes).toEqual(input);
    expect(new TextDecoder().decode(result.bytes.slice(60, 68))).toBe("BOOKMOBI");
  });

  it("rebuilds readable PRC content as structured FictionBook XML", async () => {
    const result = await convertFile({
      bytes: buildBookPrc("<html><body><h1>Local book</h1><p>A &amp; B.</p></body></html>"),
      name: "book.prc"
    }, "fb2");
    const xml = new TextDecoder().decode(result.bytes);
    expect(result.name).toBe("book.fb2");
    expect(result.mime).toBe("application/x-fictionbook+xml");
    expect(xml).toContain("<FictionBook");
    expect(xml).toContain("A &amp; B.");
  });

  it("rejects generic/corrupt and DRM-protected PRCs", async () => {
    for (const target of ["azw", "fb2"] as const) {
      await expect(convertFile({ bytes: encode("generic Palm data"), name: "bad.prc" }, target)).rejects.toThrow(/MOBI/);
      await expect(convertFile({ bytes: buildBookPrc("<html>Locked</html>", 1), name: "locked.prc" }, target)).rejects.toThrow(/DRM-protected/);
    }
  });
});
