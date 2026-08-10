/**
 * Text utilities — word/character counting and plain-text conversion used by
 * the word counter, paste cleaner, and history indexing.
 */

export interface TextStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  lines: number;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function countChars(text: string): number {
  return [...text].length;
}

export function countCharsNoSpaces(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

export function textStats(text: string): TextStats {
  return {
    words: countWords(text),
    chars: countChars(text),
    charsNoSpaces: countCharsNoSpaces(text),
    lines: countLines(text)
  };
}

/**
 * Converts an HTML fragment to plain text (used by the paste cleaner's
 * "what would this be" preview and by history indexing of rich text).
 * DOM-based so it decodes entities correctly; falls back to regex stripping
 * when no DOM is available.
 */
export function htmlToPlainText(html: string): string {
  if (typeof document !== "undefined") {
    const template = document.createElement("template");
    template.innerHTML = html;
    return (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
