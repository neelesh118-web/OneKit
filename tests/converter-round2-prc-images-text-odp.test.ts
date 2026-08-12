// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function buildPrc(html: string): Uint8Array {
  const body = encode(html), record = new Uint8Array(32), rv = new DataView(record.buffer), headerSize = 94;
  rv.setUint16(0, 1, false); rv.setUint32(4, body.length, false); rv.setUint16(8, 1, false);
  record.set(encode("MOBI"), 16); rv.setUint32(20, 16, false); rv.setUint32(28, 65001, false);
  const out = new Uint8Array(headerSize + record.length + body.length), view = new DataView(out.buffer);
  out.set(encode("OneKitBook")); out.set(encode("BOOKMOBI"), 60); view.setUint16(76, 2, false);
  view.setUint32(78, headerSize, false); view.setUint32(86, headerSize + record.length, false);
  out.set(record, headerSize); out.set(body, headerSize + record.length); return out;
}

function canvasOptions(): ConvertOptions {
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {} };
  return { canvas: { canvasFactory: () => ({ width: 1, height: 1, getContext: () => context,
    toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
      const bytes = mime === "image/jpeg" ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      callback(new Blob([bytes], { type: mime ?? "image/png" }));
    }
  }) as unknown as HTMLCanvasElement, decode: async () => ({ width: 10, height: 10, close(): void {} }) as unknown as ImageBitmap } };
}

describe("round 2: PRC raster images and TXT to ODP", () => {
  it("advertises all three demand-ranked pairs", () => {
    expect(targetsFor("prc")).toEqual(expect.arrayContaining(["image-png", "image-jpeg"]));
    expect(targetsFor("text")).toContain("odp");
  });

  it.each([
    ["image-png", "png", "image/png", [0x89, 0x50, 0x4e, 0x47]],
    ["image-jpeg", "jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]]
  ] as const)("converts validated PRC text to %s", async (target, extension, mime, signature) => {
    const result = await convertFile({ bytes: buildPrc("<h1>Local PRC</h1><p>Readable chapter.</p>"), name: "book.prc" }, target, canvasOptions());
    expect(result).toMatchObject({ name: `book.${extension}`, mime });
    expect(Array.from(result.bytes.slice(0, 4))).toEqual(signature);
  });

  it("writes TXT as a standards-compliant ODP with readable slide text", async () => {
    const result = await convertFile({ bytes: encode("Quarterly report\nRevenue grew locally."), name: "notes.txt" }, "odp");
    expect(result).toMatchObject({ name: "notes.odp", mime: "application/vnd.oasis.opendocument.presentation" });
    const files = unzipSync(result.bytes);
    expect(strFromU8(files.mimetype!)).toBe("application/vnd.oasis.opendocument.presentation");
    const content = strFromU8(files["content.xml"]!);
    expect(content).toContain("Quarterly report"); expect(content).toContain("Revenue grew locally.");
  });

  it("rejects corrupt PRC and empty TXT", async () => {
    await expect(convertFile({ bytes: encode("bad"), name: "bad.prc" }, "image-png", canvasOptions())).rejects.toThrow(/MOBI/);
    await expect(convertFile({ bytes: encode(" \n"), name: "empty.txt" }, "odp")).rejects.toThrow(/no readable text/i);
  });
});
