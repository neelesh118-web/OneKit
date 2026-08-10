/**
 * Tab utilities pack — close tabs to the left/right/others, sort tabs by
 * domain, merge all windows. Pure functions over the minimal TabLike
 * shape so the popup and tests never need chrome.tabs.
 */

import type { TabLike } from "./tab-tools";

export type CloseDirection = "left" | "right" | "others";

/** Registrable-domain heuristic (no public-suffix list needed):
 * "www.example.com" → "example.com"; "blog.example.co.uk" →
 * "example.co.uk"; "localhost" → "localhost". */
export function domainOf(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const host = parsed.hostname;
    const parts = host.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length >= 3 && last.length === 2) {
      const secondLevel = parts[parts.length - 2] ?? "";
      if (SECOND_LEVEL_TLDS.has(secondLevel)) return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

/** Common second-level domains under ccTLDs (co.uk, com.au, ac.in…). */
const SECOND_LEVEL_TLDS = new Set([
  "co", "com", "org", "net", "gov", "ac", "edu", "ne", "or", "gen", "id"
]);

/**
 * IDs to close around the active tab (index within the window's tab list).
 * "left" keeps the active tab + everything to its right; "right" the
 * reverse; "others" keeps only the active tab.
 */
export function tabIdsToClose(tabs: TabLike[], activeId: number | undefined, direction: CloseDirection): number[] {
  if (activeId === undefined) return [];
  const active = tabs.find((t) => t.id === activeId);
  if (!active) return [];
  const windowTabs = tabs
    .filter((t) => t.windowId === active.windowId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const activePos = windowTabs.findIndex((t) => t.id === activeId);
  if (activePos < 0) return [];
  const keep = direction === "left" || direction === "right" ? new Set([activeId]) : new Set([activeId]);
  const ids: number[] = [];
  for (let i = 0; i < windowTabs.length; i++) {
    const tab = windowTabs[i]!;
    if (tab.pinned) continue; // never close pinned tabs
    if (tab.id === undefined || keep.has(tab.id)) continue;
    if (direction === "left" && i < activePos) ids.push(tab.id!);
    else if (direction === "right" && i > activePos) ids.push(tab.id!);
    else if (direction === "others" && i !== activePos) ids.push(tab.id!);
  }
  return ids.filter((id): id is number => id !== undefined);
}

/** Sorted tab ids by domain (then title), stable within a window. */
export function sortedTabIdsByDomain(tabs: TabLike[]): number[] {
  const usable = tabs.filter((t) => t.id !== undefined && domainOf(t.url));
  const sorted = [...usable].sort((a, b) => {
    const d = domainOf(a.url).localeCompare(domainOf(b.url));
    if (d !== 0) return d;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
  return sorted.map((t) => t.id!);
}

/**
 * IDs of tabs (outside the current window) that should be moved into the
 * current window to "merge windows". Excludes the current window's tabs.
 */
export function tabIdsToMerge(tabs: TabLike[], currentWindowId: number | undefined): number[] {
  if (currentWindowId === undefined) return [];
  return tabs
    .filter((t) => t.id !== undefined && t.windowId !== currentWindowId)
    .map((t) => t.id!);
}

/** Summary line for the status text. */
export function utilitiesSummary(closed: number, sorted: number, merged: number): string {
  const parts: string[] = [];
  if (closed > 0) parts.push(`${closed} closed`);
  if (sorted > 0) parts.push(`${sorted} sorted`);
  if (merged > 0) parts.push(`${merged} moved into this window`);
  return parts.length === 0 ? "Nothing to do." : `${parts.join(", ")}.`;
}
