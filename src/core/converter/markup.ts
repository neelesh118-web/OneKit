/** Lightweight, local readers for text-based publishing formats. */

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
