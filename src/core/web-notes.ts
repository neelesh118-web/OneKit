import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Sticky web notes — colored notes pinned to a specific page, anchored at a
 * percentage position so they re-appear on revisit even after the page
 * scrolls. Everything is local and keyed by origin (notes never leak across
 * sites).
 */

export const WEB_NOTES_STORAGE_KEY = "ok.webNotes";

export const NOTE_COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface WebNote {
  id: string;
  /** Origin the note belongs to (only shown there). */
  origin: string;
  /** Full URL the note was pinned on. */
  url: string;
  text: string;
  color: NoteColor;
  /** Horizontal anchor 0–100 (% of viewport width). */
  xPct: number;
  /** Vertical anchor 0–100 (% of document height). */
  yPct: number;
  createdAt: number;
}

export const MAX_NOTE_TEXT = 1000;
export const MAX_NOTES_PER_ORIGIN = 50;

function isWebNote(value: unknown): value is WebNote {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.origin === "string" &&
    typeof v.url === "string" &&
    typeof v.text === "string" &&
    typeof v.color === "string" &&
    typeof v.xPct === "number" &&
    typeof v.yPct === "number" &&
    typeof v.createdAt === "number"
  );
}

async function readAll(storage: KvStorage): Promise<WebNote[]> {
  const raw = await storage.get(WEB_NOTES_STORAGE_KEY);
  const list = raw[WEB_NOTES_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isWebNote);
}

async function writeAll(storage: KvStorage, items: WebNote[]): Promise<void> {
  await storage.set({ [WEB_NOTES_STORAGE_KEY]: items });
}

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === "string" && (NOTE_COLORS as readonly string[]).includes(value);
}

/** Notes for one origin, newest first. */
export async function listNotesForOrigin(storage: KvStorage, origin: string): Promise<WebNote[]> {
  const items = await readAll(storage);
  return items
    .filter((n) => n.origin === origin)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function addWebNote(
  storage: KvStorage,
  entry: Omit<WebNote, "id" | "createdAt">,
  now: number = Date.now()
): Promise<WebNote | null> {
  const text = entry.text.trim().slice(0, MAX_NOTE_TEXT);
  if (!text) return null;
  const note: WebNote = {
    ...entry,
    text,
    color: isNoteColor(entry.color) ? entry.color : "yellow",
    id: `note-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now
  };
  const items = await readAll(storage);
  const sameOrigin = items.filter((n) => n.origin === entry.origin);
  if (sameOrigin.length >= MAX_NOTES_PER_ORIGIN) return null;
  items.push(note);
  await writeAll(storage, items);
  return note;
}

export type WebNotePatch = Partial<Pick<WebNote, "text" | "color" | "xPct" | "yPct">>;

export async function updateWebNote(storage: KvStorage, id: string, patch: WebNotePatch): Promise<void> {
  const items = await readAll(storage);
  const index = items.findIndex((n) => n.id === id);
  if (index === -1) return;
  const note = items[index]!;
  const text = patch.text !== undefined ? patch.text.trim().slice(0, MAX_NOTE_TEXT) : note.text;
  items[index] = {
    ...note,
    text: text || note.text,
    color: patch.color !== undefined && isNoteColor(patch.color) ? patch.color : note.color,
    xPct: patch.xPct !== undefined ? Math.max(0, Math.min(100, Math.round(patch.xPct))) : note.xPct,
    yPct: patch.yPct !== undefined ? Math.max(0, Math.min(100, Math.round(patch.yPct))) : note.yPct
  };
  await writeAll(storage, items);
}

/** All notes across origins, newest first (popup manager view). */
export async function listAllNotes(storage: KvStorage): Promise<WebNote[]> {
  const items = await readAll(storage);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeWebNote(storage: KvStorage, id: string): Promise<void> {
  const items = await readAll(storage);
  await writeAll(storage, items.filter((n) => n.id !== id));
}

export async function clearNotesForOrigin(storage: KvStorage, origin: string): Promise<void> {
  const items = await readAll(storage);
  await writeAll(storage, items.filter((n) => n.origin !== origin));
}

export async function clearAllNotes(storage: KvStorage): Promise<void> {
  await storage.remove(WEB_NOTES_STORAGE_KEY);
}

export function localStorageWebNotes(): KvStorage {
  return localStorageArea();
}
