/**
 * Hangul Word Processor reader. Modern .hwpx files (and .hwp files saved in
 * the newer OOXML-like packaging) are ZIP packages whose text lives in
 * HWPML XML parts (Contents/content.hpml etc.) as <hp:t> run elements.
 * Legacy binary .hwp files are a proprietary compound format that can't be
 * read without the full HWP engine — the honest answer is an error for
 * those, never a mangled file.
 */
import { unzipSync } from "fflate/browser";
import { decodeXmlText } from "./xml-text";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HWPX/HWP ZIP package → HTML: the paragraph text. */
export function hwpxToHtml(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This .hwpx/.hwp file isn't a readable ZIP package.");
  }
  const parts = Object.keys(files).filter((name) => /\.(hpml|hml|xml)$/i.test(name));
  if (parts.length === 0) throw new Error("This .hwpx package carries no HWPML parts.");
  const runs: string[] = [];
  for (const name of parts) {
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(files[name]!);
    // HWPML text runs are <hp:t> (and the shared OOXML *:t forms).
    const run = /<[A-Za-z_][\w.-]*:t\b[^>]*>([^<]*)<\/[A-Za-z_][\w.-]*:t>/g;
    let match: RegExpExecArray | null;
    while ((match = run.exec(xml))) {
      const text = decodeXmlText(match[1]!).trim();
      if (text) runs.push(text);
    }
  }
  if (runs.length === 0) {
    throw new Error("Couldn't find readable text inside this .hwpx/.hwp package.");
  }
  const body = runs.map((r) => `<p>${escapeHtml(r)}</p>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>HWP document</title></head><body><h1>HWP document</h1>${body}</body></html>`;
}
