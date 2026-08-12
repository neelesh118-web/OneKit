// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zlibSync } from "fflate/browser";
import { imageToHtml, imageToMarkdown, imagesToDocx, wrapImageAsHtml, wrapImageAsMarkdown } from "../src/core/converter/documents";
import { imagesToPptx } from "../src/core/converter/pptx";
import { imagesToOdt } from "../src/core/converter/odf";
import { imageToRtf, imageToRtfDocument } from "../src/core/converter/rtf";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encoder = new TextEncoder();

/** CRC-32 (PNG chunk checksums), table-based — fflate doesn't export one. */
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a small real RGB PNG (signature + IHDR + IDAT + IEND). */
function tinyPng(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length, false);
    out.set(encoder.encode(type), 4);
    out.set(body, 8);
    new DataView(out.buffer).setUint32(8 + body.length, crc32(new Uint8Array([...encoder.encode(type), ...body])), false);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width, false);
  new DataView(ihdr.buffer).setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", zlibSync(raw)),
    ...chunk("IEND", new Uint8Array(0))
  ]);
}

describe("images → DOCX (real embedded pictures)", () => {
  it("embeds a real PNG picture in a valid DOCX package", async () => {
    const docx = await imagesToDocx([{ bytes: tinyPng(20, 10, 200, 40, 40), name: "photo.png" }]);
    const files = unzipSync(docx);
    expect(Object.keys(files)).toContain("word/media/image1.png");
    expect(Object.keys(files)).toContain("word/document.xml");
    expect(Object.keys(files)).toContain("word/_rels/document.xml.rels");
    // The embedded bytes are the real PNG, byte for byte.
    expect(Array.from(files["word/media/image1.png"]!)).toEqual(Array.from(tinyPng(20, 10, 200, 40, 40)));
    const doc = strFromU8(files["word/document.xml"]!);
    expect(doc).toContain("<w:drawing>");
    expect(doc).toContain('r:embed="rId1"');
    const rels = strFromU8(files["word/_rels/document.xml.rels"]!);
    expect(rels).toContain('Target="media/image1.png"');
    const contentTypes = strFromU8(files["[Content_Types].xml"]!);
    expect(contentTypes).toContain('Extension="png" ContentType="image/png"');
  });

  it("packs multiple images with a page break between them", async () => {
    const docx = await imagesToDocx([
      { bytes: tinyPng(4, 4, 255, 0, 0), name: "a.png" },
      { bytes: tinyPng(4, 4, 0, 255, 0), name: "b.png" }
    ]);
    const files = unzipSync(docx);
    expect(Object.keys(files)).toContain("word/media/image1.png");
    expect(Object.keys(files)).toContain("word/media/image2.png");
    const doc = strFromU8(files["word/document.xml"]!);
    expect(doc).toContain('w:type="page"');
    expect((doc.match(/<w:drawing>/g) ?? []).length).toBe(2);
  });

  it("scales a large image down to fit the page without upscaling", async () => {
    const docx = await imagesToDocx([{ bytes: tinyPng(3000, 100, 1, 2, 3), name: "wide.png" }]);
    const doc = strFromU8(unzipSync(docx)["word/document.xml"]!);
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(doc)![1]);
    expect(cx).toBeLessThanOrEqual(5731510); // the content-area width
  });

  it("re-encodes non-PNG/JPEG sources through the injectable rasterizer", async () => {
    const docx = await imagesToDocx([{ bytes: encoder.encode("fake webp"), name: "x.webp" }], {
      rasterize: async () => tinyPng(2, 2, 9, 9, 9)
    });
    expect(Object.keys(unzipSync(docx))).toContain("word/media/image1.png");
  });

  it("rejects an empty batch", async () => {
    await expect(imagesToDocx([])).rejects.toThrow(/at least one image/);
  });

  it("surfaces embedding failures honestly", async () => {
    await expect(
      imagesToDocx([{ bytes: encoder.encode("junk"), name: "y.png" }], {
        rasterize: async () => encoder.encode("still not an image")
      })
    ).rejects.toThrow(/Couldn't embed/);
  });
});

