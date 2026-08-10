/**
 * Tab tools — duplicate-tab grouping and tab finder filtering.
 * Pure functions over a minimal TabLike shape so both the popup and tests
 * can use them without touching chrome.tabs.
 */

export interface TabLike {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  pinned?: boolean;
  windowId?: number;
  index?: number;
}

/** Normalizes a URL for duplicate grouping: strips fragment + trailing slash. */
export function normalizeTabUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    let out = parsed.origin + parsed.pathname;
    if (parsed.search) out += parsed.search;
    // chrome://newtab/ and friends should not be treated as duplicates of
    // real pages — they normalize to "" via the scheme check above.
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return "";
  }
}

/**
 * Groups tabs that share a normalized URL. Only groups with 2+ members are
 * returned, ordered by the first tab's window/index.
 */
export function groupDuplicateTabs(tabs: TabLike[]): TabLike[][] {
  const byUrl = new Map<string, TabLike[]>();
  for (const tab of tabs) {
    const key = normalizeTabUrl(tab.url);
    if (!key) continue;
    const group = byUrl.get(key) ?? [];
    group.push(tab);
    byUrl.set(key, group);
  }
  const groups = [...byUrl.values()].filter((g) => g.length >= 2);
  const sortKey = (t: TabLike) => (t.windowId ?? 0) * 100000 + (t.index ?? 0);
  for (const g of groups) g.sort((a, b) => sortKey(a) - sortKey(b));
  groups.sort((a, b) => sortKey(a[0]!) - sortKey(b[0]!));
  return groups;
}

/** IDs of the duplicate tabs to close (keeps the first/leftmost in each group). */
export function duplicateTabIdsToClose(groups: TabLike[][]): number[] {
  const ids: number[] = [];
  for (const group of groups) {
    const [, ...rest] = group;
    for (const tab of rest) {
      if (tab.id !== undefined) ids.push(tab.id);
    }
  }
  return ids;
}

/** Case-insensitive substring filter over title + url. */
export function filterTabs(tabs: TabLike[], query: string): TabLike[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter((t) => {
    const title = (t.title ?? "").toLowerCase();
    const url = (t.url ?? "").toLowerCase();
    return title.includes(q) || url.includes(q);
  });
}

export function sortTabsByPosition(tabs: TabLike[]): TabLike[] {
  return [...tabs].sort(
    (a, b) =>
      (a.windowId ?? 0) * 100000 + (a.index ?? 0) - ((b.windowId ?? 0) * 100000 + (b.index ?? 0))
  );
}
