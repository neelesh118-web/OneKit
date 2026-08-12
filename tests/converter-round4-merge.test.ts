// @vitest-environment node
// Architecture-native tests for the Codex round-2 merge:
// doc→raster family (textToSvg + canvas), cbz, dxf, pptx→odp
// slide preservation, TeX escaping, and OOXML MIME correctness.
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";
import {
  csvToOds,
  csvToXlsx,
  epubFromHtml,
  htmlToDocx,
  htmlToLatex,
} from "../src/core/converter/documents";
import { buildPptx } from "../src/core/converter/pptx";
import { slidesToOdp } from "../src/core/converter/odf";
import { zipSync, strFromU8, unzipSync } from "fflate/browser";
import { sameRealmU8, zipText } from "../src/core/converter/zip-realm";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Fake canvas+decode pair, matching the pattern the rest of the suite uses. */
function canvasOptions(): ConvertOptions {
  let width = 1;
  let height = 1;
  const context = {
    translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData(): ImageData {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 24; data[i + 1] = 96; data[i + 2] = 180; data[i + 3] = 255;
      }
      return { width, height, data, colorSpace: "srgb" } as ImageData;
    },
  };
  return {
    canvas: {
      canvasFactory: () => ({
        get width() { return width; }, set width(value: number) { width = value; },
        get height() { return height; }, set height(value: number) { height = value; },
        getContext: () => context,
        toBlob(callback: (blob: Blob | null) => void, mime?: string): void {
          const bytes = mime === "image/webp"
            ? new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
            : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
          callback(new Blob([bytes], { type: mime ?? "image/png" }));
        },
      }) as unknown as HTMLCanvasElement,
      decode: async (blob: Blob) => {
        const svg = await blob.text();
        return {
          width: Number(svg.match(/width="(\d+)"/)?.[1] ?? 1),
          height: Number(svg.match(/height="(\d+)"/)?.[1] ?? 1),
          close(): void {},
        } as unknown as ImageBitmap;
      },
    },
  };
}

describe("round 4: Codex merge — doc→raster family", () => {
  it("advertises the full raster set from prose and table sources", () => {
    for (const source of ["markdown", "html", "docx", "rtf", "epub", "rst", "text"] as const) {
      const targets = targetsFor(source);
      expect(targets).toContain("image-png");
      expect(targets).toContain("image-avif");
      expect(targets).toContain("image-bmp");
      expect(targets).toContain("image-psd");
      expect(targets).toContain("image-tiff");
      expect(targets).toContain("image-svg");
    }
    for (const source of ["csv", "xlsx", "xls", "ods"] as const) {
      const targets = targetsFor(source);
      expect(targets).toContain("image-png");
      expect(targets).toContain("image-avif");
      expect(targets).toContain("image-bmp");
      expect(targets).toContain("image-svg");
    }
  });

  it("renders markdown to a real SVG", async () => {
    const out = await convertFile({ name: "doc.md", bytes: enc("# Hello\n\nSome **bold** text.") }, "image-svg");
    expect(dec(out.bytes)).toContain("<svg");
    expect(out.name).toMatch(/\.svg$/);
  });

  it("renders markdown to PNG through the canvas pipeline", async () => {
    const out = await convertFile(
      { name: "doc.md", bytes: enc("# Hello\n\nSome **bold** text.") },
      "image-png",
      canvasOptions()
    );
    expect(out.bytes[0]).toBe(0x89);
    expect(out.bytes[1]).toBe(0x50);
    expect(out.mime).toBe("image/png");
  });

  it("renders a spreadsheet to SVG", async () => {
    const out = await convertFile({ name: "t.csv", bytes: enc("name,age\nAlice,30\nBob,25") }, "image-svg");
    expect(dec(out.bytes)).toContain("<svg");
  });

  it("turns an image-backed EPUB into a CBZ and detects it back", async () => {
    const png = sameRealmU8(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]));
    const epub = zipSync({
      "mimetype": zipText("application/epub+zip"),
      "OEBPS/images/i1.png": png,
      "OEBPS/chapter1.xhtml": zipText("<html><body><img src='images/i1.png'/></body></html>"),
      "OEBPS/content.opf": zipText(
        "<package><manifest><item id='c1' href='chapter1.xhtml' media-type='application/xhtml+xml'/>" +
        "<item id='i1' href='images/i1.png' media-type='image/png'/></manifest>" +
        "<spine><itemref idref='c1'/></spine></package>"
      ),
    });
    const out = await convertFile({ name: "comic.epub", bytes: epub }, "cbz");
    expect(out.mime).toBe("application/vnd.comicbook+zip");
    const detected = detectFile(out.bytes, out.name);
    expect(typeof detected === "string" ? detected : detected.type).toBe("cbz");
    const files = unzipSync(out.bytes);
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  it("rejects a text-only EPUB for cbz rather than dropping prose", async () => {
    const epub = epubFromHtml("Novel", "<h1>Chapter</h1><p>Readable prose.</p>");
    await expect(convertFile({ name: "novel.epub", bytes: epub }, "cbz")).rejects.toThrow(/image/i);
  });

  it("converts DXF to a real PDF", async () => {
    const dxf = enc("0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n");
    const out = await convertFile({ name: "drawing.dxf", bytes: dxf }, "pdf");
    expect(out.bytes[0]).toBe(0x25);
    expect(out.bytes[1]).toBe(0x50);
    expect(out.bytes[2]).toBe(0x44);
    expect(out.bytes[3]).toBe(0x46);
  });

  it("advertises cbz and dxf with their targets", () => {
    expect(targetsFor("cbz")).toEqual(expect.arrayContaining(["pdf", "epub"]));
    expect(targetsFor("dxf")).toEqual(expect.arrayContaining(["pdf"]));
    expect(MATRIX["pptx"]).toContain("odp");
  });
});

