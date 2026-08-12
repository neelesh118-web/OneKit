/** Lightweight, local readers for text-based publishing formats. */
import { gunzipSync, strFromU8 } from "fflate/browser";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requireText(text: string, format: string): void {
  if (text.includes("\0")) throw new Error(`Could not read this ${format} file - it contains binary data.`);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

function xmlText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/** AbiWord XML -> semantic HTML paragraphs and headings. */
export function abwToHtml(abw: string): string {
  requireText(abw, "AbiWord");
  if (!/<abiword[\s>]/i.test(abw)) throw new Error("This .abw file is not a valid AbiWord XML document.");
  const blocks: string[] = [];
  for (const match of abw.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const text = xmlText(match[2]!);
    if (!text) continue;
    const props = match[1] ?? "";
    const heading = /(?:style|props)=["'][^"']*(?:heading|title)[^"']*["']/i.test(props);
    blocks.push(heading ? `<h2>${escapeHtml(text)}</h2>` : `<p>${escapeHtml(text)}</p>`);
  }
  if (!blocks.length) throw new Error("This .abw file contains no readable document text.");
  return `<!doctype html><html><head><meta charset="utf-8"><title>AbiWord document</title></head><body>\n${blocks.join("\n")}\n</body></html>`;
}

/** Compressed AbiWord (.zabw) -> semantic HTML. */
export function zabwToHtml(bytes: Uint8Array): string {
  let xml: string;
  try {
    xml = strFromU8(gunzipSync(bytes));
  } catch {
    throw new Error("Could not read this .zabw file - it is not a valid gzip-compressed AbiWord document.");
  }
  return abwToHtml(xml);
}

/** Open eBook source document -> HTML. Package manifests without embedded prose fail honestly. */
export function oebToHtml(oeb: string): string {
  requireText(oeb, "Open eBook");
  if (/<!doctype\s+html|<html[\s>]/i.test(oeb)) return oeb;
  if (!/<(?:package|oeb|body)[\s>]/i.test(oeb)) throw new Error("This .oeb file is not valid Open eBook markup.");
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(oeb)?.[1];
  if (!body || !xmlText(body)) {
    throw new Error("This .oeb package contains no embedded readable book content.");
  }
  const rendered = body
    .replace(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi, (_m, text) => `<h1>${escapeHtml(xmlText(text))}</h1>`)
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, text) => `<p>${escapeHtml(xmlText(text))}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Open eBook</title></head><body>\n${rendered}\n</body></html>`;
}

/** Palm Markup Language -> readable HTML for chapters, paragraphs and inline emphasis. */
export function pmlToHtml(pml: string): string {
  requireText(pml, "Palm Markup Language");
  if (!/\\[xpnbir]/i.test(pml)) throw new Error("This .pml file contains no recognizable Palm markup.");
  let body = escapeHtml(pml.replace(/\r\n/g, "\n"));
  body = body
    .replace(/\\x\s*([^\n]+)/g, "<h1>$1</h1>")
    .replace(/\\p/g, "</p><p>")
    .replace(/\\n/g, "<br>")
    .replace(/\\b([\s\S]*?)\\b/g, "<strong>$1</strong>")
    .replace(/\\i([\s\S]*?)\\i/g, "<em>$1</em>")
    .replace(/\\c([\s\S]*?)\\c/g, '<div style="text-align:center">$1</div>')
    .replace(/\\[a-z](?:=[^\\\s]+)?/gi, "")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Palm book</title></head><body><p>${body}</p></body></html>`;
}

function inlineRst(text: string): string {
  return escapeHtml(text)
    .replace(/``([^`]+)``/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`<]+)\s*&lt;([^>]+)&gt;`_/g, '<a href="$2">$1</a>');
}

/** reStructuredText -> semantic HTML for headings, lists, code and prose. */
export function rstToHtml(rst: string): string {
  requireText(rst, "reStructuredText");
  const lines = rst.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: "ul" | "ol" | null = null;
  let literal = false;

  const flushParagraph = (): void => {
    if (paragraph.length) out.push(`<p>${inlineRst(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = (): void => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1] ?? "";
    if (literal) {
      if (/^\s+/.test(line) || line === "") {
        if (line) out.push(escapeHtml(line.replace(/^\s{1,4}/, "")) + "\n");
        continue;
      }
      out.push("</code></pre>");
      literal = false;
    }
    if (line.trim() && /^[=\-~^"`:#*+]{3,}\s*$/.test(next) && next.trim().length >= line.trim().length) {
      flushParagraph(); closeList();
      const level = next.trim()[0] === "=" ? 1 : 2;
      out.push(`<h${level}>${inlineRst(line.trim())}</h${level}>`);
      i += 1;
      continue;
    }
    const item = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (item) {
      flushParagraph();
      const wanted = /^\d/.test(item[1]!) ? "ol" : "ul";
      if (list !== wanted) { closeList(); list = wanted; out.push(`<${wanted}>`); }
      out.push(`<li>${inlineRst(item[2]!)}</li>`);
      continue;
    }
    if (/^\s*\.\.\s+code(-block)?::/.test(line) || paragraph.at(-1)?.endsWith("::")) {
      flushParagraph(); closeList(); out.push("<pre><code>"); literal = true; continue;
    }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  if (literal) out.push("</code></pre>");
  return `<!doctype html><html><head><meta charset="utf-8"><title>reStructuredText</title></head><body>\n${out.join("\n")}\n</body></html>`;
}

function latexPlain(text: string): string {
  return text
    .replace(/%.*$/gm, "")
    .replace(/\\(begin|end)\{[^}]+\}/g, "\n")
    .replace(/\\item\s*/g, "• ")
    .replace(/\\(?:textbf|textit|emph|texttt)\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:label|cite|ref|pageref)\{([^{}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** LaTeX/TeX -> semantic HTML while preserving readable authored content. */
export function texToHtml(tex: string): string {
  requireText(tex, "TeX");
  const source = tex.replace(/%.*$/gm, "");
  const bodyMatch = source.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  let body = bodyMatch?.[1] ?? source;
  body = body
    .replace(/\\(section|subsection|subsubsection|chapter)\*?\{([^{}]*)\}/g, (_m, kind, title) => {
      const level = kind === "chapter" || kind === "section" ? 1 : kind === "subsection" ? 2 : 3;
      return `\n<h${level}>${escapeHtml(title)}</h${level}>\n`;
    })
    .replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>")
    .replace(/\\(?:textit|emph)\{([^{}]*)\}/g, "<em>$1</em>")
    .replace(/\\texttt\{([^{}]*)\}/g, "<code>$1</code>");
  const chunks = body.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  const html = chunks.map((chunk) => {
    if (/^<h[1-3]>/.test(chunk)) return chunk;
    return `<p>${escapeHtml(latexPlain(chunk))}</p>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>TeX document</title></head><body>\n${html}\n</body></html>`;
}
