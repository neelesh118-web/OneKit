// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, type TargetFormat } from "../src/core/converter/matrix";
import { htmlzToHtml, txtzToHtml } from "../src/core/converter/ebooks";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = new TextDecoder();
const htmlz = zipSync({
  "book/index.html": enc("<!doctype html><html><body><h1>Local Book</h1><p>Chapter content stays private.</p></body></html>"),
  "book/style.css": enc("body { font-family: serif; }")
});
const txtz = zipSync({
  "01-intro.txt": enc("Local Book\n\nChapter content stays private."),
  "02-next.txt": enc("Second chapter\n\nEvery output is verified.")
});

function assertOutput(target: TargetFormat, bytes: Uint8Array): void {
  expect(bytes.length, `${target} output must not be empty`).toBeGreaterThan(0);
  if (target === "pdf") expect(dec.decode(bytes.subarray(0, 5))).toBe("%PDF-");
  if (["docx", "epub", "odt", "pptx"].includes(target)) {
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(Object.keys(unzipSync(bytes)).length).toBeGreaterThan(1);
  }
  if (target === "rtf") expect(dec.decode(bytes.subarray(0, 5))).toBe("{\\rtf");
}

describe("converter batch 4 - HTMLZ and TXTZ ebooks", () => {
  const fixtures = { htmlz, txtz } as const;
  for (const source of ["htmlz", "txtz"] as const) {
    it(`detects ${source} without collapsing it to zip`, () => {
      expect(detectFile(fixtures[source], `book.${source}`).type).toBe(source);
    });
    for (const target of MATRIX[source]) {
      it(`${source} -> ${target} produces a real output`, async () => {
        const result = await convertFile({ bytes: fixtures[source], name: `book.${source}` }, target);
        assertOutput(target, result.bytes);
        if (["html", "markdown", "text"].includes(target)) {
          expect(dec.decode(result.bytes)).toContain("Local Book");
          expect(dec.decode(result.bytes)).toContain("Chapter content stays private");
        }
      });
    }
  }

  it("selects HTMLZ content and joins TXTZ chapters in order", () => {
    expect(htmlzToHtml(htmlz)).toContain("<h1>Local Book</h1>");
    const html = txtzToHtml(txtz);
    expect(html.indexOf("01-intro.txt")).toBeLessThan(html.indexOf("02-next.txt"));
    expect(html).toContain("Every output is verified");
  });

  it("rejects archives without readable book content", async () => {
    const empty = zipSync({ "cover.bin": new Uint8Array([0, 1, 2]) });
    await expect(convertFile({ bytes: empty, name: "bad.htmlz" }, "pdf")).rejects.toThrow(/no HTML/);
    await expect(convertFile({ bytes: empty, name: "bad.txtz" }, "pdf")).rejects.toThrow(/no text/);
  });
});
