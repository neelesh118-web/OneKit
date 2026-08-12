// @vitest-environment node
// Round 5: the comics & CAD slice from the backlog —
// pdf→cbz, cbz→images/html/docx, dxf→svg/raster/html/text, ai→pdf/raster.
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor, MATRIX } from "../src/core/converter/matrix";
import { canvasOptions, pdfCanvasOptions } from "./canvas-options";
import { zipText, sameRealmU8 } from "../src/core/converter/zip-realm";
import { zipSync, unzipSync } from "fflate/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

async function makePdf(lines = ["Page one line", "Page two line"]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = pdf.addPage([300, 300]);
    page.drawText(line, { x: 40, y: 150, size: 14, font });
  }
  return pdf.save();
}

// A genuine 1×1 PNG (has a real IHDR chunk so image embedding works).
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function makeCbz(pages = 2, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (let i = 1; i <= pages; i += 1) files[`page-${String(i).padStart(2, "0")}.png`] = sameRealmU8(new Uint8Array(PIXEL));
  for (const [name, value] of Object.entries(extra)) files[name] = zipText(value);
  return zipSync(files);
}

const DXF = enc(
  "0\nSECTION\n2\nENTITIES\n" +
  "0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n" +
  "0\nTEXT\n8\n0\n10\n50\n20\n60\n40\n5\n1\nHello\n" +
  "0\nENDSEC\n0\nEOF\n"
);

describe("round 5: pdf → cbz (backlog rank 368)", () => {
  it("advertises pdf → cbz", () => {
    expect(targetsFor("pdf")).toContain("cbz");
  });

  it("renders every page into a comic zip", async () => {
    const pdf = await makePdf();
    const out = await convertFile({ name: "doc.pdf", bytes: pdf }, "cbz", pdfCanvasOptions());
    expect(out.name).toMatch(/\.cbz$/);
    expect(out.mime).toBe("application/vnd.comicbook+zip");
    const detected = detectFile(out.bytes, out.name);
    expect(typeof detected === "string" ? detected : detected.type).toBe("cbz");
    const files = unzipSync(out.bytes);
    const pages = Object.keys(files).filter((name) => name.startsWith("page-"));
    expect(pages.length).toBe(2);
    expect(pages[0]).toBe("page-01.png");
  });

  it("honestly rejects a corrupt PDF for cbz", async () => {
    await expect(
      convertFile({ name: "bad.pdf", bytes: enc("not a pdf") }, "cbz", pdfCanvasOptions())
    ).rejects.toThrow(/PDF/i);
  });
});

describe("round 5: cbz → images / html / docs (ranks 637–1258)", () => {
  it("advertises the cbz targets", () => {
    for (const t of ["html", "docx", "docm", "dotx", "image-png", "image-jpeg", "image-webp", "image-gif"]) {
      expect(targetsFor("cbz")).toContain(t);
    }
  });

  it("extracts the first page as PNG", async () => {
    const out = await convertFile({ name: "comic.cbz", bytes: makeCbz() }, "image-png", canvasOptions());
    expect(out.mime).toBe("image/png");
    expect(out.bytes[0]).toBe(0x89);
    expect(out.bytes[1]).toBe(0x50);
  });

  it("pushes a page through the raster pipeline for JPEG", async () => {
    const out = await convertFile({ name: "comic.cbz", bytes: makeCbz() }, "image-jpeg", canvasOptions());
    expect(out.name).toMatch(/\.jpe?g$/);
    expect(out.bytes.length).toBeGreaterThan(0);
  });

  it("builds a gallery HTML with every page embedded", async () => {
    const out = await convertFile({ name: "comic.cbz", bytes: makeCbz() }, "html", canvasOptions());
    const html = dec(out.bytes);
    expect(html).toContain("<img");
    expect((html.match(/data:image/g) ?? []).length).toBe(2);
  });

  it("wraps the pages into a real DOCX", async () => {
    const out = await convertFile({ name: "comic.cbz", bytes: makeCbz() }, "docx", canvasOptions());
    const files = unzipSync(out.bytes);
    expect(files["[Content_Types].xml"]).toBeTruthy();
    expect(out.mime).toContain("wordprocessingml.document");
  });

  it("rejects a text-only cbz honestly", async () => {
    const cbz = makeCbz(0, { "page-01.txt": "no images here" });
    await expect(convertFile({ name: "comic.cbz", bytes: cbz }, "pdf", canvasOptions())).rejects.toThrow(/no supported image/i);
  });
});

describe("round 5: dxf → raster / svg / html / text (ranks 647–1286)", () => {
  it("advertises the dxf targets", () => {
    for (const t of ["html", "text", "image-svg", "image-png", "image-jpeg"]) {
      expect(targetsFor("dxf")).toContain(t);
    }
  });

  it("renders the drawing as SVG", async () => {
    const out = await convertFile({ name: "drawing.dxf", bytes: DXF }, "image-svg");
    const svg = dec(out.bytes);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<line");
    expect(svg).toContain("<text");
  });

  it("rasterizes the SVG to PNG through the canvas pipeline", async () => {
    const out = await convertFile({ name: "drawing.dxf", bytes: DXF }, "image-png", canvasOptions());
    expect(out.mime).toBe("image/png");
    expect(out.bytes[0]).toBe(0x89);
  });

  it("embeds the drawing in an HTML page", async () => {
    const out = await convertFile({ name: "drawing.dxf", bytes: DXF }, "html");
    expect(dec(out.bytes)).toContain("DXF drawing");
    expect(dec(out.bytes)).toContain("<svg");
  });

  it("dumps a plain-text entity inventory", async () => {
    const out = await convertFile({ name: "drawing.dxf", bytes: DXF }, "text");
    const text = dec(out.bytes);
    expect(text).toContain("LINE");
    expect(text).toContain("TEXT");
    expect(text).toContain("Hello");
  });
});

describe("round 5: Illustrator (ai) → the whole PDF pipeline (rank 42)", () => {
  it("detects PDF-payload .ai files as Illustrator", async () => {
    const pdf = await makePdf(["Vector artwork"]);
    const detected = detectFile(pdf, "art.ai");
    expect(detected.type).toBe("ai");
    expect(detected.reliable).toBe(true);
  });

  it("advertises ai like a document source", () => {
    const targets = targetsFor("ai");
    expect(targets).toContain("pdf");
    expect(targets).toContain("image-png");
    expect(targets).toContain("docx");
    expect(targets).toContain("epub");
    expect(new Set(MATRIX["ai"]).size).toBe(MATRIX["ai"].length);
  });

  it("ai → pdf is the honest native copy", async () => {
    const pdf = await makePdf(["Vector artwork"]);
    const out = await convertFile({ name: "art.ai", bytes: pdf }, "pdf");
    expect(out.name).toMatch(/\.pdf$/);
    expect(dec(out.bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("ai → png renders the artwork via the PDF pipeline", async () => {
    const pdf = await makePdf(["Vector artwork"]);
    const out = await convertFile({ name: "art.ai", bytes: pdf }, "image-png", pdfCanvasOptions());
    expect(out.mime).toBe("image/png");
    expect(out.bytes[0]).toBe(0x89);
  });
});
