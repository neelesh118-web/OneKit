/**
 * Micro QA capture — devs and QA folk hit "record" moments while browsing:
 * URL, page title, timestamp and a one-line note (optionally a screenshot)
 * bundled into a copyable bug report. All local.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";

export const QA_NOTES_KEY = "ok.qaNotes";

export interface QaNote {
  id: string;
  url: string;
  title: string;
  note: string;
  at: number;
  /** PNG data URL when the user captured a screenshot. */
  screenshot?: string;
}

function isQaNote(value: unknown): value is QaNote {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.title === "string" &&
    typeof v.note === "string" &&
    typeof v.at === "number" &&
    (v.screenshot === undefined || typeof v.screenshot === "string")
  );
}

async function readAll(storage: KvStorage): Promise<QaNote[]> {
  const raw = await storage.get(QA_NOTES_KEY);
  const list = raw[QA_NOTES_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isQaNote);
}

async function writeAll(storage: KvStorage, list: QaNote[]): Promise<void> {
  await storage.set({ [QA_NOTES_KEY]: list });
}

export function localStorageQaNotes(): KvStorage {
  return localStorageArea();
}

const MAX_NOTES = 100;

export async function addQaNote(
  storage: KvStorage,
  input: { url: string; title: string; note: string; screenshot?: string },
  now = Date.now()
): Promise<QaNote> {
  const note: QaNote = {
    id: `qa-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    url: input.url || "about:blank",
    title: input.title || input.url || "Untitled",
    note: input.note.trim().slice(0, 1000),
    at: now,
    ...(input.screenshot ? { screenshot: input.screenshot } : {})
  };
  if (!note.note && !note.screenshot) throw new Error("Add a note or capture a screenshot first.");
  const all = await readAll(storage);
  all.unshift(note);
  await writeAll(storage, all.slice(0, MAX_NOTES));
  return note;
}

export async function listQaNotes(storage: KvStorage): Promise<QaNote[]> {
  const all = await readAll(storage);
  return all.sort((a, b) => b.at - a.at);
}

export async function removeQaNote(storage: KvStorage, id: string): Promise<boolean> {
  const all = await readAll(storage);
  const next = all.filter((n) => n.id !== id);
  if (next.length === all.length) return false;
  await writeAll(storage, next);
  return true;
}

export async function clearQaNotes(storage: KvStorage): Promise<void> {
  await writeAll(storage, []);
}

/** Markdown bug report for the copy button. */
export function qaReport(note: QaNote): string {
  const lines = [
    `**Bug / observation**${note.note ? `: ${note.note}` : ""}`,
    ``,
    `- **Page:** ${note.title}`,
    `- **URL:** ${note.url}`,
    `- **When:** ${new Date(note.at).toLocaleString()}`
  ];
  return lines.join("\n");
}
