/**
 * Privacy sweep — pure planning for the popup's one-click cleanup.
 *
 * The browser glue (browsing history, cookies, cache, downloads) lives in
 * the controller via capabilities; this module turns the raw counts into an
 * honest, ranked plan and validates sweep inputs. No deletion happens here.
 */

export interface SweepHost {
  /** Hostname without scheme, e.g. "news.example.com". */
  host: string;
  /** Visits in the sweep window from browsing history (0 = none found). */
  historyVisits: number;
  /** Cookies held for this host (0 = none found). */
  cookieCount: number;
}

export interface SweepPlan {
  hosts: SweepHost[];
  /** Total distinct hosts with anything to clear. */
  totalHosts: number;
  totalHistoryVisits: number;
  totalCookies: number;
}

/** Merges raw history entries and cookie hosts into one ranked list. */
export function buildSweepPlan(
  history: Array<{ host: string; visits: number }>,
  cookieHosts: string[]
): SweepPlan {
  const byHost = new Map<string, SweepHost>();
  for (const entry of history) {
    if (!entry.host) continue;
    const current = byHost.get(entry.host) ?? { host: entry.host, historyVisits: 0, cookieCount: 0 };
    current.historyVisits += Math.max(0, Math.round(entry.visits) || 1);
    byHost.set(entry.host, current);
  }
  for (const host of cookieHosts) {
    if (!host) continue;
    const current = byHost.get(host) ?? { host, historyVisits: 0, cookieCount: 0 };
    current.cookieCount += 1;
    byHost.set(host, current);
  }
  const hosts = [...byHost.values()].sort(
    (a, b) => b.historyVisits + b.cookieCount - (a.historyVisits + a.cookieCount)
  );
  return {
    hosts,
    totalHosts: hosts.length,
    totalHistoryVisits: hosts.reduce((n, h) => n + h.historyVisits, 0),
    totalCookies: hosts.reduce((n, h) => n + h.cookieCount, 0)
  };
}

/** True when the plan actually has something to clear. */
export function hasSweepWork(plan: SweepPlan): boolean {
  return plan.totalHosts > 0 || plan.totalHistoryVisits > 0 || plan.totalCookies > 0;
}

/** Sanitizes a search term used to filter the sweep list. */
export function sanitizeSweepQuery(query: string): string {
  return query.trim().toLowerCase().slice(0, 100);
}

export function filterSweepHosts(hosts: SweepHost[], query: string): SweepHost[] {
  const q = sanitizeSweepQuery(query);
  if (!q) return hosts;
  return hosts.filter((h) => h.host.toLowerCase().includes(q));
}
