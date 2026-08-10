/**
 * Session export/import — take your saved sessions (auto-backup snapshot,
 * workspaces, parked tabs) with you, or bring them back on another machine.
 * One portable JSON file; nothing leaves the device except what you choose
 * to save.
 */

import { localStorageArea, type KvStorage } from "./storage-utils";
import { readSessionBackup, SESSION_BACKUP_STORAGE_KEY, type SessionBackup } from "./session-backup";
import { WORKSPACES_STORAGE_KEY, type Workspace } from "./workspaces";
import { loadParked, PARKING_STORAGE_KEY, type ParkedTab } from "./tab-parking";

export const SESSION_IO_VERSION = 1;

export interface SessionExport {
  version: number;
  exportedAt: string;
  backup: SessionBackup | null;
  workspaces: Workspace[];
  parked: ParkedTab[];
}

export async function exportSessions(storage: KvStorage): Promise<SessionExport> {
  const backup = await readSessionBackup(storage);
  const raw = await storage.get(WORKSPACES_STORAGE_KEY);
  const workspaces = Array.isArray(raw[WORKSPACES_STORAGE_KEY]) ? (raw[WORKSPACES_STORAGE_KEY] as Workspace[]) : [];
  const parked = await loadParked(storage);
  return { version: SESSION_IO_VERSION, exportedAt: new Date().toISOString(), backup, workspaces, parked };
}

export function serializeSessions(exportData: SessionExport): string {
  return JSON.stringify(exportData, null, 2);
}

export interface SessionImportResult {
  restored: { workspaces: number; parked: number; backup: boolean };
  errors: string[];
}

export async function importSessions(storage: KvStorage, raw: unknown): Promise<SessionImportResult> {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { restored: { workspaces: 0, parked: 0, backup: false }, errors: ["Not a session export file."] };
  const data = raw as Partial<SessionExport>;

  const restored = { workspaces: 0, parked: 0, backup: false };

  if (Array.isArray(data.workspaces)) {
    const valid = data.workspaces.filter(
      (w): w is Workspace => !!w && typeof w.id === "string" && typeof w.name === "string" && Array.isArray(w.tabs)
    );
    if (valid.length > 0) {
      const raw = await storage.get(WORKSPACES_STORAGE_KEY);
      const existing = Array.isArray(raw[WORKSPACES_STORAGE_KEY]) ? (raw[WORKSPACES_STORAGE_KEY] as Workspace[]) : [];
      await storage.set({ [WORKSPACES_STORAGE_KEY]: [...existing, ...valid].slice(0, 25) });
      restored.workspaces = valid.length;
    }
  }

  if (Array.isArray(data.parked)) {
    const valid = data.parked.filter(
      (p): p is ParkedTab => !!p && typeof p.url === "string" && typeof p.title === "string" && typeof p.parkedAt === "number"
    );
    if (valid.length > 0) {
      const existing = await loadParked(storage);
      const merged = [...existing, ...valid];
      await storage.set({ [PARKING_STORAGE_KEY]: merged.slice(0, 500) });
      restored.parked = valid.length;
    }
  }

  if (data.backup && typeof data.backup === "object" && Array.isArray((data.backup as SessionBackup).tabs)) {
    await storage.set({ [SESSION_BACKUP_STORAGE_KEY]: data.backup });
    restored.backup = true;
  }

  if (restored.workspaces === 0 && restored.parked === 0 && !restored.backup) {
    errors.push("No recognizable sessions found in the file.");
  }
  return { restored, errors };
}

export function localStorageSessionIo(): KvStorage {
  return localStorageArea();
}
