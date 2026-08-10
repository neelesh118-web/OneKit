// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";
import {
  csvToJson,
  docxToHtml,
  epubToHtml,
  htmlToMarkdown,
  htmlToPdf,
  htmlToText,
  jsonToCsv,
  jsonToXml,
  jsonToYaml,
  markdownToHtml,
  parseCsv,
  pdfToHtml,
  pdfToText,
  xmlToJson,
  xlsxToCsv,
  xlsxToJson,
  yamlToJson
} from "../src/core/converter/documents";
import { isPdfBytes, pdfPageCount } from "../src/core/pdf-tools";

const encoder = new TextEncoder();

async function makeTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 300]);
  page.drawText("Hello PDF world", { x: 40, y: 260, size: 12, font });
  page.drawText("Second line here", { x: 40, y: 240, size: 12, font });
  return doc.save();
}

/** Minimal .docx: content types + relationships + one paragraph. */
function makeDocx(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Hello from Word</w:t></w:r></w:p>
<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>`
    )
  };
  return zipSync(files);
}

/** Minimal EPUB: mimetype + container + OPF + two chapters. */
function makeEpub(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
    ),
    "OEBPS/content.opf": strToU8(
      `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<manifest>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`
    ),
    "OEBPS/ch1.xhtml": strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter One</h1><p>First chapter text.</p></body></html>`),
    "OEBPS/ch2.xhtml": strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter Two</h1><p>Second chapter text.</p></body></html>`)
  };
  return zipSync(files);
}

function makeXlsx(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { name: "Ada", role: "Engineer" },
      { name: "Grace", role: "Admiral" }
    ]),
    "People"
  );
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(out);
}

describe("converter documents — PDF", () => {
  it("extracts real text from a real PDF", async () => {
    const pdf = await makeTextPdf();
    const text = await pdfToText(pdf);
    expect(text).toContain("Hello PDF world");
    expect(text).toContain("Second line here");
  });

  it("wraps extracted text as HTML", async () => {
    const html = await pdfToHtml(await makeTextPdf());
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<p>");
  });
});

describe("converter documents — DOCX / EPUB", () => {
  it("extracts text from a real docx", async () => {
    const html = await docxToHtml(makeDocx());
    expect(html).toContain("Hello from Word");
    expect(html).toContain("Second paragraph");
  });

  it("concatenates EPUB chapters in spine order", () => {
    const html = epubToHtml(makeEpub());
    expect(html).toMatch(/^<!doctype html>/i);
    const one = html.indexOf("First chapter text");
    const two = html.indexOf("Second chapter text");
    expect(one).toBeGreaterThan(-1);
    expect(two).toBeGreaterThan(one);
  });

  it("rejects non-EPUB zip files honestly", () => {
    expect(() => epubToHtml(zipSync({ "readme.txt": strToU8("nope") }))).toThrow(/content\.opf/);
  });
});

describe("converter documents — HTML / Markdown", () => {
  it("converts HTML → Markdown → HTML", () => {
    const md = htmlToMarkdown("<h1>Title</h1><p>Some <strong>bold</strong> text.</p>");
    expect(md).toContain("# Title");
    expect(md).toContain("**bold**");
    const html = markdownToHtml(md);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("strips HTML to text", () => {
    expect(htmlToText("<p>Hello <b>world</b> &amp; friends</p>")).toBe("Hello world & friends");
  });

  it("builds a real multi-line PDF from HTML", async () => {
    const pdf = await htmlToPdf("<h1>Report</h1><p>Line one</p><p>Line two</p>");
    expect(isPdfBytes(pdf)).toBe(true);
    expect(await pdfPageCount(pdf)).toBeGreaterThanOrEqual(1);
  });
});

describe("converter documents — XLSX / CSV", () => {
  it("extracts the first sheet as CSV and JSON", async () => {
    const xlsx = makeXlsx();
    const csv = await xlsxToCsv(xlsx);
    expect(csv).toContain("name,role");
    expect(csv).toContain("Ada");
    const json = await xlsxToJson(xlsx);
    expect(json).toContain('"name": "Grace"');
  });

  it("parses quoted CSV with embedded commas and newlines", () => {
    const rows = parseCsv('a,b\n"x, y",2\n"line1\nline2",3\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", "2"],
      ["line1\nline2", "3"]
    ]);
  });

  it("turns CSV into objects keyed by header", () => {
    expect(csvToJson("name,role\nAda,Engineer\n")).toEqual([{ name: "Ada", role: "Engineer" }]);
  });
});

describe("converter documents — JSON / YAML / XML", () => {
  it("round-trips JSON → YAML → JSON", () => {
    const json = '{"name": "OneKit", "version": 1, "tags": ["local", "free"]}';
    const yaml = jsonToYaml(json);
    expect(yaml).toContain("name: OneKit");
    const back = yamlToJson(yaml);
    expect(JSON.parse(back)).toEqual(JSON.parse(json));
  });

  it("builds XML from JSON and parses it back", () => {
    const xml = jsonToXml('{"person": {"name": "Ada", "age": 36}}');
    expect(xml).toContain("<person>");
    expect(xml).toContain("<name>Ada</name>");
    const parsed = xmlToJson(xml);
    // fast-xml-parser keeps the document root as the top-level key.
    expect(JSON.parse(parsed).root.person.name).toBe("Ada");
  });

  it("flattens JSON to CSV", () => {
    const csv = jsonToCsv('[{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]');
    expect(csv.split("\n")[0]).toBe("a,b");
    expect(csv).toContain("2,y");
  });

  it("rejects malformed JSON honestly", () => {
    expect(() => jsonToYaml("{nope")).toThrow(/Not valid JSON/);
  });
});
