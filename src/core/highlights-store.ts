import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Page highlights — text you highlighted on any page, stored locally and
 * re-applied when you revisit. Per-URL and total caps keep storage bounded.
 */

export interface Highlight {
  id: string;
  url: string;
  text: string;
  ts: number;
  color: string;
}

export const HIGHLIGHTS_STORAGE_KEY = "ok.highlights";
export const MAX_HIGHLIGHTS_PER_URL = 20;
export const MAX_TOTAL_HIGHLIGHTS = 500;
export const MAX_HIGHLIGHT_TEXT_CHARS = 2000;
export const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4"];

function makeId(now: number, text: string): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isHighlight(value: unknown): value is Highlight {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.text === "string" &&
    typeof v.ts === "number"
  );
}

async function readHighlights(storage: KvStorage): Promise<Highlight[]> {
  const raw = await storage.get(HIGHLIGHTS_STORAGE_KEY);
  const list = raw[HIGHLIGHTS_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isHighlight);
}

async function writeHighlights(storage: KvStorage, highlights: Highlight[]): Promise<void> {
  await storage.set({ [HIGHLIGHTS_STORAGE_KEY]: highlights });
}

export async function saveHighlight(
  storage: KvStorage,
  url: string,
  text: string,
  now: number = Date.now()
): Promise<Highlight | null> {
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, MAX_HIGHLIGHT_TEXT_CHARS);
  if (!trimmed) return null;
  const highlights = await readHighlights(storage);
  // Per-URL cap: drop that URL's oldest highlight first.
  const sameUrl = highlights.filter((h) => h.url === url);
  if (sameUrl.length >= MAX_HIGHLIGHTS_PER_URL) {
    const oldest = sameUrl.sort((a, b) => a.ts - b.ts)[0];
    if (oldest) {
      const idx = highlights.findIndex((h) => h.id === oldest.id);
      if (idx >= 0) highlights.splice(idx, 1);
    }
  }
  const highlight: Highlight = {
    id: makeId(now, trimmed),
    url,
    text: trimmed,
    ts: now,
    color: HIGHLIGHT_COLORS[sameUrl.length % HIGHLIGHT_COLORS.length]!
  };
  highlights.unshift(highlight);
  await writeHighlights(storage, highlights.slice(0, MAX_TOTAL_HIGHLIGHTS));
  return highlight;
}

export async function listHighlights(storage: KvStorage): Promise<Highlight[]> {
  const list = await readHighlights(storage);
  return list.sort((a, b) => b.ts - a.ts);
}

export async function listHighlightsForUrl(storage: KvStorage, url: string): Promise<Highlight[]> {
  const list = await readHighlights(storage);
  return list.filter((h) => h.url === url).sort((a, b) => b.ts - a.ts);
}

export async function removeHighlight(storage: KvStorage, id: string): Promise<void> {
  const list = await readHighlights(storage);
  await writeHighlights(storage, list.filter((h) => h.id !== id));
}

export async function clearHighlights(storage: KvStorage): Promise<void> {
  await storage.remove(HIGHLIGHTS_STORAGE_KEY);
}

/**
 * Finds the first Range in the document matching `text` (whitespace-
 * normalized), walking text nodes. Used to re-apply saved highlights on
 * revisit. Returns null when the text is no longer on the page.
 */
export function findRangeForText(doc: Document, text: string): Range | null {
  const target = text.replace(/\s+/g, " ").toLowerCase();
  if (!target) return null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = (node as Text).data;
      if (!t.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent && parent.closest("script, style, noscript, mark")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let accumulated = "";
  const nodes: Text[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    const t = node.data;
    const probe = `${accumulated} ${t}`.replace(/\s+/g, " ").toLowerCase();
    const matchIndex = probe.indexOf(target);
    if (matchIndex >= 0) {
      // Walk back to find which node holds the start.
      let startNode: Text | null = null;
      let startOffset = 0;
      let cursor = "";
      for (const n of [...nodes, node]) {
        const piece = n.data.replace(/\s+/g, " ");
        const before = cursor;
        cursor = `${before} ${piece}`.replace(/\s+/g, " ").toLowerCase();
        if (matchIndex < cursor.length) {
          const within = matchIndex - before.length - 1; // account for the space
          startNode = n;
          startOffset = Math.max(0, within);
          break;
        }
      }
      if (startNode) {
        const range = doc.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(node, Math.min(node.data.length, t.length));
        return range;
      }
    }
    accumulated = probe;
    nodes.push(node);
    node = walker.nextNode() as Text | null;
  }
  return null;
}

export function localStorageHighlights(): KvStorage {
  return localStorageArea();
}
