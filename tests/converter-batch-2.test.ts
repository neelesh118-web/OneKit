// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, type TargetFormat } from "../src/core/converter/matrix";
import { buildPptx } from "../src/core/converter/pptx";

const dec = new TextDecoder();
const imageOptions: ConvertOptions = {
  canvas: {
    canvasFactory: () => ({
      width: 1, height: 1,
      getContext: () => ({ translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} }),
      toBlob: (callback: (blob: Blob | null) => void, mime?: string) => callback(new Blob([new Uint8Array([1])], { type: mime ?? "application/octet-stream" }))
    }) as unknown as HTMLCanvasElement,
    decode: async () => ({ width: 1, height: 1, close(): void {} }) as unknown as ImageBitmap
  }
};
const deck = buildPptx([
  { title: "Roadmap", lines: ["Ship converters", "Verify every output"] },
  { title: "Results", lines: ["All processing remains local"] }
]);

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

describe("converter batch 2 - OOXML presentation variants", () => {
  for (const source of ["pptm", "potx", "ppsx"] as const) {
    it(`detects ${source} without collapsing it to pptx`, () => {
      expect(detectFile(deck, `roadmap.${source}`).type).toBe(source);
    });

    for (const target of MATRIX[source]) {
      it(`${source} -> ${target} produces a real output`, async () => {
        const result = await convertFile(
          { bytes: deck, name: `roadmap.${source}` }, target,
          target.startsWith("image-") ? imageOptions : {}
        );
        assertOutput(target, result.bytes);
        if (["html", "markdown", "text"].includes(target)) {
          expect(dec.decode(result.bytes)).toContain("Roadmap");
          expect(dec.decode(result.bytes)).toContain("Ship converters");
        }
      });
    }
  }

  it("rejects corrupt presentation variants honestly", async () => {
    const garbage = new TextEncoder().encode("not an OOXML presentation");
    for (const source of ["pptm", "potx", "ppsx"] as const) {
      await expect(convertFile({ bytes: garbage, name: `bad.${source}` }, "pdf")).rejects.toThrow(
        /corrupt|password-protected/
      );
    }
  });
});
