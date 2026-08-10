// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { zipSync, zlibSync } from "fflate/browser";
import {
  csvToPdf,
  docxToPdf,
  epubToPdf,
  imagesToPdf,
  markdownToPdf,
  pdfToImages,
  textToPdf
} from "../src/core/converter/documents";

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

/** Builds a tiny valid 1×1 RGB PNG (signature + IHDR + IDAT + IEND). */
function tinyPng(r: number, g: number, b: number): Uint8Array {
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, body.length, false);
    out.set(len, 0);
    out.set(encoder.encode(type), 4);
    out.set(body, 8);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(new Uint8Array([...encoder.encode(type), ...body])), false);
    out.set(crc, 8 + body.length);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1, false);
  new DataView(ihdr.buffer).setUint32(4, 1, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const raw = new Uint8Array([0, r, g, b]); // filter byte + pixel
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", zlibSync(raw)),
    ...chunk("IEND", new Uint8Array(0))
  ]);
  return png;
}

/** Builds a real 2-page PDF with pdf-lib. */
async function twoPagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([200, 200]).drawText("Page one", { font, size: 12 });
  doc.addPage([200, 200]).drawText("Page two", { font, size: 12 });
  return doc.save();
}

/** A canvas stub that satisfies pdfjs's render loop (no-op draw ops). */
function pdfjsStubCanvasFactory(): HTMLCanvasElement {
  let ctx: Record<string, unknown>;
  const canvas = {
    width: 200,
    height: 200,
    toDataURL: () => "data:image/png;base64,AAAA",
    toBlob(cb: (b: Blob | null) => void): void {
      cb(new Blob([new Uint8Array([0x01, 0x02, 0x03, 0x04])], { type: "image/png" }));
    },
    getContext: () => ctx
  };
  const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  ctx = new Proxy<Record<string, unknown>>(
    {},
    {
      get(_target, prop) {
        if (prop === "canvas") return canvas;
        if (prop === "getTransform") return () => transform;
        return () => {};
      },
      set() {
        return true;
      }
    }
  );
  return canvas as unknown as HTMLCanvasElement;
}

describe("converter pdf → images", () => {
  it("renders every page of a real PDF, named page-01, page-02…", async () => {
    const pdf = await twoPagePdf();
    const pages = await pdfToImages(pdf, "png", { canvasFactory: pdfjsStubCanvasFactory });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.name).toBe("page-01.png");
    expect(pages[1]!.name).toBe("page-02.png");
    expect(pages[0]!.bytes.length).toBeGreaterThan(0);
  });

  it("renders JPEG pages with .jpg names", async () => {
    const pdf = await twoPagePdf();
    const pages = await pdfToImages(pdf, "jpeg", { canvasFactory: pdfjsStubCanvasFactory });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.name).toBe("page-01.jpg");
  });

  it("honestly rejects non-PDF bytes", async () => {
    await expect(
      pdfToImages(encoder.encode("not a pdf"), "png", { canvasFactory: pdfjsStubCanvasFactory })
    ).rejects.toThrow(/Could not render this PDF|Could not read this PDF/);
  });
});

describe("converter images → pdf", () => {
  it("packs two PNGs into one real PDF", async () => {
    const pdf = await imagesToPdf([
      { bytes: tinyPng(200, 40, 40), name: "a.png" },
      { bytes: tinyPng(40, 200, 40), name: "b.png" }
    ]);
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(200);
  });

  it("re-encodes non-PNG/JPEG sources through the injectable rasterizer", async () => {
    const pdf = await imagesToPdf([{ bytes: encoder.encode("fake webp"), name: "x.webp" }], {
      rasterize: async () => tinyPng(10, 20, 30)
    });
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
  });

  it("surfaces rasterizer failures honestly", async () => {
    await expect(
      imagesToPdf([{ bytes: encoder.encode("junk"), name: "y.png" }], {
        rasterize: async () => {
          throw new Error("broken image");
        }
      })
    ).rejects.toThrow(/broken image/);
  });

  it("rejects an empty batch", async () => {
    await expect(imagesToPdf([])).rejects.toThrow(/at least one image/);
  });
});

describe("converter text-ish → pdf", () => {
  it("text → PDF", async () => {
    const pdf = await textToPdf("Hello\n\nWorld");
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(200);
  });

  it("markdown → PDF", async () => {
    const pdf = await markdownToPdf("# Heading\n\nSome **bold** text.");
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
  });

  it("csv → PDF", async () => {
    const pdf = await csvToPdf('name,score\nAda,99\nBob,42');
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
  });
});

describe("converter epub → pdf", () => {
  it("builds a PDF from a minimal EPUB", async () => {
    const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <manifest>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;
    const epub = zipSync({
      "mimetype": encoder.encode("application/epub+zip"),
      "META-INF/container.xml": encoder.encode('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
      "OEBPS/content.opf": encoder.encode(opf),
      "OEBPS/ch1.xhtml": encoder.encode('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello from an EPUB.</p></body></html>')
    });
    const pdf = await epubToPdf(epub);
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
  });
});

describe("converter docx → pdf", () => {
  it("builds a PDF from a minimal DOCX", async () => {
    const docx = zipSync({
      "[Content_Types].xml": encoder.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      "word/document.xml": encoder.encode('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from a DOCX.</w:t></w:r></w:p></w:body></w:document>')
    });
    const pdf = await docxToPdf(docx);
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(200);
  });
});