describe("images → PPTX (real embedded pictures)", () => {
  it("embeds a real PNG picture in a valid PPTX package", async () => {
    const pptx = await imagesToPptx([{ bytes: tinyPng(16, 8, 10, 20, 30), name: "shot.png" }]);
    const files = unzipSync(pptx);
    expect(Object.keys(files)).toContain("ppt/media/image1.png");
    expect(Object.keys(files)).toContain("ppt/slides/slide1.xml");
    expect(Array.from(files["ppt/media/image1.png"]!)).toEqual(Array.from(tinyPng(16, 8, 10, 20, 30)));
    const slide = strFromU8(files["ppt/slides/slide1.xml"]!);
    expect(slide).toContain("<p:pic>");
    expect(slide).toContain('r:embed="rId2"');
    const rels = strFromU8(files["ppt/slides/_rels/slide1.xml.rels"]!);
    expect(rels).toContain('Target="../media/image1.png"');
  });

  it("makes one slide per image", async () => {
    const pptx = await imagesToPptx([
      { bytes: tinyPng(4, 4, 1, 1, 1), name: "a.png" },
      { bytes: tinyPng(4, 4, 2, 2, 2), name: "b.png" },
      { bytes: tinyPng(4, 4, 3, 3, 3), name: "c.png" }
    ]);
    const files = unzipSync(pptx);
    expect(Object.keys(files)).toContain("ppt/slides/slide1.xml");
    expect(Object.keys(files)).toContain("ppt/slides/slide2.xml");
    expect(Object.keys(files)).toContain("ppt/slides/slide3.xml");
    expect(Object.keys(files)).toContain("ppt/media/image3.png");
  });

  it("rejects an empty batch", async () => {
    await expect(imagesToPptx([])).rejects.toThrow(/at least one image/);
  });

  it("surfaces embedding failures honestly", async () => {
    await expect(
      imagesToPptx([{ bytes: encoder.encode("junk"), name: "y.png" }], {
        rasterize: async () => encoder.encode("still not an image")
      })
    ).rejects.toThrow(/Couldn't embed/);
  });
});

describe("converter matrix — image sources gained docx/pptx/html/markdown/odt/rtf targets", () => {
  it("lists docx, pptx, html, markdown, odt and rtf for every raster image source", () => {
    for (const source of [
      "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif",
      "image-svg", "image-tiff", "image-ico", "image-dds", "image-tga", "image-ppm",
      "image-psd", "image-icns",
      "raw-cr2", "raw-nef", "raw-arw", "raw-dng"
    ] as const) {
      const targets = targetsFor(source);
      expect(targets).toContain("docx");
      expect(targets).toContain("pptx");
      expect(targets).toContain("html");
      expect(targets).toContain("markdown");
      expect(targets).toContain("odt");
      expect(targets).toContain("rtf");
    }
  });

  it("offers TIFF → TIFF as a real re-encode (through the canvas pipeline), not filtered out like the other single-purpose raster containers", () => {
    expect(targetsFor("image-tiff")).toContain("image-tiff");
  });
});

describe("images → HTML (real embedded picture, self-contained page)", () => {
  it("embeds a real PNG as a data: URI in a valid HTML page", async () => {
    const png = tinyPng(4, 4, 10, 20, 30);
    const html = new TextDecoder().decode(await imageToHtml({ bytes: png, name: "photo.png" }));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<img src=\"data:image/png;base64,");
    // The embedded payload decodes back to the exact same PNG bytes.
    const b64 = /base64,([^"]+)"/.exec(html)![1]!;
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(png));
  });

  it("re-encodes non-PNG/JPEG sources through the injectable rasterizer", async () => {
    const html = new TextDecoder().decode(
      await imageToHtml(
        { bytes: encoder.encode("fake webp"), name: "x.webp" },
        { rasterize: async () => tinyPng(2, 2, 1, 1, 1) }
      )
    );
    expect(html).toContain("data:image/png;base64,");
  });

  it("surfaces embedding failures honestly", async () => {
    await expect(
      imageToHtml(
        { bytes: encoder.encode("junk"), name: "y.png" },
        { rasterize: async () => encoder.encode("still not an image") }
      )
    ).rejects.toThrow(/Couldn't embed/);
  });

  it("wraps arbitrary already-encoded bytes at a given MIME type (used for SVG passthrough)", () => {
    const svg = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    const html = new TextDecoder().decode(wrapImageAsHtml(svg, "image/svg+xml", "vector.svg"));
    expect(html).toContain("data:image/svg+xml;base64,");
    const b64 = /base64,([^"]+)"/.exec(html)![1]!;
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(decoded)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
  });

  it("converts a real SVG through convertFile into a self-contained HTML page", async () => {
    const svg = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    const result = await convertFile({ bytes: svg, name: "vector.svg" }, "html");
    expect(result.name).toBe("vector.html");
    expect(new TextDecoder().decode(result.bytes)).toContain("data:image/svg+xml;base64,");
  });

  it("converts a real PNG through convertFile into a self-contained HTML page", async () => {
    const png = tinyPng(4, 4, 5, 6, 7);
    const result = await convertFile({ bytes: png, name: "photo.png" }, "html");
    expect(result.name).toBe("photo.html");
    expect(new TextDecoder().decode(result.bytes)).toContain("data:image/png;base64,");
  });
});

describe("images → text (OCR via the bundled tesseract.js engine)", () => {
  it("runs OCR on a real PNG through convertFile with an injected engine", async () => {
    const png = tinyPng(6, 6, 1, 2, 3);
    const result = await convertFile(
      { bytes: png, name: "receipt.png" },
      "text",
      { ocr: { recognize: async (dataUrl) => (dataUrl.startsWith("data:image/png;base64,") ? "Total: $12.34" : "") } }
    );
    expect(result.name).toBe("receipt.txt");
    expect(new TextDecoder().decode(result.bytes)).toBe("Total: $12.34");
  });

  it("runs OCR on a camera RAW's embedded JPEG preview — no canvas needed", async () => {
    const preview = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);
    const tiffHeader = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0]);
    const raw = new Uint8Array([...tiffHeader, ...new Uint8Array(20), ...preview]);
    const result = await convertFile(
      { bytes: raw, name: "shot.cr2" },
      "text",
      { ocr: { recognize: async (dataUrl) => (dataUrl.startsWith("data:image/jpeg;base64,") ? "hello raw" : "") } }
    );
    expect(new TextDecoder().decode(result.bytes)).toBe("hello raw");
  });

  it("gives an honest error when no OCR engine is available (e.g. outside the extension runtime)", async () => {
    const png = tinyPng(3, 3, 9, 9, 9);
    await expect(convertFile({ bytes: png, name: "x.png" }, "text")).rejects.toThrow(
      /OCR needs the extension runtime/
    );
  });

  it("still returns raw SVG markup (not OCR) for svg → text — unchanged existing behaviour", async () => {
    const svg = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text></svg>');
    const result = await convertFile({ bytes: svg, name: "vector.svg" }, "text");
    expect(new TextDecoder().decode(result.bytes)).toContain("<svg");
  });

  it("lists text as a target for OCR-capable raster sources but not for SVG's own markup-text special case", () => {
    for (const source of ["image-png", "image-jpeg", "image-tiff", "image-icns", "raw-nef"] as const) {
      expect(targetsFor(source)).toContain("text");
    }
  });
});

describe("images → Markdown (real embedded picture, data: URI)", () => {
  it("embeds a real PNG as a data: URI markdown image reference", async () => {
    const png = tinyPng(4, 4, 11, 22, 33);
    const md = new TextDecoder().decode(await imageToMarkdown({ bytes: png, name: "photo.png" }));
    expect(md).toMatch(/^!\[photo\.png\]\(data:image\/png;base64,/);
    const b64 = /base64,([^)]+)\)/.exec(md)![1]!;
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(png));
  });

  it("strips brackets from the alt text so the markdown stays well-formed", () => {
    const svg = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const md = new TextDecoder().decode(wrapImageAsMarkdown(svg, "image/svg+xml", "a [weird] name.svg"));
    expect(md).toContain("![a weird name.svg]");
  });

  it("surfaces embedding failures honestly", async () => {
    await expect(
      imageToMarkdown(
        { bytes: encoder.encode("junk"), name: "y.png" },
        { rasterize: async () => encoder.encode("still not an image") }
      )
    ).rejects.toThrow(/Couldn't embed/);
  });

  it("converts a real PNG through convertFile into markdown", async () => {
    const result = await convertFile({ bytes: tinyPng(4, 4, 1, 2, 3), name: "photo.png" }, "markdown");
    expect(result.name).toBe("photo.md");
    expect(new TextDecoder().decode(result.bytes)).toContain("data:image/png;base64,");
  });
});

