/**
 * Data export hub — download your OneKit data as friendly files.
 * Everything is already on this device; this just packages it.
 */

import { BACKUP_KEYS } from "./backup-restore";
import { collectionToCsv, collectionToMarkdown, loadCollection, type CollectedLink } from "./link-collector";
import { loadReminders, type Reminder } from "./reminders";
import { loadTodos, type TodoItem } from "./todo-store";
import type { KvStorage } from "./storage-utils";

export interface ExportPayload {
  json: string;
  markdown: string;
}

export interface ExportSources {
  loadCollection(storage: KvStorage): Promise<CollectedLink[]>;
  loadReminders(storage: KvStorage): Promise<Reminder[]>;
  loadTodos(storage: KvStorage): Promise<TodoItem[]>;
}

export const DEFAULT_EXPORT_SOURCES: ExportSources = {
  loadCollection,
  loadReminders,
  loadTodos
};

/** A single JSON blob of every OneKit store (same catalog as Backup). */
export async function exportJson(storage: KvStorage): Promise<string> {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 1 };
  for (const key of BACKUP_KEYS) {
    const data = await storage.get(key);
    if (data[key] !== undefined) out[key] = data[key];
  }
  return JSON.stringify(out, null, 2);
}

/** A friendly Markdown digest of the most human-readable stores. */
export async function exportMarkdown(storage: KvStorage, sources: ExportSources = DEFAULT_EXPORT_SOURCES): Promise<string> {
  const parts: string[] = ["# OneKit data export", "", `Exported ${new Date().toLocaleString()} — everything below was stored on this device.`, ""];

  const links = await sources.loadCollection(storage);
  parts.push("## Collected links", "");
  parts.push(links.length ? collectionToMarkdown(links).replace(/^# .*$/m, "") : "(none)", "");

  const todos = await sources.loadTodos(storage);
  parts.push("## Todos", "");
  if (todos.length === 0) {
    parts.push("(none)", "");
  } else {
    for (const t of todos) {
      parts.push(`- [${t.done ? "x" : " "}] ${t.title}${t.due ? ` (due ${new Date(t.due).toLocaleDateString()})` : ""}`);
    }
    parts.push("");
  }

  const reminders = await sources.loadReminders(storage);
  parts.push("## Reminders", "");
  if (reminders.length === 0) {
    parts.push("(none)", "");
  } else {
    for (const r of reminders) {
      parts.push(`- ${r.text} — ${r.firedAt ? "fired" : `due ${new Date(r.due).toLocaleString()}`}`);
    }
  }

  parts.push("", "---", "Full JSON backup: use Settings → Backup & restore for every store.", "");
  return parts.join("\n");
}

export function csvForLinks(links: CollectedLink[]): string {
  return collectionToCsv(links);
}
