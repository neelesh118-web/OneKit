/**
 * Auto-tag saved content — "saved 500 articles but can't find anything"
 * is the #1 clipper complaint. This tags read-later items and highlights
 * by domain plus keyword rules, all locally, so saved content becomes
 * findable without any manual organization.
 *
 * Tags are deterministic: domain-derived + keyword-derived, computed on
 * demand (no extra store — tags ride along with the item). Rules are
 * built in but users can extend them through the popup.
 */

export interface TagRule {
  keyword: string;
  tag: string;
}

/** Built-in keyword → tag rules. Extendable via the popup. */
export const DEFAULT_TAG_RULES: TagRule[] = [
  { keyword: "tutorial", tag: "tutorials" },
  { keyword: "how-to", tag: "tutorials" },
  { keyword: "guide", tag: "tutorials" },
  { keyword: "docs", tag: "docs" },
  { keyword: "reference", tag: "reference" },
  { keyword: "news", tag: "news" },
  { keyword: "recipe", tag: "cooking" },
  { keyword: "food", tag: "cooking" },
  { keyword: "code", tag: "coding" },
  { keyword: "javascript", tag: "coding" },
  { keyword: "python", tag: "coding" },
  { keyword: "css", tag: "coding" },
  { keyword: "ai", tag: "ai" },
  { keyword: "ml", tag: "ai" },
  { keyword: "review", tag: "reviews" },
  { keyword: "startup", tag: "business" },
  { keyword: "business", tag: "business" },
  { keyword: "money", tag: "finance" },
  { keyword: "invest", tag: "finance" },
  { keyword: "health", tag: "health" },
  { keyword: "fitness", tag: "health" },
  { keyword: "design", tag: "design" },
  { keyword: "travel", tag: "travel" },
  { keyword: "science", tag: "science" },
  { keyword: "research", tag: "research" }
];

/** Common TLD-ish words that are noise for tagging. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "your", "you", "our", "how", "why", "what", "when", "from", "into", "about", "that", "this", "are", "was", "were"
]);

/** Compound second-level TLDs (co.uk, com.au…) — the real label sits before them. */
const COMPOUND_TLDS = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "mil"]);

/** Extracts a stable tag from a hostname (e.g. github.com → "github", www.bbc.co.uk → "bbc"). */
export function tagFromDomain(host: string): string | null {
  const parts = host.replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1] ?? "";
  let label = parts[parts.length - 2] ?? parts[0] ?? "";
  // bbc.co.uk → label would be "co" (a compound TLD) — step one more back.
  if (parts.length >= 3 && COMPOUND_TLDS.has(label)) {
    label = parts[parts.length - 3] ?? label;
  }
  // Even the last part can be a country TLD without a compound (e.g. localhost.test).
  if (!label && last) label = last;
  if (!label || label.length < 2) return null;
  return label.toLowerCase();
}

/** Keyword tags from a title, using the given rules (whole-word matching only). */
export function tagsFromText(title: string, rules: TagRule[] = DEFAULT_TAG_RULES): string[] {
  const lower = title.toLowerCase();
  const matched: string[] = [];
  for (const rule of rules) {
    const word = rule.keyword.toLowerCase();
    const pattern = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (pattern.test(lower) && !matched.includes(rule.tag)) matched.push(rule.tag);
  }
  return matched;
}

/** Word tags from a title — significant words become findable keywords. */
export function wordTags(title: string, max = 3): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, max);
}

/**
 * Full tag set for an item: domain tag + keyword tags + up to 2 word tags,
 * deduped and sorted. Empty titles only produce the domain tag.
 */
export function tagsForItem(url: string, title: string, rules: TagRule[] = DEFAULT_TAG_RULES): string[] {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }
  const tags = new Set<string>();
  const domain = tagFromDomain(host);
  if (domain) tags.add(domain);
  for (const t of tagsFromText(title, rules)) tags.add(t);
  for (const t of wordTags(title, 2)) tags.add(t);
  return [...tags].sort();
}

/** Filters a saved-item list by a tag (domain or keyword). */
export function filterByTag<T extends { url: string; title: string }>(
  items: T[],
  tag: string,
  rules: TagRule[] = DEFAULT_TAG_RULES
): T[] {
  const lower = tag.toLowerCase();
  return items.filter((item) => tagsForItem(item.url, item.title, rules).some((t) => t === lower));
}

/** All tags across a list of saved items, with counts. */
export function tagCloud<T extends { url: string; title: string }>(items: T[], rules: TagRule[] = DEFAULT_TAG_RULES): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of tagsForItem(item.url, item.title, rules)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
