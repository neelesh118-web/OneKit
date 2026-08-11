/**
 * Element hider — right-click → hide any page element, permanently for that
 * site, exactly like uBlock's "picker" but with a per-site list you manage
 * in the popup. Everything is local; nothing is ever uploaded.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const HIDDEN_ELEMENTS_KEY = "ok.hiddenElements";

export interface HiddenElement {
  hostname: string;
  /** CSS selector that uniquely targets the hidden element. */
  selector: string;
  /** Human label (tag + text snippet) shown in the manager. */
  label: string;
  hiddenAt: number;
}

function isHiddenElement(value: unknown): value is HiddenElement {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.hostname === "string" &&
    typeof v.selector === "string" &&
    typeof v.label === "string" &&
    typeof v.hiddenAt === "number"
  );
}

async function readAll(storage: KvStorage): Promise<HiddenElement[]> {
  const raw = await storage.get(HIDDEN_ELEMENTS_KEY);
  const list = raw[HIDDEN_ELEMENTS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isHiddenElement);
}

async function writeAll(storage: KvStorage, list: HiddenElement[]): Promise<void> {
  await storage.set({ [HIDDEN_ELEMENTS_KEY]: list });
}

export function localStorageHiddenElements(): KvStorage {
  return localStorageArea();
}

/** Hidden selectors for one hostname (newest first). */
export async function hiddenForHost(storage: KvStorage, hostname: string): Promise<HiddenElement[]> {
  const all = await readAll(storage);
  return all
    .filter((h) => h.hostname === hostname)
    .sort((a, b) => b.hiddenAt - a.hiddenAt);
}

/** All hidden elements grouped by hostname, for the popup manager. */
export async function listHidden(storage: KvStorage): Promise<HiddenElement[]> {
  const all = await readAll(storage);
  return all.sort((a, b) => a.hostname.localeCompare(b.hostname) || b.hiddenAt - a.hiddenAt);
}

/** Adds a hidden element; identical selector+host replaces the old entry. */
export async function addHidden(
  storage: KvStorage,
  entry: Omit<HiddenElement, "hiddenAt">,
  now = Date.now()
): Promise<HiddenElement> {
  if (!entry.hostname.trim() || !entry.selector.trim()) {
    throw new Error("A hostname and selector are required.");
  }
  const all = await readAll(storage);
  const next = all.filter(
    (h) => !(h.hostname === entry.hostname && h.selector === entry.selector)
  );
  const added: HiddenElement = { ...entry, hiddenAt: now };
  next.unshift(added);
  await writeAll(storage, next);
  return added;
}

/** Removes a hidden element; returns true when something was removed. */
export async function removeHidden(
  storage: KvStorage,
  hostname: string,
  selector: string
): Promise<boolean> {
  const all = await readAll(storage);
  const next = all.filter((h) => !(h.hostname === hostname && h.selector === selector));
  if (next.length === all.length) return false;
  await writeAll(storage, next);
  return true;
}

export async function clearHiddenForHost(storage: KvStorage, hostname: string): Promise<number> {
  const all = await readAll(storage);
  const next = all.filter((h) => h.hostname !== hostname);
  const removed = all.length - next.length;
  if (removed > 0) await writeAll(storage, next);
  return removed;
}

/** The CSS rule that hides an element. */
export function hideRuleFor(selector: string): string {
  return `${selector} { display: none !important; }`;
}

/**
 * Builds a reasonably stable selector for a clicked element: an id when
 * present, otherwise a tag+class chain, otherwise a positional fallback.
 * Deliberately conservative — never produces something that could match a
 * parent (no `:has`, no sibling tricks).
 */
export function selectorFor(el: Element): string {
  if (el.id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(el.id)) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter((c) => /^[A-Za-z0-9_-]+$/.test(c))
    .slice(0, 3)
    .map((c) => `.${c}`);
  if (classes.length > 0) return `${tag}${classes.join("")}`;
  // Positional fallback within its parent, capped at 5 levels up.
  const parts: string[] = [tag];
  let node: Element | null = el;
  for (let depth = 0; depth < 5 && node?.parentElement; depth++) {
    node = node.parentElement;
    const siblings = Array.from(node.children).filter((c) => c.tagName === el.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(el) + 1;
      parts.unshift(`${node.tagName.toLowerCase()} > ${parts[0]}:nth-of-type(${idx})`);
      return parts[0] ?? tag;
    }
  }
  return parts[0] ?? tag;
}

/** Short human label: "h2 — 'We have a deal'". */
export function labelFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const snippet = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return snippet ? `${tag} — "${snippet}"` : tag;
}
