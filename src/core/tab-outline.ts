/**
 * Tab outline — pure grouping of open tabs by host, for the side panel's
 * tree view. Sorting and grouping live here so the UI stays a thin renderer.
 */

export interface OutlineTab {
  id: number;
  title: string;
  url: string;
  /** Host without scheme, lowercase. */
  host: string;
  favicon?: string;
  /** Position within its window (kept from the source tab). */
  index: number;
  /** True when this is the active tab of its window. */
  active: boolean;
  /** True when Chrome has already discarded (suspended) it. */
  discarded: boolean;
  pinned: boolean;
  windowId?: number;
}

export interface OutlineGroup {
  host: string;
  /** Display label: the host, or a cleaned title when there's one tab. */
  label: string;
  tabs: OutlineTab[];
}

export interface TabOutline {
  groups: OutlineGroup[];
  totalTabs: number;
  /** Count of non-empty windows (for the header). */
  windows: number;
}

function hostOf(url: string | undefined): string {
  if (!url) return "chrome://";
  try {
    return new URL(url).hostname.toLowerCase() || "chrome://";
  } catch {
    return "other";
  }
}

function siteLabel(host: string, tab: OutlineTab): string {
  if (tab.title && tab.title.trim()) return tab.title.trim();
  return host;
}

/** Groups tabs by host (keeping each group in tab order) and sorts groups by size. */
export function buildTabOutline(tabs: Array<Partial<OutlineTab>>): TabOutline {
  const seen = new Map<number, OutlineTab>();
  for (const raw of tabs) {
    if (raw.id === undefined) continue;
    if (seen.has(raw.id)) continue; // dedupe
    const host = hostOf(raw.url);
    const tab: OutlineTab = {
      id: raw.id,
      title: raw.title ?? "",
      url: raw.url ?? "",
      host,
      index: raw.index ?? 0,
      active: Boolean(raw.active),
      discarded: Boolean(raw.discarded),
      pinned: Boolean(raw.pinned)
    };
    if (raw.favicon !== undefined) tab.favicon = raw.favicon;
    if (raw.windowId !== undefined) tab.windowId = raw.windowId;
    seen.set(raw.id, tab);
  }
  const byHost = new Map<string, OutlineTab[]>();
  for (const tab of seen.values()) {
    const list = byHost.get(tab.host) ?? [];
    list.push(tab);
    byHost.set(tab.host, list);
  }
  const groups: OutlineGroup[] = [...byHost.entries()]
    .map(([host, tabs]) => ({
      host,
      label: siteLabel(host, tabs[0]!),
      tabs: tabs.sort((a, b) => a.index - b.index)
    }))
    .sort((a, b) => b.tabs.length - a.tabs.length || a.host.localeCompare(b.host));
  const windows = new Set(seen.values().map((t) => t.windowId)).size;
  return { groups, totalTabs: seen.size, windows };
}

/** Filters outline groups to those whose host or any tab title matches. */
export function filterTabOutline(outline: TabOutline, query: string): TabOutline {
  const q = query.trim().toLowerCase();
  if (!q) return outline;
  const groups = outline.groups
    .map((g) => {
      if (g.host.includes(q)) return g;
      const matching = g.tabs.filter(
        (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
      );
      return matching.length > 0 ? { ...g, tabs: matching } : null;
    })
    .filter((g): g is OutlineGroup => g !== null);
  return { ...outline, groups };
}
