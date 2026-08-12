// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildAzw(html: string, encryption = 0): Uint8Array {
  const body = encode(html);
  const record0 = new Uint8Array(248);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, 1, false); recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false); recordView.setUint16(10, 4096, false);
  recordView.setUint16(12, encryption, false); record0.set(encode("MOBI"), 16);
  recordView.setUint32(20, 232, false); recordView.setUint32(24, 2, false); recordView.setUint32(28, 65001, false);
  const headerSize = 94;
  const out = new Uint8Array(headerSize + record0.length + body.length);
  const view = new DataView(out.buffer);
  out.set(encode("OneKitBook"), 0); out.set(encode("BOOKMOBI"), 60);
  view.setUint16(76, 2, false); view.setUint32(78, headerSize, false); view.setUint32(86, headerSize + record0.length, false);
  out.set(record0, headerSize); out.set(body, headerSize + record0.length);
  return out;
}

describe("round 2: AZW to FB2", () => {
  it("advertises demand rank 2514", () => expect(targetsFor("azw")).toContain("fb2"));

  it("converts readable AZW into structured FictionBook XML", async () => {
    const source = buildAzw("<html><body><h1>Local Book</h1><p>A &amp; B read locally.</p><p>Second paragraph.</p></body></html>");
    const result = await convertFile({ bytes: source, name: "book.azw" }, "fb2");
    const xml = new TextDecoder().decode(result.bytes);
    expect(result.name).toBe("book.fb2");
    expect(result.mime).toBe("application/x-fictionbook+xml");
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain("<FictionBook");
    expect(xml).toContain("<book-title>Book</book-title>");
    expect(xml).toContain("A &amp; B read locally.");
    expect(xml).toContain("Second paragraph.");
  });

  it("rejects corrupt AZW rather than emitting an FB2 shell", async () => {
    await expect(convertFile({ bytes: encode("not an ebook"), name: "bad.azw" }, "fb2")).rejects.toThrow(/MOBI/);
  });

  it("rejects DRM-protected AZW", async () => {
    await expect(convertFile({ bytes: buildAzw("<html><body>Protected</body></html>", 1), name: "protected.azw" }, "fb2")).rejects.toThrow(/DRM-protected/);
  });
});
