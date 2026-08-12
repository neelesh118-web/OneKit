// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { htmlToOdt } from "../src/core/converter/documents";
import { textToRtf } from "../src/core/converter/rtf";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return {
    canvas: {
      canvasFactory: () => ({
        width: 1, height: 1,
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/jpeg"
            ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])
            : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
          callback(new Blob([bytes], { type: mime ?? "application/octet-stream" }));
        }
      }) as unknown as HTMLCanvasElement,
      decode: async (blob) => {
        const svg = await blob.text();
        return {
          width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1),
          height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1),
          close(): void {}
        } as unknown as ImageBitmap;
      }
    }
  };
}

function makeOdp(): Uint8Array {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:presentation><draw:page draw:name="page1"><text:h>Quarterly deck</text:h><text:p>Readable local slide.</text:p></draw:page></office:presentation></office:body>
</office:document-content>`;
  return zipSync({
    mimetype: [strToU8("application/vnd.oasis.opendocument.presentation"), { level: 0 }],
    "content.xml": strToU8(content)
  });
}

describe("round 2 batch 14: ODP, ODT, and RTF raster outputs", () => {
  it("advertises all six demand-ranked pairs and the matrix milestone", () => {
    for (const source of ["odp", "odt", "rtf"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    }
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1320);
  });

  const sources = [
    ["odp", makeOdp(), "deck.odp"],
    ["odt", htmlToOdt("<h1>Quarterly document</h1><p>Readable ODT content.</p>"), "report.odt"],
    ["rtf", new TextEncoder().encode(textToRtf("Quarterly memo\nReadable RTF content.")), "memo.rtf"]
  ] as const;
  const targets = [
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const;

  for (const [source, bytes, name] of sources) {
    for (const [target, extension, mime, signature] of targets) {
      it(`${source} converts to ${target} with real signature and metadata`, async () => {
        const result = await convertFile({ bytes, name }, target, canvasOptions());
        expect(result.name).toBe(`${name.replace(/\.[^.]+$/, "")}.${extension}`);
        expect(result.mime).toBe(mime);
        expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
      });
    }
  }

  it("rejects malformed ODP/ODT instead of emitting image shells", async () => {
    const corruptZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertFile({ bytes: corruptZip, name: "bad.odp" }, "image-png", canvasOptions())).rejects.toThrow(/odp|OpenDocument|ZIP/i);
    await expect(convertFile({ bytes: corruptZip, name: "bad.odt" }, "image-png", canvasOptions())).rejects.toThrow(/odt|OpenDocument|ZIP/i);
  });
});
