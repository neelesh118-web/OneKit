/**
 * Copy-tab-list — turn open tabs into Markdown or CSV. 100% local.
 */

import type { TabLike } from "./tab-tools";

export function tabsToMarkdown(tabs: TabLike[]): string {
  const lines = ["# Open tabs", ""];
  let i = 0;
  for (const tab of tabs) {
    const title = (tab.title ?? "Untitled").trim();
    const url = tab.url ?? "";
    i += 1;
    lines.push(`${i}. [${title.replace(/[\[\]]/g, "")}](${url})`);
  }
  return lines.join("\n");
}

export function tabsToCsv(tabs: TabLike[]): string {
  const escape = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const rows = [["title", "url"].map(escape).join(",")];
  for (const tab of tabs) {
    rows.push([escape(tab.title ?? "Untitled"), escape(tab.url ?? "")].join(","));
  }
  return rows.join("\n");
}

export function tabStats(tabs: TabLike[]): { count: number; http: number; internal: number } {
  const http = tabs.filter((t) => (t.url ?? "").startsWith("http")).length;
  const internal = tabs.filter((t) => {
    const url = t.url ?? "";
    return url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:");
  }).length;
  return { count: tabs.length, http, internal };
}
