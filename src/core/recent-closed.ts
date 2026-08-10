/**
 * Recently closed tabs — the browser's session history surfaced as a
 * simple reopen list. Pure filtering over the sessions API's shape.
 */

export interface RecentlyClosedTabLike {
  sessionId?: string;
  url?: string;
  title?: string;
  lastModified?: number;
  windowId?: number;
  tabId?: number;
}

/** Raw session entry from browser.sessions.getRecentlyClosed. */
export interface SessionLike {
  tab?: { sessionId?: string; url?: string; title?: string; lastModified?: number; windowId?: number; id?: number };
  window?: unknown;
}

/** Normalizes raw sessions into tab entries (windows ignored, deduped). */
export function recentClosedTabs(sessions: SessionLike[], max = 15): RecentlyClosedTabLike[] {
  const seen = new Set<string>();
  const out: RecentlyClosedTabLike[] = [];
  for (const session of sessions) {
    const tab = session.tab;
    if (!tab?.url || !tab.sessionId) continue;
    if (seen.has(tab.sessionId)) continue;
    seen.add(tab.sessionId);
    const entry: RecentlyClosedTabLike = {
      sessionId: tab.sessionId,
      url: tab.url,
      title: tab.title || tab.url
    };
    if (tab.lastModified !== undefined) entry.lastModified = tab.lastModified;
    if (tab.windowId !== undefined) entry.windowId = tab.windowId;
    if (tab.id !== undefined) entry.tabId = tab.id;
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

/** Display label: title, truncated to 60 chars. */
export function closedTabLabel(tab: RecentlyClosedTabLike): string {
  return (tab.title ?? tab.url ?? "Untitled tab").slice(0, 60);
}
