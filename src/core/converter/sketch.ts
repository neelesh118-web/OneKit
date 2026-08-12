/**
 * Classic Sketch / sK1 vector drawing reader. sK1 files are plain text:
 * sections like [PageLayout] / [Document] hold object records ("e Type …
 *") — rectangles, ellipses, lines and quoted text strings. This reader
 * renders the basic shape records to SVG, extracts every quoted string as
 * text, and falls back to plain-text extraction when a file doesn't parse
 * as Sketch — so a real sK1 file always converts honestly, and an
 * unrelated text file never produces a fabricated drawing.
 */
import { textToSvg } from "./documents";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface SketchContent {
  shapes: string[];
  texts: string[];
  width: number;
  height: number;
  looksLikeSketch: boolean;
}

function looksLikeSketch(text: string): boolean {
  return (
    /^#sK1\b/i.test(text) ||
    (/^\[(PageLayout|Document|Content)\]/m.test(text) && /^e\s+\w+/m.test(text))
  );
}

/** Parse the object records and quoted strings of a Sketch/sK1 text file. */
function parseSketch(text: string): SketchContent {
  const shapes: string[] = [];
  const texts: string[] = [];
  let width = 595;
  let height = 842;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("e ")) continue;
    const parts = line.split(/\s+/);
    const kind = parts[1] ?? "";
    const nums = parts
      .slice(2)
      .map((p) => Number(p))
      .filter((n) => !Number.isNaN(n));
    switch (kind) {
      case "Page":
        // "e Page x y w h" — the last two numbers are the sheet size.
        if (nums.length >= 4 && nums[2]! > 0 && nums[3]! > 0) {
          width = nums[2]!;
          height = nums[3]!;
        }
        break;
      case "Rectangle":
        if (nums.length >= 4) {
          const [x1, y1, x2, y2] = nums as [number, number, number, number];
          shapes.push(
            `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" fill="none" stroke="#000000"/>`
          );
        }
        break;
      case "Ellipse":
        if (nums.length >= 4) {
          const [x1, y1, x2, y2] = nums as [number, number, number, number];
          shapes.push(
            `<ellipse cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${Math.abs(x2 - x1) / 2}" ry="${Math.abs(y2 - y1) / 2}" fill="none" stroke="#000000"/>`
          );
        }
        break;
      case "Line":
        if (nums.length >= 4) {
          const [x1, y1, x2, y2] = nums as [number, number, number, number];
          shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000000" fill="none"/>`);
        }
        break;
      default:
        // Curves, paths, groups and other records contribute no shape here.
        break;
    }
  }
  const quote = /"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = quote.exec(text))) {
    const value = match[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
    if (value) texts.push(value);
  }
  return { shapes, texts, width, height, looksLikeSketch: looksLikeSketch(text) };
}

/** Sketch/sK1 → HTML: text objects as paragraphs, plain-text fallback. */
export function skToHtml(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const parsed = parseSketch(text);
  if (!parsed.looksLikeSketch && parsed.texts.length === 0) {
    const body = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join("\n");
    return `<!doctype html><html><head><meta charset="utf-8"/><title>sK1 drawing</title></head><body><h1>sK1 drawing</h1>${body}</body></html>`;
  }
  const body = parsed.texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>sK1 drawing</title></head><body><h1>sK1 drawing</h1>${body}</body></html>`;
}

/** Sketch/sK1 → SVG: the parsed shapes and text objects. */
export function skToSvg(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const parsed = parseSketch(text);
  if (!parsed.looksLikeSketch && parsed.shapes.length === 0 && parsed.texts.length === 0) {
    // Not a Sketch file at all — render the plain text like every other
    // text-based source renders to an image.
    return new TextDecoder().decode(textToSvg(text));
  }
  const texts = parsed.texts.map(
    (t, i) => `<text x="20" y="${40 + i * 18}" font-size="14" fill="#000000">${escapeHtml(t)}</text>`
  );
  const body = [...parsed.shapes, ...texts].join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${parsed.width} ${parsed.height}" width="${parsed.width}" height="${parsed.height}">\n${body}\n</svg>`;
}
