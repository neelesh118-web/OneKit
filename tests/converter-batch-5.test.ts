// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, type TargetFormat } from "../src/core/converter/matrix";
import { abwToHtml, oebToHtml, pmlToHtml } from "../src/core/converter/markup";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = new TextDecoder();
const imageOptions: ConvertOptions = {
  canvas: {
    canvasFactory: () => ({
      width: 1, height: 1,
      getContext: () => ({
        translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
        getImageData: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4), colorSpace: "srgb" }) as ImageData
      }),
      toBlob: (callback: (blob: Blob | null) => void, mime?: string) => callback(new Blob([new Uint8Array([1])], { type: mime ?? "application/octet-stream" }))
    }) as unknown as HTMLCanvasElement,
    decode: async () => ({ width: 1, height: 1, close(): void {} }) as unknown as ImageBitmap
  }
};
const fixtures = {
  abw: enc(`<?xml version="1.0"?><abiword><section><p style="Heading 1">Open Formats</p><p>Local conversion preserves readable content.</p></section></abiword>`),
  oeb: enc(`<?xml version="1.0"?><oeb><body><title>Open Formats</title><p>Local conversion preserves readable content.</p></body></oeb>`),
  pml: enc(String.raw`\x Open Formats

Local conversion preserves readable content.\p\bVerified output\b remains portable.`)
} as const;

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

describe("converter batch 5 - ABW, OEB and PML", () => {
  for (const source of ["abw", "oeb", "pml"] as const) {
    it(`detects ${source} by its open document extension`, () => {
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
          expect(dec.decode(result.bytes)).toContain("Open Formats");
          expect(dec.decode(result.bytes)).toContain("Local conversion");
        }
      });
    }
  }

  it("preserves each format's structural markup", () => {
    expect(abwToHtml(dec.decode(fixtures.abw))).toContain("<h2>Open Formats</h2>");
    expect(oebToHtml(dec.decode(fixtures.oeb))).toContain("<h1>Open Formats</h1>");
    expect(pmlToHtml(dec.decode(fixtures.pml))).toContain("<strong>Verified output</strong>");
  });

  it("rejects mislabeled or content-free inputs honestly", async () => {
    await expect(convertFile({ bytes: enc("plain text"), name: "bad.abw" }, "pdf")).rejects.toThrow(/not a valid/);
    await expect(convertFile({ bytes: enc("<package><manifest/></package>"), name: "bad.oeb" }, "pdf")).rejects.toThrow(/no embedded/);
    await expect(convertFile({ bytes: enc("plain text"), name: "bad.pml" }, "pdf")).rejects.toThrow(/no recognizable/);
  });
});
