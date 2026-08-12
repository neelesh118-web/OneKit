// @vitest-environment node
import { describe, expect, it } from "vitest";
import { slidesToOdp, imagesToOdp, odpToSlides } from "../src/core/converter/odf";
import { targetsFor, targetExtension } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";
import { linesToSlide, type Slide } from "../src/core/converter/pptx";
import { unzipSync, strFromU8 } from "fflate/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";

const enc = new TextEncoder();
const toBytes = (s: string): Uint8Array => enc.encode(s);

/** A structurally valid PNG header (IHDR) that pngSize can measure. */
function tinyPng(width = 2, height = 2): Uint8Array {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png[8] = 0; png[9] = 0; png[10] = 0; png[11] = 13; // IHDR length
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  png[16] = (width >> 24) & 0xff; png[17] = (width >> 16) & 0xff;
  png[18] = (width >> 8) & 0xff; png[19] = width & 0xff;
  png[20] = (height >> 24) & 0xff; png[21] = (height >> 16) & 0xff;
  png[22] = (height >> 8) & 0xff; png[23] = height & 0xff;
  png[24] = 8; // bit depth
  png[25] = 6; // RGBA
  return png;
}

async function tinyPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 250, size: 14, font });
  return new Uint8Array(await doc.save());
}

describe("ODP writer", () => {
  it("slidesToOdp round-trips through odpToSlides", () => {
    const slides: Slide[] = [
      linesToSlide(["Welcome", "Point one", "Point two"]),
      linesToSlide(["Second", "More detail"])
    ];
    const odp = slidesToOdp(slides);
    const read = odpToSlides(odp);
    expect(read.length).toBe(2);
    expect(read[0]!.title).toBe("Welcome");
    expect(read[0]!.lines).toEqual(["Point one", "Point two"]);
    expect(read[1]!.title).toBe("Second");
  });

  it("writes a valid OpenDocument presentation package", () => {
    const odp = slidesToOdp([linesToSlide(["Hi"])]);
    const files = unzipSync(odp);
    expect(strFromU8(files["mimetype"]!)).toBe("application/vnd.oasis.opendocument.presentation");
    expect(files["content.xml"]).toBeDefined();
    expect(strFromU8(files["content.xml"]!)).toContain("<office:presentation>");
    expect(strFromU8(files["META-INF/manifest.xml"]!)).toContain("opendocument.presentation");
  });

  it("imagesToOdp embeds one real picture per slide with injected rasterizer", async () => {
    const png = tinyPng(4, 3);
    const odp = await imagesToOdp(
      [{ bytes: png, name: "photo" }, { bytes: png, name: "graph" }],
      { rasterize: async (bytes) => bytes }
    );
    const files = unzipSync(odp);
    const content = strFromU8(files["content.xml"]!);
    const pages = [...content.matchAll(/<draw:page/g)];
    expect(pages.length).toBe(2);
    expect(content).toContain('xlink:href="Pictures/image1.png"');
    expect(content).toContain('xlink:href="Pictures/image2.png"');
    expect(files["Pictures/image1.png"]).toBeDefined();
    expect(strFromU8(files["META-INF/manifest.xml"]!)).toContain("Pictures/image1.png");
    expect(strFromU8(files["mimetype"]!)).toBe("application/vnd.oasis.opendocument.presentation");
  });

  it("rejects an empty image set honestly", async () => {
    await expect(imagesToOdp([])).rejects.toThrow(/at least one image/);
  });
});

describe("source → ODP pairs", () => {
  it("pdf → odp produces readable slides", async () => {
    const pdf = await tinyPdf("Roadmap for Q3");
    const result = await convertFile({ bytes: pdf, name: "plan.pdf" }, "odp");
    expect(result.name).toBe("plan.odp");
    expect(result.mime).toBe("application/vnd.oasis.opendocument.presentation");
    const slides = odpToSlides(result.bytes);
    expect(slides.length).toBeGreaterThan(0);
    const all = slides.map((s) => [s.title, ...s.lines].join(" ")).join(" ");
    expect(all).toContain("Roadmap for Q3");
  });

  it("docx, html, markdown, txt and epub all write ODP presentations", async () => {
    const docx = await convertFile({ bytes: toBytes("Deck words"), name: "d.txt" }, "docx");
    const epub = await convertFile({ bytes: toBytes("# E\n\nEpub deck"), name: "e.md" }, "epub");
    const sources: [string, Uint8Array][] = [
      ["d.docx", docx.bytes],
      ["e.epub", epub.bytes],
      ["page.html", toBytes("<html><body><h1>H</h1><p>Html deck</p></body></html>")],
      ["page.md", toBytes("# T\n\nMarkdown deck")],
      ["page.txt", toBytes("Plain deck")]
    ];
    for (const [name, bytes] of sources) {
      const result = await convertFile({ bytes, name }, "odp");
      expect(result.name).toBe(name.replace(/\.[a-z0-9]+$/i, "") + ".odp");
      expect(result.mime).toBe("application/vnd.oasis.opendocument.presentation");
      expect(odpToSlides(result.bytes).length).toBeGreaterThan(0);
    }
  });
});

describe("matrix scoping", () => {
  it("advertises odp for the doc and image rows", () => {
    for (const src of ["pdf", "docx", "docm", "dotx", "epub", "html", "markdown", "text", "image-png", "image-jpeg", "image-svg", "raw-cr2", "eps", "ps"] as const) {
      expect(targetsFor(src)).toContain("odp");
    }
  });

  it("keeps pptx → odp out of scope (Codex's pair) and no self-targets", () => {
    // pptx → odp is now in scope (Codex's ODP path merged in round 4).
    expect(targetsFor("pptx")).toContain("odp");
    expect(targetsFor("odp")).not.toContain("odp");
    expect(targetExtension("odp")).toBe("odp");
  });
});
