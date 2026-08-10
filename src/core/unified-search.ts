/**
 * Unified search — ONE query across every OneKit store: page history,
 * AI chats, open tabs, form drafts, clipboard. Pure orchestration over
 * injected providers, so the Ctrl+Shift+K palette (content script), the
 * popup, and tests all share the same logic.
 */

export type SearchAction =
  | { kind: "open-url"; url: string }
  | { kind: "activate-tab"; tabId: number }
  | { kind: "copy"; text: string };

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  action: SearchAction;
}

export interface SearchGroup {
  id: string;
  label: string;
  results: SearchResult[];
}

export interface UnifiedSearchProviders {
  history(query: string): Promise<SearchResult[]>;
  chats(query: string): Promise<SearchResult[]>;
  tabs(query: string): Promise<SearchResult[]>;
  drafts(query: string): Promise<SearchResult[]>;
  clipboard(query: string): Promise<SearchResult[]>;
}

export const GROUP_LIMITS: Record<string, number> = {
  history: 8,
  chats: 6,
  tabs: 8,
  drafts: 6,
  clipboard: 6
};

export const GROUP_LABELS: Record<string, string> = {
  history: "Pages you've visited",
  chats: "AI chats",
  tabs: "Open tabs",
  drafts: "Form drafts",
  clipboard: "Clipboard history"
};

/** Runs every provider in parallel, filters empty groups, caps each. */
export async function unifiedSearch(
  query: string,
  providers: UnifiedSearchProviders
): Promise<SearchGroup[]> {
  const q = query.trim();
  if (!q) return [];
  const [history, chats, tabs, drafts, clipboard] = await Promise.all([
    providers.history(q),
    providers.chats(q),
    providers.tabs(q),
    providers.drafts(q),
    providers.clipboard(q)
  ]);
  const groups: SearchGroup[] = [];
  const entries: Array<[string, SearchResult[]]> = [
    ["history", history],
    ["chats", chats],
    ["tabs", tabs],
    ["drafts", drafts],
    ["clipboard", clipboard]
  ];
  for (const [id, results] of entries) {
    const capped = results.slice(0, GROUP_LIMITS[id] ?? 8);
    if (capped.length === 0) continue;
    groups.push({ id, label: GROUP_LABELS[id] ?? id, results: capped });
  }
  return groups;
}
