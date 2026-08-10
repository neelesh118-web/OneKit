/**
 * Page table of contents — a sticky outline for long articles.
 *
 * "Where's the outline of this page?" is a recurring reader complaint on
 * sites without their own TOC. This scans the page's headings (h1–h4),
 * builds an outline, and the content script renders it as a floating
 * sidebar with click-to-scroll. Pure DOM walking + math here; no network.
 */

export interface TocEntry {
  level: number;
  text: string;
  id: string;
  index: number;
}

/** Headings in document order with stable ids (skip hidden/empty ones). */
export function extractToc(root: ParentNode): TocEntry[] {
  const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4"));
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();
  for (const heading of headings) {
    const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    // Hidden: offsetParent is null for display:none (and in jsdom, where
    // layout is never computed, the computed style is the reliable signal).
    if (heading.offsetParent === null && getComputedStyle(heading).display === "none") continue;
    const level = Number(heading.tagName.slice(1));
    // Stable id: use existing id or derive one, de-duplicated.
    let id = heading.id;
    if (!id) {
      const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      id = count === 0 ? base : `${base}-${count}`;
    }
    entries.push({ level, text, id, index: entries.length });
  }
  return entries;
}

/** Indentation depth per entry relative to the shallowest level (for CSS). */
export function tocIndent(entries: TocEntry[]): number[] {
  if (entries.length === 0) return [];
  const minLevel = Math.min(...entries.map((e) => e.level));
  return entries.map((e) => Math.max(0, Math.min(3, e.level - minLevel)));
}

/** Renders the TOC as a nested Markdown list (useful for export/copy). */
export function tocToMarkdown(entries: TocEntry[]): string {
  if (entries.length === 0) return "_No headings found on this page._";
  return entries.map((e) => `${"  ".repeat(e.level - 1)}- ${e.text}`).join("\n");
}

export function tocStats(entries: TocEntry[]): { headings: number; deepestLevel: number } {
  if (entries.length === 0) return { headings: 0, deepestLevel: 0 };
  return { headings: entries.length, deepestLevel: Math.max(...entries.map((e) => e.level)) };
}
