// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return { canvas: { canvasFactory: () => ({ width: 1, height: 1, getContext: () => context,
    toBlob(callback: (blob: Blob | null) => void): void { callback(new Blob([new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])], { type: "image/webp" })); }
  }) as unknown as HTMLCanvasElement, decode: async (blob) => { const svg = await blob.text(); return { width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1), height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1), close(): void {} } as unknown as ImageBitmap; } } };
}

describe("round 2: ABW SVG and WebP", () => {
  it("advertises ranks 2803 and 2804", () => expect(targetsFor("abw")).toEqual(expect.arrayContaining(["image-svg", "image-webp"])));
  it.each([["image-svg", "svg", "image/svg+xml", "<svg"], ["image-webp", "webp", "image/webp", "RIFF"]] as const)("converts ABW to %s", async (target, ext, mime, signature) => {
    const bytes = encode('<?xml version="1.0"?><abiword><section><p style="Normal">Readable AbiWord prose.</p></section></abiword>');
    const result = await convertFile({ bytes, name: "document.abw" }, target, canvasOptions());
    expect(result.name).toBe(`document.${ext}`); expect(result.mime).toBe(mime); expect(new TextDecoder().decode(result.bytes.slice(0, 120))).toContain(signature);
  });
  it("rejects invalid ABW", async () => {
    await expect(convertFile({ bytes: encode("<not-abiword/>"), name: "bad.abw" }, "image-svg", canvasOptions())).rejects.toThrow(/not a valid AbiWord/);
  });
  it("rejects ABW without readable prose", async () => {
    await expect(convertFile({ bytes: encode("<abiword><section/></abiword>"), name: "empty.abw" }, "image-webp", canvasOptions())).rejects.toThrow(/no readable document text/);
  });
});
