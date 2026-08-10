/**
 * Unified search — ONE query across every OneKit store: page history,
 * AI chats, open tabs, form drafts, clipboard, read-later, highlights,
 * workspaces, focus rules, screen time, and the tool launcher. Pure
 * orchestration over injected providers, so the Ctrl+Shift+K palette
 * (content script), the popup, and tests all share the same logic.
 */

export type SearchAction =
  | { kind: "open-url"; url: string }
  | { kind: "activate-tab"; tabId: number }
  | { kind: "copy"; text: string }
  /** Opens the OneKit popup (falls back to a hint where unsupported). */
  | { kind: "open-popup"; toolId: string };

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
  saved(query: string): Promise<SearchResult[]>;
  screenTime(query: string): Promise<SearchResult[]>;
  tools(query: string): Promise<SearchResult[]>;
}

export const GROUP_ORDER = [
  "history",
  "saved",
  "chats",
  "tabs",
  "drafts",
  "clipboard",
  "screenTime",
  "tools"
] as const;

export const GROUP_LIMITS: Record<string, number> = {
  history: 6,
  saved: 6,
  chats: 6,
  tabs: 8,
  drafts: 5,
  clipboard: 5,
  screenTime: 5,
  tools: 8
};

export const GROUP_LABELS: Record<string, string> = {
  history: "Pages you've visited",
  saved: "Saved items",
  chats: "AI chats",
  tabs: "Open tabs",
  drafts: "Form drafts",
  clipboard: "Clipboard history",
  screenTime: "Screen time",
  tools: "Tools"
};

/** Runs every provider in parallel, filters empty groups, caps each. */
export async function unifiedSearch(
  query: string,
  providers: UnifiedSearchProviders
): Promise<SearchGroup[]> {
  const q = query.trim();
  if (!q) return [];
  const results = await Promise.all([
    providers.history(q),
    providers.saved(q),
    providers.chats(q),
    providers.tabs(q),
    providers.drafts(q),
    providers.clipboard(q),
    providers.screenTime(q),
    providers.tools(q)
  ]);
  const groups: SearchGroup[] = [];
  GROUP_ORDER.forEach((id, index) => {
    const capped = results[index]!.slice(0, GROUP_LIMITS[id] ?? 8);
    if (capped.length === 0) return;
    groups.push({ id, label: GROUP_LABELS[id] ?? id, results: capped });
  });
  return groups;
}
