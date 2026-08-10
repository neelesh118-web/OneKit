/**
 * Bookmarks → Markdown / CSV — turn the bookmark tree into a readable,
 * portable file. Pure local traversal.
 */

import type { BookmarkNodeLike } from "./bookmark-cleaner";

export interface BookmarkLine {
  folder: string;
  title: string;
  url: string;
}

export function flattenBookmarks(node: BookmarkNodeLike, folder = ""): BookmarkLine[] {
  const out: BookmarkLine[] = [];
  const children = node.children ?? [];
  for (const child of children) {
    if (child.url) {
      out.push({ folder, title: child.title || child.url, url: child.url });
    } else if (child.children && child.children.length > 0) {
      // Folders with a real name become context; unnamed folders inherit it.
      out.push(...flattenBookmarks(child, child.title?.trim() ? child.title : folder));
    } else {
      // An empty folder contributes nothing.
      out.push(...flattenBookmarks(child, folder));
    }
  }
  return out;
}

export function bookmarksToMarkdown(root: BookmarkNodeLike): string {
  const lines = flattenBookmarks(root);
  if (lines.length === 0) return "# Bookmarks\n\n(none)";
  const byFolder = new Map<string, BookmarkLine[]>();
  for (const line of lines) {
    const list = byFolder.get(line.folder) ?? [];
    list.push(line);
    byFolder.set(line.folder, list);
  }
  const parts = ["# Bookmarks", ""];
  for (const [folder, items] of byFolder) {
    parts.push(`## ${folder || "Unsorted"}`, "");
    for (const item of items) {
      parts.push(`- [${item.title.replace(/[\[\]]/g, "")}](${item.url})`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

export function bookmarksToCsv(root: BookmarkNodeLike): string {
  const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const rows = [["folder", "title", "url"].map(esc).join(",")];
  for (const line of flattenBookmarks(root)) {
    rows.push([esc(line.folder), esc(line.title), esc(line.url)].join(","));
  }
  return rows.join("\n");
}

export function bookmarkStats(root: BookmarkNodeLike): { total: number; folders: number } {
  const count = (node: BookmarkNodeLike): { links: number; folders: number } => {
    let links = 0;
    let folders = 0;
    for (const child of node.children ?? []) {
      if (child.url) links += 1;
      else {
        folders += 1;
        const sub = count(child);
        links += sub.links;
        folders += sub.folders;
      }
    }
    return { links, folders };
  };
  const c = count(root);
  return { total: c.links, folders: c.folders };
}
