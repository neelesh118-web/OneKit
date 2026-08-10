import type { TabLike } from "./tab-tools";

/**
 * Tab memory saver — pure decision logic for choosing which tabs to
 * suspend (discard). The background applies it via tabs.discard, and the
 * popup shows the same policy for its "Suspend now" button. Discarded
 * tabs keep their title/URL and reload the instant you click them.
 */

export interface SuspendOptions {
  /** Idle time before a tab qualifies. */
  thresholdMs: number;
  /** The active tab is never suspended. */
  activeTabId?: number | undefined;
  now?: number;
}

/** Returns the ids of tabs that should be suspended right now. */
export function tabsToSuspend(tabs: TabLike[], options: SuspendOptions): number[] {
  const now = options.now ?? Date.now();
  const threshold = Math.max(0, options.thresholdMs);
  const out: number[] = [];
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (tab.id === options.activeTabId) continue;
    if (tab.active) continue;
    // Never suspend pinned tabs, audible tabs, or special pages.
    if (tab.pinned) continue;
    if (tab.audible) continue;
    const url = tab.url ?? "";
    if (!/^https?:$/.test(safeProtocol(url))) continue;
    const lastAccessed = typeof tab.lastAccessed === "number" ? tab.lastAccessed : 0;
    if (lastAccessed > 0 && now - lastAccessed < threshold) continue;
    out.push(tab.id);
  }
  return out;
}

function safeProtocol(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return "";
  }
}

/** Human label for the popup threshold picker. */
export function thresholdLabel(minutes: number): string {
  return minutes >= 60
    ? `${Math.round(minutes / 60)} hour${minutes >= 120 ? "s" : ""}`
    : `${minutes} min`;
}
