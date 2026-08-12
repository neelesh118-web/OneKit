// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync, zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { htmlToDocx, htmlToFb2, htmlToOdt, epubFromHtml, textToPdf } from "../src/core/converter/documents";
import { fb2ToHtml } from "../src/core/converter/ebooks";
import { buildPptx } from "../src/core/converter/pptx";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = new TextDecoder();
const phrase = "FB2 target content";

const sources = [
  "pdf", "docx", "docm", "dotx", "epub", "rtf", "odt", "odp", "pptx", "pptm",
  "potx", "ppsx", "html", "markdown", "text", "rst", "tex", "abw", "zabw", "oeb"
] as const;

const sourceExtension: Partial<Record<(typeof sources)[number], string>> = { text: "txt" };

const fixtures = {} as Record<(typeof sources)[number], Uint8Array>;

beforeAll(async () => {
  const html = `<h1>Chapter</h1><p>${phrase}</p>`;
  const docx = htmlToDocx(html);
  const pptx = buildPptx([{ title: "Chapter", lines: [phrase] }]);
  const abw = enc(`<?xml version="1.0"?><abiword><section><p style="Heading 1">Chapter</p><p>${phrase}</p></section></abiword>`);
  Object.assign(fixtures, {
    pdf: await textToPdf(phrase),
    docx,
    docm: docx,
    dotx: docx,
    epub: epubFromHtml("Chapter", html),
    rtf: enc(`{\\rtf1\\ansi ${phrase}}`),
    odt: htmlToOdt(html),
    odp: zipSync({
      mimetype: [enc("application/vnd.oasis.opendocument.presentation"), { level: 0 }],
      "content.xml": enc(`<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:presentation><draw:page><text:p>Chapter</text:p><text:p>${phrase}</text:p></draw:page></office:presentation></office:body></office:document-content>`)
    }),
    pptx,
    pptm: pptx,
    potx: pptx,
    ppsx: pptx,
    html: enc(html),
    markdown: enc(`# Chapter\n\n${phrase}`),
    text: enc(phrase),
    rst: enc(`Chapter\n=======\n\n${phrase}`),
    tex: enc(`\\documentclass{article}\\begin{document}\\section{Chapter}${phrase}\\end{document}`),
    abw,
    zabw: gzipSync(abw),
    oeb: enc(`<?xml version="1.0"?><package><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Chapter</dc:title></metadata><body><h1>Chapter</h1><p>${phrase}</p></body></package>`)
  });
});

describe("converter batch 7 - FictionBook target", () => {
  for (const source of sources) {
    it(`${source} -> fb2 writes valid readable FictionBook XML`, async () => {
      const result = await convertFile({ bytes: fixtures[source], name: `source.${sourceExtension[source] ?? source}` }, "fb2");
      const xml = dec.decode(result.bytes);
      expect(result.name).toBe("source.fb2");
      expect(result.mime).toBe("application/x-fictionbook+xml");
      expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      expect(xml).toContain("<FictionBook xmlns=");
      expect(xml).toContain("<description>");
      expect(xml).toContain("<body>");
      expect(fb2ToHtml(xml)).toContain(phrase);
    });
  }

  it("escapes book titles and prose as XML", () => {
    const xml = dec.decode(htmlToFb2("<p>A &amp; B &lt; C</p>", "Rock & Roll <Notes>"));
    expect(xml).toContain("<book-title>Rock &amp; Roll &lt;Notes&gt;</book-title>");
    expect(xml).toContain("<p>A &amp; B &lt; C</p>");
  });

  it("rejects a corrupt container instead of returning an FB2 shell", async () => {
    await expect(convertFile({ bytes: enc("not a zip"), name: "bad.docx" }, "fb2")).rejects.toThrow();
  });
});
