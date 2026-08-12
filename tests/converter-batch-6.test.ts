// @vitest-environment node
import { describe, expect, it } from "vitest";
import { gzipSync, unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, type TargetFormat } from "../src/core/converter/matrix";
import { zabwToHtml } from "../src/core/converter/markup";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = new TextDecoder();
const imageOptions: ConvertOptions = {
  canvas: {
    canvasFactory: () => ({
      width: 1, height: 1,
      getContext: () => ({
        translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
        getImageData: () => ({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]), colorSpace: "srgb" }) as ImageData
      }),
      toBlob: (callback: (blob: Blob | null) => void, mime?: string) => callback(new Blob([new Uint8Array([1])], { type: mime ?? "application/octet-stream" }))
    }) as unknown as HTMLCanvasElement,
    decode: async () => ({ width: 1, height: 1, close(): void {} }) as unknown as ImageBitmap
  }
};

function buildPalmBook(html: string): Uint8Array {
  const body = enc(html);
  const record0 = new Uint8Array(248);
  const recordView = new DataView(record0.buffer);
  recordView.setUint16(0, 1, false); // uncompressed PalmDOC
  recordView.setUint32(4, body.length, false);
  recordView.setUint16(8, 1, false);
  recordView.setUint16(10, 4096, false);
  record0.set(enc("MOBI"), 16);
  recordView.setUint32(20, 232, false);
  recordView.setUint32(24, 2, false);
  recordView.setUint32(28, 65001, false);
  const headerSize = 94;
  const out = new Uint8Array(headerSize + record0.length + body.length);
  const view = new DataView(out.buffer);
  out.set(enc("OneKitBook"), 0);
  out.set(enc("BOOKMOBI"), 60);
  view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false);
  view.setUint32(86, headerSize + record0.length, false);
  out.set(record0, headerSize);
  out.set(body, headerSize + record0.length);
  return out;
}

const palm = buildPalmBook("<html><body><h1>Palm Book</h1><p>Readable local ebook content.</p></body></html>");
const abwXml = `<?xml version="1.0"?><abiword><section><p style="Heading 1">Compressed Document</p><p>Readable local ebook content.</p></section></abiword>`;
const zabw = gzipSync(enc(abwXml));
const fixtures = { azw: palm, prc: palm, zabw } as const;

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

describe("converter batch 6 - AZW, PRC and ZABW", () => {
  for (const source of ["azw", "prc", "zabw"] as const) {
    it(`detects ${source} without collapsing its container type`, () => {
      expect(detectFile(fixtures[source], `book.${source}`).type).toBe(source);
    });
    for (const target of MATRIX[source]) {
      it(`${source} -> ${target} produces a real output`, async () => {
        const result = await convertFile(
          { bytes: fixtures[source], name: `book.${source}` }, target,
          target.startsWith("image-") ? imageOptions : {}
        );
        assertOutput(target, result.bytes);
        if (["html", "markdown", "text"].includes(target)) {
          expect(dec.decode(result.bytes)).toContain(source === "zabw" ? "Compressed Document" : "Palm Book");
          expect(dec.decode(result.bytes)).toContain("Readable local ebook content");
        }
      });
    }
  }

  it("decompresses ZABW into real AbiWord structure", () => {
    expect(zabwToHtml(zabw)).toContain("<h2>Compressed Document</h2>");
  });

  it("rejects corrupt containers honestly", async () => {
    const garbage = enc("not a book container");
    await expect(convertFile({ bytes: garbage, name: "bad.azw" }, "pdf")).rejects.toThrow(/MOBI|Palm/);
    await expect(convertFile({ bytes: garbage, name: "bad.prc" }, "pdf")).rejects.toThrow(/MOBI|Palm/);
    await expect(convertFile({ bytes: garbage, name: "bad.zabw" }, "pdf")).rejects.toThrow(/gzip-compressed/);
  });
});
