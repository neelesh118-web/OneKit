/**
 * Bookmark auto-sorter — one click organizes a flat bookmark mess into
 * folders grouped by domain, finds exact duplicates, and lists empty
 * folders for cleanup. Pure local logic; the popup controller applies the
 * plan through the injected bookmarks capability.
 */

export interface BookmarkLike {
  id?: string;
  title: string;
  url?: string;
  children?: BookmarkLike[];
}

export interface SorterEntry {
  id: string;
  title: string;
  url: string;
}

export interface SorterFolder {
  /** Folder name, e.g. "News — nytimes.com". */
  name: string;
  /** The single domain key (used to dedupe / merge). */
  key: string;
  entries: SorterEntry[];
}

export interface BookmarkPlan {
  folders: SorterFolder[];
  duplicates: Array<{ kept: SorterEntry; dup: SorterEntry }>;
  emptyFolders: Array<{ id: string; title: string }>;
  totalMoved: number;
}

const CATEGORY_HINTS: Array<[string, string[]]> = [
  ["Shopping", ["amazon", "ebay", "etsy", "aliexpress", "walmart", "bestbuy", "target.com", "shein", "temu"]],
  ["Social", ["facebook", "instagram", "twitter", "x.com", "linkedin", "reddit", "youtube", "tiktok", "pinterest", "discord"]],
  ["News", ["nytimes", "wsj", "cnn", "bbc", "theguardian", "washingtonpost", "reuters", "bloomberg", "forbes", "arstechnica", "theverge"]],
  ["Email", ["gmail", "outlook", "yahoo.com", "protonmail", "mail.google"]],
  ["Dev & docs", ["github", "gitlab", "stackoverflow", "stackexchange", "developer.mozilla", "w3.org", "npmjs", "docker", "react.dev", "typescriptlang"]],
  ["Finance", ["bankofamerica", "chase", "wellsfargo", "capitalone", "paypal", "stripe", "coinbase", "robinhood", "fidelity"]],
  ["Video & media", ["netflix", "hulu", "spotify", "disneyplus", "hbo", "peacock", "primevideo", "vimeo", "dailymotion"]],
  ["Work & tools", ["google.com", "notion", "slack", "trello", "asana", "dropbox", "drive.google", "docs.google", "sheets.google", "canva", "figma"]]
];

/** Human category for a hostname, or null. */
export function categoryForHostname(hostname: string): string | null {
  const h = hostname.toLowerCase();
  for (const [label, needles] of CATEGORY_HINTS) {
    if (needles.some((n) => h.includes(n))) return label;
  }
  return null;
}

/** The "News — nytimes.com" folder name for a URL. */
export function folderNameForUrl(url: string): { key: string; name: string } {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    hostname = "unknown";
  }
  const main = hostname.replace(/^([^.]+\.)?([^.]+\.[^.]+)$/, "$2");
  const category = categoryForHostname(main);
  return { key: main || hostname, name: category ? `${category} — ${main || hostname}` : main || hostname };
}

function collectEntries(nodes: BookmarkLike[], out: SorterEntry[] = [], parentFolder = ""): void {
  for (const node of nodes) {
    if (node.url) {
      out.push({ id: node.id ?? `bm-${out.length}`, title: node.title || node.url, url: node.url });
    }
    if (node.children) collectEntries(node.children, out, parentFolder);
  }
}

/**
 * Builds the reorganization plan from the bookmark tree. Pure function —
 * the controller previews it, then applies it.
 */
export function buildBookmarkPlan(rootNodes: BookmarkLike[]): BookmarkPlan {
  const entries: SorterEntry[] = [];
  collectEntries(rootNodes, entries);

  // Exact duplicates (same URL), keeping the first occurrence.
  const seen = new Map<string, SorterEntry>();
  const duplicates: BookmarkPlan["duplicates"] = [];
  const unique: SorterEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.url)) {
      duplicates.push({ kept: seen.get(e.url)!, dup: e });
    } else {
      seen.set(e.url, e);
      unique.push(e);
    }
  }

  // Group by domain.
  const groups = new Map<string, SorterEntry[]>();
  for (const e of unique) {
    const { key } = folderNameForUrl(e.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const folders = [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: folderNameForUrl(list[0]!.url).name,
      entries: list.sort((a, b) => a.title.localeCompare(b.title))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Empty folders in the tree (candidates for cleanup, never auto-deleted).
  const emptyFolders: BookmarkPlan["emptyFolders"] = [];
  const walkEmpty = (nodes: BookmarkLike[], path: string[]) => {
    for (const node of nodes) {
      const title = node.title || "(untitled)";
      if (node.children && node.children.length === 0 && !node.url) {
        emptyFolders.push({ id: node.id ?? "", title: [...path, title].join(" › ") });
      }
      if (node.children) walkEmpty(node.children, [...path, title]);
    }
  };
  walkEmpty(rootNodes, []);

  return {
    folders,
    duplicates,
    emptyFolders,
    totalMoved: folders.reduce((sum, f) => sum + f.entries.length, 0)
  };
}
