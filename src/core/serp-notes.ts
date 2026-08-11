/**
 * SERP notes — jot context beside Google search results, stored per query
 * so the note comes back next time you run the same search. 100% local.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const SERP_NOTES_KEY = "ok.serpNotes";

export interface SerpNote {
  note: string;
  updatedAt: number;
}

export interface SerpNoteEntry {
  query: string;
  note: string;
  updatedAt: number;
}

function readAll(storage: KvStorage): Promise<Record<string, SerpNote>> {
  return storage.get(SERP_NOTES_KEY).then((raw) => {
    const obj = raw[SERP_NOTES_KEY];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, SerpNote> = {};
    for (const [query, value] of Object.entries(obj as Record<string, unknown>)) {
      const v = value as Record<string, unknown>;
      if (typeof v.note === "string" && typeof v.updatedAt === "number") {
        out[query] = { note: v.note, updatedAt: v.updatedAt };
      }
    }
    return out;
  });
}

async function writeAll(storage: KvStorage, notes: Record<string, SerpNote>): Promise<void> {
  await storage.set({ [SERP_NOTES_KEY]: notes });
}

export function localStorageSerpNotes(): KvStorage {
  return localStorageArea();
}

/** Normalizes a search query for use as a storage key. */
export function queryKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 200).toLowerCase();
}

export async function getSerpNote(storage: KvStorage, rawQuery: string): Promise<SerpNote | null> {
  const key = queryKey(rawQuery);
  if (!key) return null;
  const all = await readAll(storage);
  return all[key] ?? null;
}

export async function setSerpNote(
  storage: KvStorage,
  rawQuery: string,
  note: string,
  now = Date.now()
): Promise<{ query: string; note: string }> {
  const key = queryKey(rawQuery);
  if (!key) throw new Error("A search query is required.");
  const trimmed = note.trim();
  const all = await readAll(storage);
  if (trimmed) {
    all[key] = { note: trimmed, updatedAt: now };
  } else {
    delete all[key];
  }
  await writeAll(storage, all);
  return { query: key, note: trimmed };
}

export async function removeSerpNote(storage: KvStorage, rawQuery: string): Promise<boolean> {
  const key = queryKey(rawQuery);
  if (!key) return false;
  const all = await readAll(storage);
  if (!all[key]) return false;
  delete all[key];
  await writeAll(storage, all);
  return true;
}

export async function listSerpNotes(storage: KvStorage): Promise<SerpNoteEntry[]> {
  const all = await readAll(storage);
  return Object.entries(all)
    .map(([query, v]) => ({ query, note: v.note, updatedAt: v.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