describe("images → ODT (real embedded pictures)", () => {
  it("embeds a real PNG picture in a valid ODT package", async () => {
    const odt = await imagesToOdt([{ bytes: tinyPng(20, 10, 200, 40, 40), name: "photo.png" }]);
    const files = unzipSync(odt);
    expect(Object.keys(files)).toContain("Pictures/image1.png");
    expect(Array.from(files["Pictures/image1.png"]!)).toEqual(Array.from(tinyPng(20, 10, 200, 40, 40)));
    const content = strFromU8(files["content.xml"]!);
    expect(content).toContain("<draw:frame");
    expect(content).toContain('xlink:href="Pictures/image1.png"');
    const manifest = strFromU8(files["META-INF/manifest.xml"]!);
    expect(manifest).toContain('manifest:full-path="Pictures/image1.png"');
    expect(manifest).toContain('manifest:media-type="image/png"');
  });

  it("packs multiple images, one draw:frame each", async () => {
    const odt = await imagesToOdt([
      { bytes: tinyPng(4, 4, 1, 1, 1), name: "a.png" },
      { bytes: tinyPng(4, 4, 2, 2, 2), name: "b.png" }
    ]);
    const files = unzipSync(odt);
    expect(Object.keys(files)).toContain("Pictures/image1.png");
    expect(Object.keys(files)).toContain("Pictures/image2.png");
    const content = strFromU8(files["content.xml"]!);
    expect((content.match(/<draw:frame/g) ?? []).length).toBe(2);
  });

  it("rejects an empty batch", async () => {
    await expect(imagesToOdt([])).rejects.toThrow(/at least one image/);
  });

  it("converts a real PNG through convertFile into an ODT", async () => {
    const result = await convertFile({ bytes: tinyPng(6, 6, 4, 5, 6), name: "photo.png" }, "odt");
    expect(result.name).toBe("photo.odt");
    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toContain("Pictures/image1.png");
  });
});

