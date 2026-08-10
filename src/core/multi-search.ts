/**
 * Multi-search — one query, several engines, all opened locally.
 * No API keys, no network beyond the tabs the user asked for.
 */

export interface SearchEngine {
  id: string;
  label: string;
  /** Template with {q} for the URL-encoded query. */
  url: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: "google", label: "Google", url: "https://www.google.com/search?q={q}" },
  { id: "bing", label: "Bing", url: "https://www.bing.com/search?q={q}" },
  { id: "duckduckgo", label: "DuckDuckGo", url: "https://duckduckgo.com/?q={q}" },
  { id: "youtube", label: "YouTube", url: "https://www.youtube.com/results?search_query={q}" },
  { id: "wikipedia", label: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search={q}" },
  { id: "perplexity", label: "Perplexity", url: "https://www.perplexity.ai/search?q={q}" },
  { id: "github", label: "GitHub", url: "https://github.com/search?q={q}&type=repositories" },
  { id: "reddit", label: "Reddit", url: "https://www.reddit.com/search/?q={q}" }
];

export function searchUrl(engineId: string, query: string): string | null {
  const engine = SEARCH_ENGINES.find((e) => e.id === engineId);
  if (!engine) return null;
  const q = encodeURIComponent(query.trim());
  if (!q) return null;
  return engine.url.replace("{q}", q);
}

export function searchUrls(engineIds: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  return engineIds.map((id) => searchUrl(id, q)).filter((u): u is string => u !== null);
}
