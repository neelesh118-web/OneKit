import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Text expander engine — type `;alias` + space (or ; Enter / Tab) and the
 * alias expands to its saved text. Pure matching/expansion logic here so it
 * is unit-testable; the DOM hook lives in the content script.
 */

export interface Snippet {
  id: string;
  /** The short trigger, stored WITHOUT the leading ";" (e.g. "addr"). */
  alias: string;
  text: string;
  created: number;
}

export const SNIPPETS_STORAGE_KEY = "ok.snippets";
export const MAX_SNIPPETS = 100;
export const MAX_ALIAS_CHARS = 24;

/** Normalizes an alias: lower-case, strips a leading ";" if present, trims. */
export function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase().replace(/^;+/, "");
}

export function isValidAlias(alias: string): boolean {
  const a = normalizeAlias(alias);
  return a.length >= 1 && a.length <= MAX_ALIAS_CHARS && /^[a-z0-9_.-]+$/.test(a);
}

function makeId(now: number, alias: string): string {
  return `${now.toString(36)}-${alias}-${Math.random().toString(36).slice(2, 7)}`;
}

function isSnippet(value: unknown): value is Snippet {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.alias === "string" &&
    typeof v.text === "string" &&
    typeof v.created === "number"
  );
}

async function readSnippets(storage: KvStorage): Promise<Snippet[]> {
  const raw = await storage.get(SNIPPETS_STORAGE_KEY);
  const list = raw[SNIPPETS_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isSnippet);
}

async function writeSnippets(storage: KvStorage, snippets: Snippet[]): Promise<void> {
  await storage.set({ [SNIPPETS_STORAGE_KEY]: snippets });
}

export async function listSnippets(storage: KvStorage): Promise<Snippet[]> {
  const snippets = await readSnippets(storage);
  return snippets.sort((a, b) => a.alias.localeCompare(b.alias));
}

export async function saveSnippet(
  storage: KvStorage,
  aliasRaw: string,
  text: string,
  now: number = Date.now()
): Promise<{ ok: boolean; error?: string; snippet?: Snippet }> {
  const alias = normalizeAlias(aliasRaw);
  if (!isValidAlias(alias)) {
    return { ok: false, error: "Alias must be 1–24 chars: letters, numbers, dot, dash, underscore." };
  }
  if (!text.trim()) {
    return { ok: false, error: "Snippet text cannot be empty." };
  }
  const snippets = await readSnippets(storage);
  const idx = snippets.findIndex((s) => s.alias === alias);
  if (idx >= 0) {
    const existing = snippets[idx];
    if (!existing) return { ok: false, error: "Storage read failed." };
    existing.text = text;
    await writeSnippets(storage, snippets);
    return { ok: true, snippet: existing };
  }
  if (snippets.length >= MAX_SNIPPETS) {
    return { ok: false, error: `Snippet limit (${MAX_SNIPPETS}) reached — delete one first.` };
  }
  const snippet: Snippet = { id: makeId(now, alias), alias, text, created: now };
  snippets.push(snippet);
  await writeSnippets(storage, snippets);
  return { ok: true, snippet };
}

export async function deleteSnippet(storage: KvStorage, id: string): Promise<void> {
  const snippets = await readSnippets(storage);
  await writeSnippets(storage, snippets.filter((s) => s.id !== id));
}

/** Trigger characters that finalize an alias expansion. */
const TRIGGERS = new Set([" ", "\t", "\n", ";"]);

export function isExpansionTrigger(ch: string): boolean {
  return TRIGGERS.has(ch);
}

export interface ExpansionMatch {
  alias: string;
  replacement: string;
  /** Character index where the typed alias starts (inclusive). */
  start: number;
  /** Character index just after the typed alias. */
  end: number;
}

/**
 * Finds an expansion at the end of `textBeforeCaret`. The alias MUST be
 * preceded by a literal `;` immediately before it — that prefix is what
 * makes expansion opt-in: plain words like `mail` or `addr` in normal prose
 * never expand, and the consumed range includes the `;` so no stray marker
 * is left behind.
 */
export function findExpansionAt(
  textBeforeCaret: string,
  snippets: Snippet[]
): ExpansionMatch | null {
  const match = /(;)([A-Za-z0-9_.-]+)$/.exec(textBeforeCaret);
  if (!match || match.index === undefined || match[2] === undefined) return null;
  const typed = match[2].toLowerCase();
  const start = match.index; // includes the leading ";"
  const end = start + match[0].length;
  for (const snippet of snippets) {
    if (snippet.alias === typed) {
      return {
        alias: snippet.alias,
        replacement: snippet.text,
        start,
        end
      };
    }
  }
  return null;
}

/** Applies a match to full text + caret; returns the new value and caret. */
export function applyExpansion(
  fullText: string,
  match: ExpansionMatch,
  trigger: string
): { text: string; caret: number } {
  const before = fullText.slice(0, match.start);
  const after = fullText.slice(match.end);
  const text = before + match.replacement + trigger + after;
  const caret = before.length + match.replacement.length + trigger.length;
  return { text, caret };
}

export function localStorageSnippets(): KvStorage {
  return localStorageArea();
}
