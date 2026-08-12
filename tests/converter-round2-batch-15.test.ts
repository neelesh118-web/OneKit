// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { epubFromHtml, epubFromImages } from "../src/core/converter/documents";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

describe("round 2 batch 15: image-backed EPUB to CBZ", () => {
  it("advertises the pair and matrix milestone", () => {
    expect(targetsFor("epub")).toContain("cbz");
    expect(Object.values(MATRIX).reduce((n, targets) => n + targets.length, 0)).toBeGreaterThanOrEqual(1321);
  });

  it("extracts real images in spine order", async () => {
    const first = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
    const second = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 2]);
    const epub = epubFromImages("Comic", [{ bytes: first, name: "a.png" }, { bytes: second, name: "b.jpg" }]);
    const result = await convertFile({ bytes: epub, name: "comic.epub" }, "cbz");
    expect(result).toMatchObject({ name: "comic.cbz", mime: "application/vnd.comicbook+zip" });
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const pages = unzipSync(result.bytes);
    expect(Object.keys(pages)).toEqual(["page-001.png", "page-002.jpg"]);
    expect(pages["page-001.png"]).toEqual(first);
    expect(pages["page-002.jpg"]).toEqual(second);
  });

  it("rejects text EPUBs rather than dropping prose", async () => {
    const epub = epubFromHtml("Novel", "<h1>Chapter</h1><p>Readable prose.</p>");
    await expect(convertFile({ bytes: epub, name: "novel.epub" }, "cbz")).rejects.toThrow(/Only image-backed EPUBs/);
  });

  it("rejects corrupt EPUBs", async () => {
    await expect(convertFile({ bytes: new Uint8Array([0x50, 0x4b, 3]), name: "bad.epub" }, "cbz"))
      .rejects.toThrow(/Could not read this EPUB/);
  });
});
