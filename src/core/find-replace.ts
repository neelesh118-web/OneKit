/**
 * Find & replace — pure text helpers. The content script walks text nodes
 * and applies `replaceAllMatches` to each; everything else is here so the
 * counting and replacing logic is unit-tested.
 */

export interface ReplaceResult {
  text: string;
  replaced: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Number of non-overlapping occurrences of `query` in `text`. */
export function countOccurrences(text: string, query: string, caseSensitive = false): number {
  if (!query) return 0;
  if (!caseSensitive) {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let count = 0;
    let idx = 0;
    while (true) {
      idx = lower.indexOf(q, idx);
      if (idx === -1) break;
      count += 1;
      idx += q.length;
    }
    return count;
  }
  return text.split(query).length - 1;
}

/**
 * Replaces up to `limit` (default: all) non-overlapping occurrences.
 * Returns the new text and the actual replacement count.
 */
export function replaceAllMatches(
  text: string,
  query: string,
  replacement: string,
  options: { caseSensitive?: boolean; limit?: number } = {}
): ReplaceResult {
  if (!query) return { text, replaced: 0 };
  const { caseSensitive = false, limit = Number.POSITIVE_INFINITY } = options;
  const flags = caseSensitive ? "g" : "gi";
  const re = new RegExp(escapeRegExp(query), flags);
  let replaced = 0;
  const out = text.replace(re, (match) => {
    if (replaced >= limit) return match;
    replaced += 1;
    return replacement;
  });
  return { text: out, replaced };
}

/** Human summary used by the content-script toast. */
export function replaceSummary(count: number): string {
  return count === 0 ? "No matches found." : `Replaced ${count} occurrence${count === 1 ? "" : "s"}.`;
}
