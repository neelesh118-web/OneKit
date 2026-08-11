/**
 * OpenDocument (ODT text documents and ODP presentations) reading, and
 * ODT writing. An ODF file is a zip whose content.xml holds the text, so
 * the readers unzip, pull the paragraphs out and hand them to the same
 * HTML/text/PDF pipelines the other document formats use.
 *
 * Styling, images and exact layout aren't carried across — headings,
 * paragraphs, lists and slide order are.
 */
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import { escapeXml, innerTextLines, xmlFragmentText } from "./xml-text";
import { linesToSlide, type Slide } from "./pptx";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const MIME_TEXT = "application/vnd.oasis.opendocument.text";

/** Reads content.xml out of an OpenDocument package. */
function contentXml(bytes: Uint8Array, kind: string): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(`Could not read this ${kind} file — it may be corrupt or password-protected.`);
  }
  const content = files["content.xml"];
  if (!content) {
    throw new Error(`This ${kind} file has no content.xml — it may not be a valid OpenDocument file.`);
  }
  return strFromU8(content);
}

/**
 * ODT → HTML. Headings keep their outline level, list items become list
 * items, and everything else becomes a paragraph.
 */
export function odtToHtml(bytes: Uint8Array): string {
  const xml = contentXml(bytes, ".odt");
  const body = /<office:body[\s\S]*?<\/office:body>/.exec(xml)?.[0] ?? xml;
  const blocks: string[] = [];
  let openList = false;
  // Walk headings, paragraphs and list items in document order. A list
  // item's own paragraphs are inside its match, so they aren't repeated.
  const pattern = /<(text:h|text:p|text:list-item)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  for (const m of body.matchAll(pattern)) {
    const tag = m[1]!;
    const attrs = m[2] ?? "";
    const text = xmlFragmentText(m[3] ?? "");
    if (tag === "text:list-item") {
      if (!text) continue;
      if (!openList) {
        blocks.push("<ul>");
        openList = true;
      }
      blocks.push(`<li>${escapeXml(text)}</li>`);
      continue;
    }
    if (openList) {
      blocks.push("</ul>");
      openList = false;
    }
    if (!text) continue;
    if (tag === "text:h") {
      const level = Math.min(6, Math.max(1, parseInt(/text:outline-level="(\d+)"/.exec(attrs)?.[1] ?? "1", 10)));
      blocks.push(`<h${level}>${escapeXml(text)}</h${level}>`);
    } else {
      blocks.push(`<p>${escapeXml(text)}</p>`);
    }
  }
  if (openList) blocks.push("</ul>");
  const html = blocks.join("\n");
  return (
    `<!doctype html>\n<html><head><meta charset="utf-8"><title>OpenDocument text</title></head>\n` +
    `<body>\n${html || "<p></p>"}\n</body>\n</html>`
  );
}

/** ODP → slides, in presentation order. */
export function odpToSlides(bytes: Uint8Array): Slide[] {
  const xml = contentXml(bytes, ".odp");
  const pages = [...xml.matchAll(/<draw:page(?:\s[^>]*)?>([\s\S]*?)<\/draw:page>/g)];
  if (pages.length === 0) {
    throw new Error("This .odp file has no slides to read.");
  }
  return pages.map((page) => linesToSlide(innerTextLines(page[1]!, ["text:p", "text:h"])));
}

/* Text → ODT ----------------------------------------------------------- */

/**
 * Builds a valid .odt from paragraph strings. The mimetype entry is
 * stored first and uncompressed, as the OpenDocument packaging spec
 * requires, so LibreOffice and Word both recognise the package.
 */
export function buildOdt(paragraphs: string[]): Uint8Array {
  const body = (paragraphs.length > 0 ? paragraphs : [""])
    .map((p) => `<text:p text:style-name="Standard">${escapeXml(p)}</text:p>`)
    .join("");
  const content =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-content ` +
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
    `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ` +
    `xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ` +
    `office:version="1.3">` +
    `<office:automatic-styles/>` +
    `<office:body><office:text>${body}</office:text></office:body>` +
    `</office:document-content>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-styles ` +
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ` +
    `xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ` +
    `office:version="1.3">` +
    `<office:styles>` +
    `<style:style style:name="Standard" style:family="paragraph"/>` +
    `</office:styles>` +
    `</office:document-styles>`;
  const manifest =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:media-type="${MIME_TEXT}"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>` +
    `</manifest:manifest>`;
  const meta =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3">` +
    `<office:meta><meta:generator>OneKit</meta:generator></office:meta></office:document-meta>`;
  return zipSync({
    // Stored, not deflated, and first in the archive.
    mimetype: [enc(MIME_TEXT), { level: 0 }],
    "META-INF/manifest.xml": enc(manifest),
    "content.xml": enc(content),
    "styles.xml": enc(styles),
    "meta.xml": enc(meta)
  });
}
