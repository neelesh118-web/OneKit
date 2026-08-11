/**
 * XML text helpers shared by the OOXML (DOCX/PPTX) and OpenDocument
 * (ODT/ODP/ODS) readers and writers. Both formats are zipped XML that
 * differ mainly in tag names, so the text extraction lives here once.
 */

/** Characters XML 1.0 forbids even as escapes. */
const ILLEGAL_XML = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");

/** Escapes text for use in an XML text node or attribute value. */
export function escapeXml(text: string): string {
  return text
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Decodes the five XML entities plus numeric character references. */
export function decodeXmlText(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * One line per `paragraphTag`, built from the `runTag` elements inside
 * it — the OOXML shape, where text lives in `<w:t>` / `<a:t>` runs.
 */
export function runTextLines(xml: string, paragraphTag: string, runTag: string): string[] {
  const lines: string[] = [];
  const runPattern = new RegExp(`<${runTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${runTag}>`, "g");
  for (const chunk of splitByTag(xml, paragraphTag)) {
    let line = "";
    for (const m of chunk.matchAll(runPattern)) {
      line += decodeXmlText(m[1]!.replace(/<[^>]+>/g, ""));
    }
    const trimmed = collapse(line);
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}

/**
 * One line per `paragraphTag`, built from that element's own text — the
 * OpenDocument shape, where `<text:p>` holds the characters directly
 * (possibly wrapped in styling spans).
 */
export function innerTextLines(xml: string, paragraphTags: string[]): string[] {
  const lines: string[] = [];
  const pattern = new RegExp(`<(${paragraphTags.join("|")})(?:\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "g");
  for (const m of xml.matchAll(pattern)) {
    const line = xmlFragmentText(m[2] ?? "");
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * The readable text inside an XML fragment: OpenDocument's whitespace
 * elements expanded, child tags dropped, entities decoded.
 */
export function xmlFragmentText(fragment: string): string {
  return collapse(decodeXmlText(expandOdfWhitespace(fragment).replace(/<[^>]+>/g, "")));
}

/** OpenDocument encodes runs of spaces, tabs and breaks as elements. */
function expandOdfWhitespace(xml: string): string {
  return xml
    .replace(/<text:s\/>/g, " ")
    .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_, n: string) => " ".repeat(Math.min(100, parseInt(n, 10))))
    .replace(/<text:tab\s*\/>/g, "\t")
    .replace(/<text:line-break\s*\/>/g, " ");
}

/** Splits a document into the body of each `tag` element, in order. */
function splitByTag(xml: string, tag: string): string[] {
  const parts = xml.split(new RegExp(`<${tag}[\\s>]`));
  return parts.slice(1);
}

function collapse(text: string): string {
  // Collapse every kind of horizontal whitespace, including the
  // non-breaking spaces Office documents are full of.
  return text.replace(/[^\S\n]+/g, " ").trim();
}
