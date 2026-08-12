// @vitest-environment node
// Round 6 — the 1,000-pair backlog slice:
// PalmDB family (pdb/azw3/azw4/snb/rb), comics (cbc), ODF drawing (odg),
// sniffs (dot/wps), Apple Pages, XHTML/MHTML/SVGZ sources, and the new
// target writers (xhtml/mhtml/ps/eps/odg/azw3/azw4/svgz/cbc).
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile, detectFromName } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { canvasOptions } from "./canvas-options";
import { zipText, sameRealmU8 } from "../src/core/converter/zip-realm";
import { zipSync, gzipSync } from "fflate/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mobiFromHtml } from "../src/core/converter/ebooks-write";
import { azw4FromPdf } from "../src/core/converter/ebooks-write";
import { pagesToHtml, extractPagesPreviewPdf } from "../src/core/converter/ebooks";
import { htmlToOdg, htmlToMhtml, htmlToXhtml, htmlToPs, htmlToEps, htmlToOdt } from "../src/core/converter/documents";
import { gzipBytes, gunzipToText } from "../src/core/converter/archives";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

const SVG = enc('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="5" y="20">Hello SVGZ</text></svg>');

async function makePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([300, 300]);
  page.drawText("Hello AZW4", { x: 40, y: 150, size: 14, font });
  return pdf.save();
}

const FB2 = enc(
  '<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">' +
    "<description><title-info><book-title>FB3 Book</book-title></title-info></description>" +
    "<body><section><title>Chapter</title><p>Hello FB3 world</p></section></body></FictionBook>"
);

describe("round 6: PalmDB family sources (pdb/azw3/snb/rb)", () => {
  it("detects each Palm container by extension and routes to the MOBI reader", async () => {
    const mobi = mobiFromHtml("<p>Hello Palm world</p>", { title: "Palm" });
    for (const ext of ["pdb", "azw3", "snb", "rb"]) {
      const detected = detectFile(mobi, `book.${ext}`);
      expect(detected.type).toBe(ext);
      expect(targetsFor(ext as never)).toContain("text");
      const out = await convertFile({ name: `book.${ext}`, bytes: mobi }, "text");
      expect(dec(out.bytes)).toContain("Hello Palm world");
    }
  });

  it("writes azw3 from a document and round-trips it", async () => {
    const out = await convertFile({ name: "doc.html", bytes: enc("<p>AZW3 title</p>") }, "azw3");
    expect(out.name).toMatch(/\.azw3$/);
    expect(detectFile(out.bytes, "book.azw3").type).toBe("azw3");
    const back = await convertFile({ name: "book.azw3", bytes: out.bytes }, "text");
    expect(dec(back.bytes)).toContain("AZW3 title");
  });
});

