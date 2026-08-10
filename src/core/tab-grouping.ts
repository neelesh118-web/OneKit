import type { TabLike } from "./tab-tools";

/**
 * Auto tab grouping — pure logic for grouping open tabs by registrable
 * domain. The background applies the result with the chrome.tabs.group /
 * tabGroups.update APIs; this module stays testable and browser-free.
 */

export const GROUP_COLORS = ["blue", "red", "green", "yellow", "purple", "cyan", "orange", "pink"] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export interface TabGroupPlan {
  /** Hostname-derived group name (e.g. "github"). */
  name: string;
  color: GroupColor;
  tabIds: number[];
}

/** Two-label public suffixes — the last two labels are NOT the registrable part. */
const COMPOUND_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.in", "com.br",
  "com.mx", "com.ar", "co.jp", "co.za", "com.sg", "com.hk"
]);

/** Extracts a short group name from a hostname (www.example.com → example). */
export function groupNameForHostname(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  // Keep the registrable-ish label, skipping multi-part TLDs like co.uk.
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 1) return host || "other";
  if (labels.length === 2) return labels[0]!;
  if (COMPOUND_TLDS.has(labels.slice(-2).join("."))) {
    return labels[labels.length - 3]!;
  }
  return labels[labels.length - 2]!;
}

/**
 * Plans groups from the given tabs. Only http(s) tabs with ids and a real
 * hostname group; tabs that are already part of a group are skipped
 * (groupId present). Sorted by window/index, stable color assignment.
 */
export function planTabGroups(tabs: TabLike[]): TabGroupPlan[] {
  const byHost = new Map<string, TabLike[]>();
  for (const tab of tabs) {
    if (tab.id === undefined || tab.groupId) continue;
    const url = tab.url ?? "";
    let hostname = "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      hostname = parsed.hostname;
    } catch {
      continue;
    }
    const name = groupNameForHostname(hostname);
    const list = byHost.get(name) ?? [];
    list.push(tab);
    byHost.set(name, list);
  }
  const plans: TabGroupPlan[] = [];
  let colorIndex = 0;
  for (const [name, groupTabs] of byHost) {
    if (groupTabs.length < 2) continue; // single-tab sites don't need a group
    groupTabs.sort((a, b) => (a.windowId ?? 0) * 100000 + (a.index ?? 0) - ((b.windowId ?? 0) * 100000 + (b.index ?? 0)));
    plans.push({
      name,
      color: GROUP_COLORS[colorIndex % GROUP_COLORS.length]!,
      tabIds: groupTabs.map((t) => t.id!)
    });
    colorIndex++;
  }
  return plans.sort((a, b) => a.tabIds[0]! - b.tabIds[0]!);
}
