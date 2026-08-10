/**
 * Bookmark cleaner — pure analysis over the bookmarks tree: finds exact
 * duplicates (same normalized URL, or same title+URL) and invalid URLs.
 * The popup applies deletions via the bookmarks API; this module stays
 * browser-free and testable. Honest scope: real dead-link detection needs
 * network HEAD requests, so this only flags structurally-broken URLs.
 */

export interface BookmarkNodeLike {
  id: string;
  title?: string;
  url?: string;
  children?: BookmarkNodeLike[];
}

/** Normalizes a URL for duplicate comparison (fragment + trailing slash). */
export function normalizeBookmarkUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    let out = parsed.origin + parsed.pathname;
    if (parsed.search) out += parsed.search;
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return "";
  }
}

export function isStructurallyInvalidUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "file:";
  } catch {
    return true;
  }
}

export interface BookmarkDuplicate {
  /** The id we suggest keeping (first seen). */
  keepId: string;
  /** Ids that are duplicates of keepId and can be removed. */
  removeIds: string[];
  title: string;
}

export interface BookmarkAnalysis {
  /** URL-normalized duplicates (same page saved twice+). */
  urlDuplicates: BookmarkDuplicate[];
  /** Same title + URL duplicates (e.g. same bookmark in two folders). */
  titleDuplicates: BookmarkDuplicate[];
  /** Bookmarks whose URL is structurally broken (empty / bad scheme). */
  invalid: Array<{ id: string; title: string; url?: string }>;
  /** Total bookmark count (url-bearing nodes). */
  total: number;
}

function walk(node: BookmarkNodeLike, out: Array<{ id: string; title: string; url: string }>): void {
  if (node.url) {
    out.push({ id: node.id, title: node.title ?? "", url: node.url });
  }
  for (const child of node.children ?? []) walk(child, out);
}

export function analyzeBookmarks(root: BookmarkNodeLike): BookmarkAnalysis {
  const flat: Array<{ id: string; title: string; url: string }> = [];
  walk(root, flat);

  const byUrl = new Map<string, typeof flat>();
  for (const b of flat) {
    const key = normalizeBookmarkUrl(b.url);
    if (!key) continue;
    const list = byUrl.get(key) ?? [];
    list.push(b);
    byUrl.set(key, list);
  }

  const urlDuplicates: BookmarkDuplicate[] = [];
  const titleDuplicates: BookmarkDuplicate[] = [];
  const seenUrlPair = new Set<string>();

  for (const [key, list] of byUrl) {
    if (list.length < 2) continue;
    const keep = list[0]!;
    const removeIds = list.slice(1).map((b) => b.id);
    urlDuplicates.push({ keepId: keep.id, removeIds, title: keep.title || key });
    for (const dup of list.slice(1)) {
      const pairKey = `${keep.title}|${key}|${dup.title}`;
      if (keep.title && keep.title === dup.title && !seenUrlPair.has(pairKey)) {
        titleDuplicates.push({ keepId: keep.id, removeIds: [dup.id], title: keep.title });
        seenUrlPair.add(pairKey);
      }
    }
  }

  const invalid = flat
    .filter((b) => isStructurallyInvalidUrl(b.url))
    .map((b) => ({ id: b.id, title: b.title, url: b.url }));

  return { urlDuplicates, titleDuplicates, invalid, total: flat.length };
}

/** Total removable bookmark count across all duplicate groups + invalids. */
export function removableCount(analysis: BookmarkAnalysis): number {
  const dupIds = new Set<string>();
  for (const d of [...analysis.urlDuplicates, ...analysis.titleDuplicates]) {
    for (const id of d.removeIds) dupIds.add(id);
  }
  return dupIds.size + analysis.invalid.length;
}
