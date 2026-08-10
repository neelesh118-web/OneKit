/**
 * Quick links for the home dashboard — a small editable list of tiles
 * that open in a new tab. Local only, capped so it can't grow unbounded.
 */
import type { KvStorage } from "./storage-utils";

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

const KEY = "ok:quick-links";
const MAX = 12;

export const DEFAULT_LINKS: QuickLink[] = [
  { id: "gl", label: "Gmail", url: "https://mail.google.com" },
  { id: "gc", label: "Calendar", url: "https://calendar.google.com" },
  { id: "yt", label: "YouTube", url: "https://youtube.com" },
  { id: "gh", label: "GitHub", url: "https://github.com" },
  { id: "rd", label: "Reddit", url: "https://reddit.com" },
  { id: "w", label: "Wikipedia", url: "https://wikipedia.org" }
];

export function newLinkId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function listLinks(storage: KvStorage): Promise<QuickLink[]> {
  const got = await storage.get(KEY);
  const raw = got[KEY];
  if (!Array.isArray(raw)) return DEFAULT_LINKS.map((l) => ({ ...l }));
  const list = raw.filter(
    (l): l is QuickLink =>
      typeof l === "object" &&
      l !== null &&
      typeof (l as QuickLink).id === "string" &&
      typeof (l as QuickLink).label === "string" &&
      typeof (l as QuickLink).url === "string"
  );
  return list.length > 0 ? list : DEFAULT_LINKS.map((l) => ({ ...l }));
}

export async function addLink(label: string, urlRaw: string, storage: KvStorage): Promise<QuickLink[]> {
  const url = validUrl(urlRaw);
  if (!url) throw new Error("That's not a valid link — try https://example.com.");
  const labelClean = label.trim() || url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const list = await listLinks(storage);
  if (list.length >= MAX) throw new Error(`Keep it to ${MAX} links — remove one first.`);
  const next = [...list, { id: newLinkId(), label: labelClean, url }];
  await storage.set({ [KEY]: next });
  return next;
}

export async function removeLink(id: string, storage: KvStorage): Promise<QuickLink[]> {
  const next = (await listLinks(storage)).filter((l) => l.id !== id);
  await storage.set({ [KEY]: next });
  return next;
}
