/**
 * Prose readers added in round 17: Scribus documents (SLA zip packages),
 * Xfig vector drawings and HPGL plotter files (PLT). All three are drawing
 * formats whose text records read as prose — the same rule the SWF, WPD
 * and metafile sources follow — so the full document target set is honest.
 */
import { unzipToFiles } from "./archives";
import { escapeXml, xmlFragmentText } from "./xml-text";

/**
 * Scribus (SLA) → HTML. A Scribus document is a zip whose document.xml
 * holds every frame's text in <ITEXT CH="…"/> attributes; paragraphs are
 * imperfect to reconstruct, so the story text reads as plain paragraphs.
 */
export function slaToHtml(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipToFiles(bytes);
  } catch {
    throw new Error("Could not read this Scribus file — it may be corrupt.");
  }
  const doc = files["document.xml"];
  if (!doc) throw new Error("This Scribus file has no document.xml — it may not be a valid SLA.");
  const xml = new TextDecoder().decode(doc);
  const texts: string[] = [];
  for (const m of xml.matchAll(/<ITEXT\b([^>]*)\/?>/g)) {
    const ch = /CH="([^"]*)"/.exec(m[1]!)?.[1] ?? "";
    if (ch) texts.push(ch);
  }
  if (texts.length === 0) throw new Error("No text found in this Scribus document.");
  return (
    `<!doctype html>\n<html><head><meta charset="utf-8"><title>Scribus document</title></head>\n` +
    `<body>\n${texts.map((t) => `<p>${escapeXml(xmlFragmentText(t))}</p>`).join("\n")}\n</body>\n</html>`
  );
}

/**
 * Xfig (.fig) → text. Xfig is an ASCII drawing format; every text object's
 * payload is terminated by the \x01 control character, so collecting those
 * segments recovers the document text.
 */
export function figToText(text: string): string {
  const segments: string[] = [];
  for (const m of text.matchAll(/([^\n\x01]*)\x01/g)) {
    const seg = (m[1] ?? "").trim();
    if (seg) segments.push(seg);
  }
  return segments.join("\n");
}

/**
 * HPGL plotter (PLT) → text. LB (label) commands carry the text up to the
 * terminator character (default \x03); the HPGL control codes \x01–\x04
 * are dropped.
 */
export function pltToText(text: string): string {
  const labels: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const lb = text.indexOf("LB", pos);
    if (lb < 0) break;
    let end = lb + 2;
    const chars: string[] = [];
    while (end < text.length) {
      const code = text.charCodeAt(end);
      if (code === 0x03 || code === 0x1a || code === 0x0a) break;
      if (code >= 1 && code <= 4) {
        end += 1;
        continue;
      }
      chars.push(text[end]!);
      end += 1;
    }
    const label = chars.join("").trim();
    if (label) labels.push(label);
    pos = end + 1;
  }
  return labels.join("\n");
}