describe("round 4: pptx → ODP preserves slides", () => {
  it("keeps slide titles and order through pptx → odp", async () => {
    const pptx = buildPptx([
      { title: "First slide", lines: ["Alpha detail", "Beta detail"] },
      { title: "Second slide", lines: ["Gamma detail"] },
    ]);
    const out = await convertFile({ name: "deck.pptx", bytes: pptx }, "odp");
    expect(out.mime).toBe("application/vnd.oasis.opendocument.presentation");
    const slides = odpToSlidesForTest(out.bytes);
    expect(slides.map((s) => s.title)).toEqual(["First slide", "Second slide"]);
    expect(slides[0]!.lines).toEqual(["Alpha detail", "Beta detail"]);
    expect(slides[1]!.lines).toEqual(["Gamma detail"]);
  });

  it("slidesToOdp produces a standards-shaped package", () => {
    const out = slidesToOdp([
      { title: "One", lines: ["A", "B"] },
      { title: "Two", lines: ["C"] },
    ]);
    const files = unzipSync(out);
    expect(strFromU8(files["mimetype"]!)).toBe("application/vnd.oasis.opendocument.presentation");
    expect(Object.keys(files).length).toBeGreaterThan(2);
  });
});

function odpToSlidesForTest(bytes: Uint8Array): { title: string; lines: string[] }[] {
  const files = unzipSync(bytes);
  const contentName = Object.keys(files).find((n) => n.endsWith("content.xml"));
  const xml = strFromU8(files[contentName!]!);
  const pages = [...xml.matchAll(/<draw:page[^>]*>([\s\S]*?)<\/draw:page>/g)];
  return pages.map((m) => {
    const paras = [...m[1]!.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)].map((p) => p[1]!.trim());
    return { title: paras[0] ?? "", lines: paras.slice(1) };
  });
}

describe("round 4: TeX escaping and OOXML MIME correctness", () => {
  it("escapes reserved characters in the TeX body", () => {
    const tex = htmlToLatex("<p>Budget #1 costs $50 & tax_2026 100%</p>", "Document");
    expect(tex).toContain("Budget \\#1 costs \\$50 \\& tax\\_2026 100\\%");
    expect(tex).toContain("\\documentclass{article}");
    expect(tex).toContain("\\end{document}");
  });

  it("docx → dotx carries the registered template MIME", async () => {
    const input = htmlToDocx("<h1>Reusable report</h1><p>Local text.</p>");
    const out = await convertFile({ name: "report.docx", bytes: input }, "dotx");
    expect(out.name).toBe("report.dotx");
    expect(out.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"
    );
    const files = unzipSync(out.bytes);
    expect(strFromU8(files["[Content_Types].xml"]!)).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"
    );
  });

  it("xlsx → xlsm carries the registered macro-enabled MIME", async () => {
    const input = await csvToXlsx("name,score\nAlice,90\nBob,85");
    const out = await convertFile({ name: "scores.xlsx", bytes: input }, "xlsm");
    expect(out.name).toBe("scores.xlsm");
    expect(out.mime).toBe("application/vnd.ms-excel.sheet.macroEnabled.main+xml");
    expect(Array.from(out.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("ods → xlsm keeps intact cells", async () => {
    const input = csvToOds("name,score\nAlice,90");
    const out = await convertFile({ name: "scores.ods", bytes: input }, "xlsm");
    const files = unzipSync(out.bytes);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] ?? files["xl/worksheets/sheet.xml"]!);
    expect(sheet).toContain("Alice");
  });

  it("keeps the whole matrix consistent: no duplicate targets per source", () => {
    for (const [source, targets] of Object.entries(MATRIX)) {
      expect(new Set(targets).size, `${source} has duplicates`).toBe(targets.length);
    }
  });
});
