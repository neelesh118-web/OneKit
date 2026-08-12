/**
 * XPS (XML Paper Specification) reader. An .xps file is a ZIP package whose
 * pages live in the Documents folder under Pages as .fpage XML; the visible
 * text sits in <Glyphs> elements' UnicodeString attributes. The reader walks
 * every FixedPage and reassembles the strings page by page.
 *
 * Honest loss: layout, images and vector paths are dropped — the same rule
 * as every other text-based reader in this project. Pages that carry no
 * text still contribute their heading so the page count survives.
 */
import { unzipSync } from "fflate/browser";
import { decodeXmlText } from "./xml-text";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** XPS package → HTML document (one section per FixedPage). */
export function xpsToHtml(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This .xps file isn't a readable ZIP package.");
  }
  const pages = Object.keys(files)
    .filter((name) => /\.fpage$/i.test(name))
    .sort();
  if (pages.length === 0) {
    throw new Error("Couldn't find any FixedPage inside this .xps package.");
  }
  const sections = pages
    .map((name, index) => {
      const xml = new TextDecoder("utf-8", { fatal: false }).decode(files[name]!);
      const texts: string[] = [];
      const glyph = /<Glyphs\b[^>]*\bUnicodeString\s*=\s*"([^"]*)"/g;
      let match: RegExpExecArray | null;
      while ((match = glyph.exec(xml))) {
        const text = decodeXmlText(match[1]!).trim();
        if (text) texts.push(text);
      }
      const content = texts.length > 0 ? texts.map(escapeHtml).join(" ") : "<em>(no text on this page)</em>";
      return `<h2>Page ${index + 1}</h2><p>${content}</p>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>XPS document</title></head><body><h1>XPS document</h1>\n${sections}\n</body></html>`;
}