describe("round 6: AZW4 (PDF inside a Palm container)", () => {
  it("extracts the embedded PDF and runs the PDF pipeline", async () => {
    const pdf = await makePdf();
    const azw4 = azw4FromPdf(pdf, { title: "AZW4 Book" });
    expect(detectFile(azw4, "book.azw4").type).toBe("azw4");
    const out = await convertFile({ name: "book.azw4", bytes: azw4 }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
    const text = await convertFile({ name: "book.azw4", bytes: azw4 }, "text");
    expect(dec(text.bytes)).toContain("Hello AZW4");
  });

  it("writes azw4 from a document (htmlToPdf then wrap) and round-trips", async () => {
    const out = await convertFile({ name: "doc.html", bytes: enc("<p>AZW4 doc</p>") }, "azw4");
    expect(out.name).toMatch(/\.azw4$/);
    const text = await convertFile({ name: "book.azw4", bytes: out.bytes }, "text");
    expect(dec(text.bytes)).toContain("AZW4 doc");
  });
});

describe("round 6: FB3 (compressed FictionBook)", () => {
  it("gunzips and reads the FB2 XML inside", async () => {
    const fb3 = gzipSync(FB2);
    expect(detectFile(fb3, "book.fb3").type).toBe("fb3");
    const out = await convertFile({ name: "book.fb3", bytes: fb3 }, "html");
    expect(dec(out.bytes)).toContain("Hello FB3 world");
    const title = await convertFile({ name: "book.fb3", bytes: fb3 }, "text");
    expect(dec(title.bytes)).toContain("FB3 Book");
  });
});

describe("round 6: CBC comic zips", () => {
  it("detects a zip comic as cbc and converts pages", async () => {
    const cbc = zipSync({ "page-01.png": sameRealmU8(new Uint8Array(PIXEL)) });
    expect(detectFile(cbc, "comic.cbc").type).toBe("cbc");
    expect(targetsFor("cbc")).toContain("pdf");
    const out = await convertFile({ name: "comic.cbc", bytes: cbc }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("writes cbc from a document via the text→page renderer", async () => {
    const odt = htmlToOdt("<p>Comic page text</p>");
    const out = await convertFile({ name: "doc.odt", bytes: odt }, "cbc", canvasOptions());
    expect(out.name).toMatch(/\.cbc$/);
    const detected = detectFile(out.bytes, "comic.cbc");
    expect(typeof detected === "string" ? detected : detected.type).toBe("cbc");
  });
});

describe("round 6: ODF drawing (odg)", () => {
  it("writes odg, detects it, and reads the text back", async () => {
    const out = await convertFile({ name: "doc.html", bytes: enc("<h1>Drawing</h1><p>Hello ODG</p>") }, "odg");
    expect(out.mime).toBe("application/vnd.oasis.opendocument.drawing");
    const detected = detectFile(out.bytes, "draw.odg");
    expect(typeof detected === "string" ? detected : detected.type).toBe("odg");
    const back = await convertFile({ name: "draw.odg", bytes: out.bytes }, "text");
    expect(dec(back.bytes)).toContain("Hello ODG");
  });
});

describe("round 6: .dot / .wps content sniffing", () => {
  it("converts text-payload .dot and .wps files", async () => {
    for (const ext of ["dot", "wps"]) {
      const out = await convertFile({ name: `doc.${ext}`, bytes: enc("Hello sniffer") }, "html");
      expect(dec(out.bytes)).toContain("Hello sniffer");
    }
  });

  it("converts RTF-payload .dot through the RTF path", async () => {
    const rtf = enc("{\\rtf1 Hello from RTF dot}");
    const detected = detectFile(rtf, "doc.dot");
    expect(typeof detected === "string" ? detected : detected.type).toBe("rtf");
    const out = await convertFile({ name: "doc.dot", bytes: rtf }, "text");
    expect(dec(out.bytes)).toContain("Hello from RTF");
  });

  it("throws an honest error for binary OLE2 containers", async () => {
    const binary = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(64).fill(0)]);
    await expect(convertFile({ name: "legacy.dot", bytes: binary }, "html")).rejects.toThrow();
  });
});

describe("round 6: Apple Pages", () => {
  it("reads text from an XML-based .pages package", async () => {
    const pages = zipSync({
      "Index/Document.xml": zipText("<document>Hello from Pages document</document>"),
      "Metadata/BuildVersionHistory.plist": zipText("<plist/>")
    });
    expect(detectFile(pages, "doc.pages").type).toBe("pages");
    const out = await convertFile({ name: "doc.pages", bytes: pages }, "text");
    expect(dec(out.bytes)).toContain("Hello from Pages");
  });

  it("uses the embedded QuickLook PDF for pages → pdf", async () => {
    const pdf = await makePdf();
    const pages = zipSync({
      "Index/Document.iwa": sameRealmU8(new Uint8Array([0, 1, 2, 3])),
      "Metadata/BuildVersionHistory.plist": zipText("<plist/>"),
      "QuickLook/Preview.pdf": sameRealmU8(new Uint8Array(pdf))
    });
    const preview = extractPagesPreviewPdf(pages);
    expect(preview).toBeDefined();
    const out = await convertFile({ name: "doc.pages", bytes: pages }, "pdf");
    expect(dec(out.bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("round 6: XHTML / MHTML / SVGZ sources", () => {
  it("reads xhtml as html", async () => {
    const xhtml = enc('<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello XHTML</p></body></html>');
    expect(detectFile(xhtml, "page.xhtml").type).toBe("xhtml");
    const out = await convertFile({ name: "page.xhtml", bytes: xhtml }, "markdown");
    expect(dec(out.bytes)).toContain("Hello XHTML");
  });

  it("reads mhtml back into html", async () => {
    const mhtml = htmlToMhtml("<p>Hello MHTML</p>", "Mail");
    expect(detectFile(mhtml, "page.mhtml").type).toBe("mhtml");
    const out = await convertFile({ name: "page.mhtml", bytes: mhtml }, "text");
    expect(dec(out.bytes)).toContain("Hello MHTML");
  });

  it("reads svgz as an SVG", async () => {
    const svgz = gzipBytes(SVG);
    expect(detectFile(svgz, "pic.svgz").type).toBe("svgz");
    const out = await convertFile({ name: "pic.svgz", bytes: svgz }, "text");
    expect(dec(out.bytes)).toContain("Hello SVGZ");
  });
});

describe("round 6: new target writers from document sources", () => {
  it("docx → xhtml is well-formed XML and re-detects as xhtml", async () => {
    const docx = await convertFile({ name: "doc.html", bytes: enc("<p>XHTML doc</p>") }, "docx");
    const out = await convertFile({ name: "doc.docx", bytes: docx.bytes }, "xhtml");
    expect(out.mime).toBe("application/xhtml+xml");
    expect(dec(out.bytes)).toContain('<?xml version="1.0"');
    expect(detectFile(out.bytes, "page.xhtml").type).toBe("xhtml");
  });

  it("docx → ps / eps carry the text and correct MIME", async () => {
    const docx = await convertFile({ name: "doc.html", bytes: enc("<p>PostScript doc</p>") }, "docx");
    const ps = await convertFile({ name: "doc.docx", bytes: docx.bytes }, "ps");
    expect(ps.mime).toBe("application/postscript");
    expect(dec(ps.bytes)).toContain("%!PS-Adobe-3.0");
    expect(dec(ps.bytes)).toContain("PostScript doc");
    const eps = await convertFile({ name: "doc.docx", bytes: docx.bytes }, "eps");
    expect(dec(eps.bytes)).toContain("%%BoundingBox:");
  });

  it("docx → mhtml contains the page and its MIME header", async () => {
    const docx = await convertFile({ name: "doc.html", bytes: enc("<p>MHTML doc</p>") }, "docx");
    const out = await convertFile({ name: "doc.docx", bytes: docx.bytes }, "mhtml");
    expect(out.mime).toBe("message/rfc822");
    expect(dec(out.bytes)).toContain("MIME-Version: 1.0");
    const back = await convertFile({ name: "page.mhtml", bytes: out.bytes }, "text");
    expect(dec(back.bytes)).toContain("MHTML doc");
  });

  it("odt → odg round-trips through detection", async () => {
    const odt = await convertFile({ name: "doc.html", bytes: enc("<p>ODG target</p>") }, "odt");
    const odg = await convertFile({ name: "doc.odt", bytes: odt.bytes }, "odg");
    const detected = detectFile(odg.bytes, "draw.odg");
    expect(typeof detected === "string" ? detected : detected.type).toBe("odg");
  });

  it("odt → azw3 / azw4 round-trip into readable text", async () => {
    const odt = await convertFile({ name: "doc.html", bytes: enc("<p>Kindle odt</p>") }, "odt");
    const azw3 = await convertFile({ name: "doc.odt", bytes: odt.bytes }, "azw3");
    const back3 = await convertFile({ name: "book.azw3", bytes: azw3.bytes }, "text");
    expect(dec(back3.bytes)).toContain("Kindle odt");
    const azw4 = await convertFile({ name: "doc.odt", bytes: odt.bytes }, "azw4");
    const back4 = await convertFile({ name: "book.azw4", bytes: azw4.bytes }, "text");
    expect(dec(back4.bytes)).toContain("Kindle odt");
  });

  it("docx → svgz gunzips back to an SVG with the text", async () => {
    const docx = await convertFile({ name: "doc.html", bytes: enc("<p>SVGZ target</p>") }, "docx");
    const out = await convertFile({ name: "doc.docx", bytes: docx.bytes }, "svgz");
    expect(out.name).toMatch(/\.svgz$/);
    const svg = gunzipToText(out.bytes);
    expect(svg).toContain("SVGZ target");
  });

  it("csv → mhtml / svgz keep the table data", async () => {
    const csv = enc("name,qty\napples,3");
    const mhtml = await convertFile({ name: "t.csv", bytes: csv }, "mhtml");
    const back = await convertFile({ name: "t.mhtml", bytes: mhtml.bytes }, "text");
    expect(dec(back.bytes)).toContain("apples");
    const svgz = await convertFile({ name: "t.csv", bytes: csv }, "svgz");
    expect(gunzipToText(svgz.bytes)).toContain("apples");
  });
});
