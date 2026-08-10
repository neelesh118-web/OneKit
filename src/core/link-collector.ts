/**
 * Link collector — right-click a link to stash it here, then export the
 * whole collection as Markdown or CSV. 100% local.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const LINK_COLLECTOR_KEY = "ok.linkCollection";

/** Storage adapter for extension contexts. */
export function localStorageLinkCollection(): KvStorage {
  return localStorageArea();
}

export interface CollectedLink {
  url: string;
  title: string;
  addedAt: number;
}

export interface CollectInput {
  url: string;
  title?: string;
}

export async function loadCollection(storage: KvStorage): Promise<CollectedLink[]> {
  const data = await storage.get(LINK_COLLECTOR_KEY);
  const raw = data[LINK_COLLECTOR_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is CollectedLink => {
    if (typeof l !== "object" || l === null) return false;
    const cand = l as Partial<CollectedLink>;
    return typeof cand.url === "string" && typeof cand.addedAt === "number";
  });
}

export async function saveCollection(list: CollectedLink[], storage: KvStorage): Promise<void> {
  await storage.set({ [LINK_COLLECTOR_KEY]: list });
}

export async function addCollectedLink(
  input: CollectInput,
  storage: KvStorage,
  now: number
): Promise<{ added: boolean; count: number }> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) return { added: false, count: (await loadCollection(storage)).length };
  const list = await loadCollection(storage);
  if (list.some((l) => l.url === url)) return { added: false, count: list.length };
  list.unshift({ url, title: input.title?.trim() || url, addedAt: now });
  await saveCollection(list, storage);
  return { added: true, count: list.length };
}

export async function removeCollectedLink(url: string, storage: KvStorage): Promise<void> {
  const list = await loadCollection(storage);
  await saveCollection(list.filter((l) => l.url !== url), storage);
}

export async function clearCollection(storage: KvStorage): Promise<void> {
  await storage.set({ [LINK_COLLECTOR_KEY]: [] });
}

export function collectionToMarkdown(list: CollectedLink[]): string {
  if (list.length === 0) return "# Collected links\n\n(none)";
  return [
    "# Collected links",
    "",
    ...list.map((l, i) => `${i + 1}. [${l.title.replace(/[\[\]]/g, "")}](${l.url})`)
  ].join("\n");
}

export function collectionToCsv(list: CollectedLink[]): string {
  const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const rows = [["title", "url"].map(esc).join(",")];
  for (const l of list) rows.push([esc(l.title), esc(l.url)].join(","));
  return rows.join("\n");
}