describe("images → RTF (real embedded \\pict)", () => {
  it("hex-encodes a PNG into a valid RTF \\pngblip picture", () => {
    const png = tinyPng(4, 4, 5, 6, 7);
    const rtf = imageToRtf(png, "image/png", 4, 4);
    expect(rtf).toContain("{\\rtf1");
    expect(rtf).toContain("\\pict\\pngblip");
    // The hex payload decodes back to the exact same PNG bytes.
    const hexMatch = /\\pichgoal\d+\n([0-9a-f]+)\}/.exec(rtf)!;
    const hex = hexMatch[1]!;
    const decoded = new Uint8Array(hex.length / 2);
    for (let i = 0; i < decoded.length; i++) decoded[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    expect(Array.from(decoded)).toEqual(Array.from(png));
  });

  it("uses jpegblip for JPEG sources", () => {
    const rtf = imageToRtf(new Uint8Array([1, 2, 3]), "image/jpeg", 10, 10);
    expect(rtf).toContain("\\jpegblip");
  });

  it("rasterizes non-PNG/JPEG sources before wrapping (imageToRtfDocument)", async () => {
    const rtf = await imageToRtfDocument(
      { bytes: encoder.encode("fake webp"), name: "x.webp" },
      { rasterize: async () => tinyPng(2, 2, 1, 1, 1) }
    );
    expect(rtf).toContain("\\pngblip");
  });

  it("converts a real PNG through convertFile into RTF", async () => {
    const result = await convertFile({ bytes: tinyPng(4, 4, 9, 9, 9), name: "photo.png" }, "rtf");
    expect(result.name).toBe("photo.rtf");
    expect(new TextDecoder().decode(result.bytes)).toContain("\\pngblip");
  });
});

describe("converter dispatch — image → DOCX/PPTX end to end", () => {
  it("converts a real PNG through convertFile into a DOCX", async () => {
    const result = await convertFile({ bytes: tinyPng(10, 10, 50, 60, 70), name: "photo.png" }, "docx");
    expect(result.name).toBe("photo.docx");
    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toContain("word/media/image1.png");
  });

  it("converts a real PNG through convertFile into a PPTX", async () => {
    const result = await convertFile({ bytes: tinyPng(10, 10, 50, 60, 70), name: "photo.png" }, "pptx");
    expect(result.name).toBe("photo.pptx");
    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toContain("ppt/media/image1.png");
  });

  it("rasterizes an SVG to PNG before embedding it in a DOCX", async () => {
    const svg = encoder.encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>'
    );
    await expect(convertFile({ bytes: svg, name: "vector.svg" }, "docx")).rejects.toThrow(
      /Could not decode this image/i
    );
  });
});
