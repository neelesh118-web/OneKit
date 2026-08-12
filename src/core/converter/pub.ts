/**
 * Microsoft Publisher reader. Modern .pub files (2007+) are OOXML ZIP
 * packages whose text lives in the shared *:t run elements across the XML
 * parts; legacy binary Publisher files are OLE2 compound documents whose
 * body sits in the "Quill" stream. Both paths read as prose, exactly like
 * the other text-based document readers.
 */
import { unzipSync } from "fflate/browser";
import { decodeXmlText } from "./xml-text";
import { ole2DocumentText } from "./ole2";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(text: string, title: string): string {
  const paragraphs = text
    .split(/\s{2,}|\n+/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p)}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title></head><body><h1>${title}</h1>${paragraphs.join(
    "\n"
  )}</body></html>`;
}

/** Publisher document → HTML: OOXML zip or OLE2 text runs. */
export function pubToHtml(bytes: Uint8Array): string {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isZip) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error("This .pub file isn't a readable ZIP package.");
    }
    const parts = Object.keys(files).filter((name) => /\.xml$/i.test(name));
    if (parts.length === 0) throw new Error("This .pub package carries no XML parts.");
    const runs: string[] = [];
    for (const name of parts) {
      const xml = new TextDecoder("utf-8", { fatal: false }).decode(files[name]!);
      // Publisher shares the OOXML run model — any namespaced <x:t> element
      // (w:t, a:t, m:t and Publisher's own prefix) carries visible text.
      const run = /<[A-Za-z_][\w.-]*:t\b[^>]*>([^<]*)<\/[A-Za-z_][\w.-]*:t>/g;
      let match: RegExpExecArray | null;
      while ((match = run.exec(xml))) {
        const text = decodeXmlText(match[1]!).trim();
        if (text) runs.push(text);
      }
    }
    if (runs.length === 0) {
      throw new Error("Couldn't find readable text inside this .pub package.");
    }
    return wrap(runs.join(" "), "Publisher document");
  }
  // Legacy binary Publisher: the OLE2 compound document's body text.
  return wrap(ole2DocumentText(bytes, ".pub", ["Quill", "QuillText"]), "Publisher document");
}
