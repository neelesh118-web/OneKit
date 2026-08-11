/**
 * RTF reading and writing. The reader walks the control-word stream and
 * keeps the text (with bold/italic/underline runs and paragraph breaks),
 * skipping the destinations that hold no readable prose — font and colour
 * tables, stylesheets, metadata, embedded pictures. The writer emits the
 * plain RTF that Word, Pages and LibreOffice all open.
 *
 * Layout, tables and embedded images aren't preserved — the text is.
 */

/** Destinations whose contents are markup, not readable text. */
const SKIPPED_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "listtable", "listoverridetable", "info",
  "pict", "object", "themedata", "colorschememapping", "latentstyles", "datastore",
  "generator", "xmlnstbl", "rsidtbl", "mmathPr", "wgrffmtfilter", "filetbl",
  "revtbl", "upr", "header", "footer", "headerl", "headerr", "headerf",
  "footerl", "footerr", "footerf", "footnote", "annotation", "bkmkstart", "bkmkend"
]);

/** Control words that produce whitespace rather than characters. */
const BREAKS: Record<string, string> = {
  par: "\n", line: "\n", sect: "\n\n", page: "\n\n", tab: "\t",
  cell: "\t", row: "\n", nestcell: "\t", nestrow: "\n"
};

/** Control symbols that stand in for a literal character. */
const SYMBOLS: Record<string, string> = {
  "\\": "\\", "{": "{", "}": "}", "~": " ", "-": "", _: "-",
  "\n": "\n", "\r": "\n"
};

/** cp1252's 0x80–0x9F range, which differs from latin-1. */
const CP1252_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

interface RtfState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Characters to skip after a \\uN escape (set by \\ucN). */
  skip: number;
  /** True inside a destination whose text we drop. */
  ignore: boolean;
}

interface RtfRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** True when the bytes look like an RTF document. */
export function isRtf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x7b && // {
    bytes[1] === 0x5c && // \
    bytes[2] === 0x72 && // r
    bytes[3] === 0x74 && // t
    bytes[4] === 0x66 //    f
  );
}

/** Splits an RTF document into styled runs, honouring group scoping. */
function parseRtf(rtf: string): RtfRun[] {
  const runs: RtfRun[] = [];
  const stack: RtfState[] = [];
  let state: RtfState = { bold: false, italic: false, underline: false, skip: 1, ignore: false };
  let pending = "";

  const flush = (): void => {
    if (!pending) return;
    runs.push({ text: pending, bold: state.bold, italic: state.italic, underline: state.underline });
    pending = "";
  };
  const emit = (text: string): void => {
    if (!state.ignore) pending += text;
  };

  let i = 0;
  while (i < rtf.length) {
    const c = rtf[i]!;
    if (c === "{") {
      flush();
      stack.push({ ...state });
      i++;
      continue;
    }
    if (c === "}") {
      flush();
      const restored = stack.pop();
      if (restored) state = restored;
      i++;
      continue;
    }
    if (c !== "\\") {
      // Literal newlines in the source aren't content; RTF uses \par.
      if (c !== "\n" && c !== "\r") emit(c);
      i++;
      continue;
    }

    // Control symbol or control word.
    const next = rtf[i + 1];
    if (next === undefined) break;
    if (next === "*") {
      // \\*\\destination — an extension group nothing needs to read.
      state.ignore = true;
      i += 2;
      continue;
    }
    if (next === "'") {
      const hex = rtf.slice(i + 2, i + 4);
      const code = parseInt(hex, 16);
      if (!Number.isNaN(code)) {
        emit(code >= 0x80 && code <= 0x9f ? CP1252_HIGH[code - 0x80]! : String.fromCharCode(code));
      }
      i += 4;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      const symbol = SYMBOLS[next];
      if (symbol !== undefined) emit(symbol);
      i += 2;
      continue;
    }

    const match = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1));
    if (!match) {
      i++;
      continue;
    }
    const word = match[1]!;
    const param = match[2] === undefined ? undefined : parseInt(match[2], 10);
    i += 1 + match[0].length;

    if (SKIPPED_DESTINATIONS.has(word)) {
      state.ignore = true;
      continue;
    }
    const brk = BREAKS[word];
    if (brk !== undefined) {
      flush();
      emit(brk);
      flush();
      continue;
    }
    if (word === "u" && param !== undefined) {
      // \\uN is followed by `skip` fallback characters for old readers.
      emit(String.fromCodePoint(param < 0 ? param + 65536 : param));
      let skipped = 0;
      while (skipped < state.skip && i < rtf.length) {
        if (rtf[i] === "\\" && rtf[i + 1] === "'") i += 4;
        else if (rtf[i] === "{" || rtf[i] === "}") break;
        else i += 1;
        skipped++;
      }
      continue;
    }
    if (word === "uc" && param !== undefined) {
      state.skip = Math.max(0, param);
      continue;
    }
    if (word === "b" || word === "i" || word === "ul") {
      flush();
      const on = param !== 0;
      if (word === "b") state.bold = on;
      else if (word === "i") state.italic = on;
      else state.underline = on;
      continue;
    }
    if (word === "ulnone") {
      flush();
      state.underline = false;
      continue;
    }
    if (word === "plain") {
      flush();
      state.bold = false;
      state.italic = false;
      state.underline = false;
      continue;
    }
    // Every other control word is formatting we don't render.
  }
  flush();
  return runs;
}

/** RTF → plain text. */
export function rtfToText(rtf: string): string {
  if (!rtf.trimStart().startsWith("{\\rtf")) {
    throw new Error("This doesn't look like an RTF document.");
  }
  return parseRtf(rtf)
    .map((r) => r.text)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** RTF → HTML, keeping paragraphs and bold/italic/underline runs. */
export function rtfToHtml(rtf: string): string {
  if (!rtf.trimStart().startsWith("{\\rtf")) {
    throw new Error("This doesn't look like an RTF document.");
  }
  const runs = parseRtf(rtf);
  const paragraphs: string[] = [];
  let current = "";
  for (const run of runs) {
    const pieces = run.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) {
        paragraphs.push(current);
        current = "";
      }
      if (!piece) return;
      let html = escapeHtml(piece).replace(/\t/g, "&#9;");
      if (run.bold) html = `<strong>${html}</strong>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.underline) html = `<u>${html}</u>`;
      current += html;
    });
  }
  paragraphs.push(current);
  const body = paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>RTF document</title></head>\n<body>\n${body || "<p></p>"}\n</body>\n</html>`;
}

/** Escapes text for an RTF body: braces, backslashes and non-ASCII. */
function escapeRtf(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") out += `\\${ch}`;
    else if (ch === "\t") out += "\\tab ";
    else if (code < 128) out += ch;
    else if (code <= 0xffff) out += `\\u${code}?`;
    else {
      // Astral characters go out as a surrogate pair, which is what RTF's
      // 16-bit \\u escape can carry.
      const v = code - 0x10000;
      out += `\\u${0xd800 + (v >> 10)}?\\u${0xdc00 + (v & 0x3ff)}?`;
    }
  }
  return out;
}

/** Plain text → RTF (one paragraph per line). */
export function textToRtf(text: string): string {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const body = paragraphs.map((p) => `\\pard ${escapeRtf(p)}\\par`).join("\n");
  return (
    "{\\rtf1\\ansi\\ansicpg1252\\deff0\n" +
    "{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}\n" +
    "\\f0\\fs22\n" +
    `${body}\n}`
  );
}
