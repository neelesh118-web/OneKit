/**
 * Bulk link checker — paste a list of URLs, check each one, and classify
 * the result. The actual HEAD/GET requests run in the background (host
 * permissions); this module owns the pure classification + summary.
 */

export interface LinkCheckResult {
  url: string;
  /** HTTP status when a response arrived; 0 on network error. */
  status: number;
  ok: boolean;
  error?: string;
}

export type LinkVerdict = "ok" | "redirect" | "not-found" | "server-error" | "error";

export function verdictFor(result: LinkCheckResult): LinkVerdict {
  if (!result.ok) return "error";
  if (result.status >= 200 && result.status < 300) return "ok";
  if (result.status >= 300 && result.status < 400) return "redirect";
  if (result.status === 404 || result.status === 410) return "not-found";
  return "server-error";
}

/** Cleans raw input lines into a URL list (deduped, http/https only). */
export function urlsFromList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Junk lines: contain spaces, or carry another scheme entirely.
    if (/\s/.test(trimmed)) continue;
    if (/^(mailto|tel|javascript|data|file|ftp|about|chrome|blob):/i.test(trimmed)) continue;
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      out.push(parsed.href);
    } catch {
      // Skip lines that can't be parsed.
    }
  }
  return out;
}

export function summarizeLinkResults(results: LinkCheckResult[]): string {
  if (results.length === 0) return "Nothing checked.";
  const counts = { ok: 0, redirect: 0, "not-found": 0, "server-error": 0, error: 0 };
  for (const r of results) counts[verdictFor(r)]++;
  const broken = counts["not-found"] + counts["server-error"] + counts.error;
  if (broken === 0) return `All ${results.length} links are reachable ✓`;
  return `${results.length} checked: ${counts.ok} ok, ${counts.redirect} redirect, ${broken} broken.`;
}
