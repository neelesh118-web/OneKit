/**
 * Copy as Markdown + link extractor — pure functions for turning links,
 * selections, and tab lists into Markdown, and pulling every link out of a
 * page. All local; the content script feeds the DOM, this module formats.
 */

/** `[title](url)` with a fallback when the title is empty. */
export function linkToMarkdown(title: string, url: string): string {
  const safeTitle = title.trim() || url;
  // Escape brackets so a title with `]` can't break the Markdown.
  const escaped = safeTitle.replace(/\]/g, "\\]");
  return `[${escaped}](${url})`;
}

/** A selection becomes a bullet list of trimmed lines. */
export function selectionToMarkdown(selection: string): string {
  const lines = selection
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0]!;
  return lines.map((l) => `- ${l}`).join("\n");
}

/** One tab per line as Markdown links. */
export function tabsToMarkdown(tabs: Array<{ title?: string; url?: string }>): string {
  const lines: string[] = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    try {
      const parsed = new URL(tab.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    lines.push(linkToMarkdown(tab.title ?? tab.url, tab.url));
  }
  return lines.join("\n");
}

export interface LinkEntry {
  href: string;
  text: string;
}

/**
 * Extracts http(s) links from a page's anchors, deduped, keeping the first
 * text seen for each href. Feed it an iterator of { href, text } pairs from
 * the DOM (or a serialized copy) so the module stays DOM-free.
 */
export function extractLinks(anchors: Array<{ href?: string; text?: string }>): LinkEntry[] {
  const seen = new Set<string>();
  const out: LinkEntry[] = [];
  for (const anchor of anchors) {
    if (!anchor.href) continue;
    let parsed: URL;
    try {
      parsed = new URL(anchor.href);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const href = parsed.href;
    if (seen.has(href)) continue;
    seen.add(href);
    const text = (anchor.text ?? "").trim().slice(0, 120) || href;
    out.push({ href, text });
  }
  return out;
}

/** All extracted links as one Markdown bullet list. */
export function linksToMarkdown(links: LinkEntry[]): string {
  return links.map((l) => `- ${linkToMarkdown(l.text, l.href)}`).join("\n");
}
