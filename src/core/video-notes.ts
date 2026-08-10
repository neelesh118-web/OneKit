/**
 * Video timestamp notes — take notes while watching any <video>, each
 * note saved with the timestamp it was taken at.
 *
 * Course-takers and researchers want "save timestamps with notes" (the
 * #1 video-extension feature request). Notes are stored per video URL,
 * and the list shows each note with its time so you can jump back.
 */

import type { KvStorage } from "./storage-utils";

export const VIDEO_NOTES_KEY = "ok.videoNotes";
export const MAX_VIDEO_NOTES_PER_VIDEO = 200;

export interface VideoNote {
  id: string;
  /** Page URL the note belongs to. */
  url: string;
  /** Video currentTime in seconds at note time. */
  timestamp: number;
  text: string;
  createdAt: number;
}

function makeId(now: number): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isVideoNote(value: unknown): value is VideoNote {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.timestamp === "number" &&
    typeof v.text === "string"
  );
}

async function readNotes(storage: KvStorage): Promise<VideoNote[]> {
  const raw = await storage.get(VIDEO_NOTES_KEY);
  const list = raw[VIDEO_NOTES_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isVideoNote);
}

async function writeNotes(storage: KvStorage, notes: VideoNote[]): Promise<void> {
  await storage.set({ [VIDEO_NOTES_KEY]: notes });
}

export async function addVideoNote(
  storage: KvStorage,
  url: string,
  timestamp: number,
  text: string,
  now: number = Date.now()
): Promise<VideoNote> {
  const clean = text.trim();
  if (!clean) throw new Error("Note is empty.");
  const note: VideoNote = {
    id: makeId(now),
    url,
    timestamp: Math.max(0, Math.round(timestamp * 10) / 10),
    text: clean.slice(0, 2000),
    createdAt: now
  };
  const notes = await readNotes(storage);
  const forUrl = notes.filter((n) => n.url === url);
  const next = [...notes, note].filter((n) => n.url !== url).concat(
    [note, ...forUrl].slice(0, MAX_VIDEO_NOTES_PER_VIDEO)
  );
  await writeNotes(storage, next);
  return note;
}

export async function listVideoNotes(storage: KvStorage, url?: string): Promise<VideoNote[]> {
  const notes = await readNotes(storage);
  const filtered = url ? notes.filter((n) => n.url === url) : notes;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeVideoNote(storage: KvStorage, id: string): Promise<void> {
  const notes = await readNotes(storage);
  await writeNotes(storage, notes.filter((n) => n.id !== id));
}

export async function clearVideoNotesFor(storage: KvStorage, url?: string): Promise<number> {
  const notes = await readNotes(storage);
  const next = url ? notes.filter((n) => n.url !== url) : [];
  await writeNotes(storage, next);
  return notes.length - next.length;
}

/** Formats seconds as "1:23:45" / "12:34" for jump links. */
export function formatVideoTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function localStorageVideoNotes(): KvStorage {
  return localStorageAreaRef();
}

import { localStorageArea as localStorageAreaRef } from "./storage-utils";
