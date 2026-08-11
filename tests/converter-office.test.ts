// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import {
  buildPptx,
  pptxToSlides,
  slidesToHtml,
  slidesToText,
  textToSlides
} from "../src/core/converter/pptx";
import { buildOdt, odpToSlides, odtToHtml } from "../src/core/converter/odf";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const slides = [
  { title: "Quarterly review", lines: ["Revenue up 12%", "Churn down 3%"] },
  { title: "Next steps", lines: ["Ship the converter", 'Fix <the> "bugs" & ship'] }
];

/** Resolves a relationship target against the folder its .rels lives in. */
function resolvePart(relsName: string, target: string): string {
  const dir = relsName.slice(0, relsName.lastIndexOf("_rels/"));
  const out: string[] = [];
  for (const segment of (dir + target).split("/")) {
    if (segment === "..") out.pop();
    else if (segment !== "." && segment !== "") out.push(segment);
  }
  return out.join("/");
}

describe("converter PPTX writing", () => {
  const pptx = buildPptx(slides);
  const parts = unzipSync(pptx);
  const names = Object.keys(parts);

  it("writes a zip carrying every part PowerPoint requires", () => {
    expect(pptx[0]).toBe(0x50);
    expect(pptx[1]).toBe(0x4b);
    for (const required of [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/theme/theme1.xml"
    ]) {
      expect(names, `missing ${required}`).toContain(required);
    }
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(2);
  });

  it("resolves every relationship to a part that exists", () => {
    const dangling: string[] = [];
    for (const name of names.filter((n) => n.endsWith(".rels"))) {
      for (const m of strFromU8(parts[name]!).matchAll(/Target="([^"]+)"/g)) {
        const path = resolvePart(name, m[1]!);
        if (!names.includes(path)) dangling.push(`${name} → ${m[1]}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("gives every part a content type, and every content type a part", () => {
    const types = strFromU8(parts["[Content_Types].xml"]!);
    const defaults = new Set(
      [...types.matchAll(/Default Extension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase())
    );
    const overrides = new Set([...types.matchAll(/Override PartName="([^"]+)"/g)].map((m) => m[1]!));
    const untyped = names.filter(
      (n) => !overrides.has(`/${n}`) && !defaults.has(n.split(".").pop()!.toLowerCase())
    );
    expect(untyped).toEqual([]);
    expect([...overrides].filter((p) => !names.includes(p.slice(1)))).toEqual([]);
  });

  it("declares the slides, slide size and theme colours", () => {
    const presentation = strFromU8(parts["ppt/presentation.xml"]!);
    expect((presentation.match(/<p:sldId /g) ?? [])).toHaveLength(2);
    expect(presentation).toContain('<p:sldSz cx="9144000" cy="6858000"/>');
    const theme = strFromU8(parts["ppt/theme/theme1.xml"]!);
    expect(theme.match(/<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>/g) ?? []).toHaveLength(12);
  });

  it("puts the text on the slides, escaped", () => {
    expect(strFromU8(parts["ppt/slides/slide1.xml"]!)).toContain("<a:t>Quarterly review</a:t>");
    expect(strFromU8(parts["ppt/slides/slide1.xml"]!)).toContain("<a:t>Revenue up 12%</a:t>");
    expect(strFromU8(parts["ppt/slides/slide2.xml"]!)).toContain(
      "Fix &lt;the&gt; &quot;bugs&quot; &amp; ship"
    );
  });
});

describe("converter PPTX reading", () => {
  it("round-trips slides through write → read", () => {
    const read = pptxToSlides(buildPptx(slides));
    expect(read).toHaveLength(2);
    expect(read[0]!.title).toBe("Quarterly review");
    expect(read[0]!.lines).toEqual(["Revenue up 12%", "Churn down 3%"]);
    expect(read[1]!.lines[1]).toBe('Fix <the> "bugs" & ship');
  });

  it("renders slides as text and HTML", () => {
    const read = pptxToSlides(buildPptx(slides));
    const text = slidesToText(read);
    expect(text).toContain("Quarterly review");
    expect(text).toContain("Next steps");
    const html = slidesToHtml(read, "Deck");
    expect(html.match(/<section>/g) ?? []).toHaveLength(2);
    expect(html).toContain("&lt;the&gt;");
  });

  it("refuses slide-less and corrupt decks honestly", () => {
    expect(() => pptxToSlides(zipSync({ "docProps/app.xml": enc("<x/>") }))).toThrow(/no slides to read/);
    expect(() => pptxToSlides(enc("not a zip at all"))).toThrow(/Could not read this \.pptx/);
  });
});

describe("converter text → slides", () => {
  it("makes one slide per block, with the first line as the title", () => {
    const split = textToSlides("Title A\nline 1\nline 2\n\nTitle B\nb0");
    expect(split[0]!.title).toBe("Title A");
    expect(split[0]!.lines).toEqual(["line 1", "line 2"]);
    expect(split[1]!.title).toBe("Title B");
  });

  it("spills long blocks onto continuation slides", () => {
    const long = `Heading\n${Array.from({ length: 10 }, (_, i) => `b${i}`).join("\n")}`;
    const split = textToSlides(long);
    expect(split).toHaveLength(2);
    expect(split[1]!.title).toBe("Heading (cont.)");
  });

  it("always produces at least one slide", () => {
    expect(textToSlides("")).toHaveLength(1);
  });
});

describe("converter ODT", () => {
  const odt = buildOdt(["First paragraph", "Second & <third>"]);

  it("writes a package with mimetype stored first", () => {
    const parts = unzipSync(odt);
    for (const required of ["mimetype", "META-INF/manifest.xml", "content.xml", "styles.xml"]) {
      expect(Object.keys(parts), `missing ${required}`).toContain(required);
    }
    expect(strFromU8(parts["mimetype"]!)).toBe("application/vnd.oasis.opendocument.text");
    // The spec wants mimetype first and uncompressed: its name sits at
    // byte 30 of the zip, and the local header's method must be 0.
    expect(strFromU8(odt.subarray(30, 38))).toBe("mimetype");
    expect(new DataView(odt.buffer, odt.byteOffset).getUint16(8, true)).toBe(0);
  });

  it("writes the paragraphs, escaped", () => {
    const content = strFromU8(unzipSync(odt)["content.xml"]!);
    expect(content).toContain(">First paragraph</text:p>");
    expect(content).toContain("Second &amp; &lt;third&gt;");
  });

  it("reads back what it wrote", () => {
    const html = odtToHtml(odt);
    expect(html).toContain("<p>First paragraph</p>");
    expect(html).toContain("<p>Second &amp; &lt;third&gt;</p>");
  });

  it("reads a document shaped like LibreOffice's own output", () => {
    const content =
      `<?xml version="1.0" encoding="UTF-8"?><office:document-content ` +
      `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
      `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">` +
      `<office:body><office:text>` +
      `<text:h text:style-name="Heading_20_1" text:outline-level="1">Chapter one</text:h>` +
      `<text:p text:style-name="Text_20_body">Hello <text:span text:style-name="T1">world</text:span>.</text:p>` +
      `<text:p>Spaces:<text:s text:c="3"/>gap<text:tab/>tabbed</text:p>` +
      `<text:list xml:id="list1"><text:list-item><text:p>Bullet one</text:p></text:list-item>` +
      `<text:list-item><text:p>Bullet two</text:p></text:list-item></text:list>` +
      `<text:h text:outline-level="2">Sub heading</text:h>` +
      `</office:text></office:body></office:document-content>`;
    const html = odtToHtml(
      zipSync({
        mimetype: [enc("application/vnd.oasis.opendocument.text"), { level: 0 }],
        "content.xml": enc(content)
      })
    );
    expect(html).toContain("<h1>Chapter one</h1>");
    expect(html).toContain("<h2>Sub heading</h2>");
    expect(html).toContain("<p>Hello world.</p>");
    expect(html).toContain("Spaces: gap tabbed");
    expect(html).toContain("<li>Bullet one</li>");
    expect(html).toContain("</ul>");
    // A list item's paragraph shouldn't also appear as its own paragraph.
    expect((html.match(/Bullet one/g) ?? [])).toHaveLength(1);
  });

  it("refuses a package with no content.xml honestly", () => {
    expect(() => odtToHtml(zipSync({ "styles.xml": enc("<x/>") }))).toThrow(/no content\.xml/);
  });
});

describe("converter ODP", () => {
  const content =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ` +
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
    `xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0">` +
    `<office:body><office:presentation>` +
    `<draw:page draw:name="page1"><draw:frame><draw:text-box>` +
    `<text:p>Deck title</text:p><text:p>Point one</text:p></draw:text-box></draw:frame></draw:page>` +
    `<draw:page draw:name="page2"><draw:frame><draw:text-box>` +
    `<text:p>Second slide</text:p></draw:text-box></draw:frame></draw:page>` +
    `</office:presentation></office:body></office:document-content>`;
  const odp = zipSync({
    mimetype: [enc("application/vnd.oasis.opendocument.presentation"), { level: 0 }],
    "content.xml": enc(content)
  });

  it("reads every page in order", () => {
    const pages = odpToSlides(odp);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.title).toBe("Deck title");
    expect(pages[0]!.lines).toEqual(["Point one"]);
    expect(pages[1]!.title).toBe("Second slide");
  });

  it("refuses a page-less presentation honestly", () => {
    expect(() => odpToSlides(zipSync({ "content.xml": enc("<office:document-content/>") }))).toThrow(
      /no slides to read/
    );
  });
});
