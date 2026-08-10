/**
 * Highlight exporter — page highlights as a readable Markdown document.
 *
 * Highlights are saved per-URL; this groups them by page and renders a
 * Markdown file (with page titles as headings) so a research session can
 * become a document you keep anywhere. Pure local formatting.
 */

export interface HighlightLike {
  id: string;
  url: string;
  text: string;
  color: string;
  createdAt: number;
}

export interface PageGroup {
  url: string;
  title: string;
  highlights: HighlightLike[];
}

/** Groups highlights by URL, most-recent page first. */
export function groupByPage(highlights: HighlightLike[], titles?: Record<string, string>): PageGroup[] {
  const byUrl = new Map<string, HighlightLike[]>();
  for (const h of highlights) {
    const list = byUrl.get(h.url) ?? [];
    list.push(h);
    byUrl.set(h.url, list);
  }
  return [...byUrl.entries()]
    .map(([url, list]) => ({
      url,
      title: titles?.[url] ?? url,
      highlights: list.sort((a, b) => b.createdAt - a.createdAt)
    }))
    .sort((a, b) => b.highlights[0]!.createdAt - a.highlights[0]!.createdAt);
}

/** Renders grouped highlights as Markdown. */
export function highlightsToMarkdown(groups: PageGroup[]): string {
  const parts: string[] = ["# Highlights", ""];
  for (const group of groups) {
    parts.push(`## ${group.title}`, "");
    parts.push(`_Source: ${group.url}_`, "");
    for (const h of group.highlights) {
      parts.push(`> ${h.text.replace(/\n+/g, " ")}`, "");
    }
  }
  if (groups.length === 0) parts.push("_No highlights yet — select text on any page and choose OneKit → Highlight._", "");
  return parts.join("\n").trimEnd() + "\n";
}

/** Compact stats line used by the popup. */
export function highlightStats(groups: PageGroup[]): { pages: number; total: number } {
  return {
    pages: groups.length,
    total: groups.reduce((sum, g) => sum + g.highlights.length, 0)
  };
}

/** Default filename for the export. */
export function highlightExportFilename(now = new Date()): string {
  return `onekit-highlights-${now.toISOString().slice(0, 10)}.md`;
}
