/**
 * Downloads cleaner — surfaces duplicate and stale download-history entries
 * so the user can act. It only *lists* — nothing is deleted by this module;
 * the popup offers a confirm before any removal, and the user stays in
 * control. 100% local.
 */

import type { DownloadHistoryEntry } from "./downloads";

export interface DuplicateGroup {
  filename: string;
  /** All entries sharing this filename, oldest first. */
  entries: DownloadHistoryEntry[];
}

export interface CleanupReport {
  duplicates: DuplicateGroup[];
  oldEntries: DownloadHistoryEntry[];
  totalBytesHint: number;
}

/** Groups history entries by normalized filename; groups of 2+ are duplicates. */
export function findDuplicates(history: DownloadHistoryEntry[]): DuplicateGroup[] {
  const byName = new Map<string, DownloadHistoryEntry[]>();
  for (const entry of history) {
    const key = (entry.filename ?? "download").toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(entry);
    byName.set(key, list);
  }
  return [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([filename, list]) => ({
      filename,
      entries: [...list].sort((a, b) => a.ts - b.ts)
    }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

/** Entries older than `days` days (default 90). */
export function findOld(history: DownloadHistoryEntry[], now: number, days = 90): DownloadHistoryEntry[] {
  const cutoff = now - days * 86_400_000;
  return history.filter((e) => e.ts < cutoff).sort((a, b) => a.ts - b.ts);
}

export function buildReport(history: DownloadHistoryEntry[], now: number, oldDays = 90): CleanupReport {
  return {
    duplicates: findDuplicates(history),
    oldEntries: findOld(history, now, oldDays),
    totalBytesHint: history.length
  };
}

/** The ids worth removing per the report (duplicate copies + old entries). */
export function removableIds(report: CleanupReport): string[] {
  const ids = new Set<string>();
  for (const group of report.duplicates) {
    // Keep the newest copy, remove the older duplicates.
    const sorted = [...group.entries].sort((a, b) => b.ts - a.ts);
    for (const entry of sorted.slice(1)) if (entry.id) ids.add(entry.id);
  }
  for (const entry of report.oldEntries) if (entry.id) ids.add(entry.id);
  return [...ids];
}
