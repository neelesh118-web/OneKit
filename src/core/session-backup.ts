import { localStorageArea, type KvStorage } from "./storage-utils";
import { tabsToWorkspaceTabs, type WorkspaceTab } from "./workspaces";
import type { TabLike } from "./tab-tools";

/**
 * Automatic session backup — the background auto-snapshots open tabs every
 * 15 minutes (and after tab changes), so a crash, update, or accidental
 * close never loses your session. One snapshot is kept; restoring reopens
 * the saved tabs without touching your current ones.
 */

export const SESSION_BACKUP_STORAGE_KEY = "ok.sessionBackup";

export interface SessionBackup {
  savedAt: number;
  tabs: WorkspaceTab[];
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string" && typeof v.title === "string";
}

/** Saves a fresh snapshot of the given tabs. Returns it, or null when empty. */
export async function saveSessionBackup(
  storage: KvStorage,
  tabs: TabLike[],
  now: number = Date.now()
): Promise<SessionBackup | null> {
  const workspaceTabs = tabsToWorkspaceTabs(tabs);
  if (workspaceTabs.length === 0) return null;
  const backup: SessionBackup = { savedAt: now, tabs: workspaceTabs };
  await storage.set({ [SESSION_BACKUP_STORAGE_KEY]: backup });
  return backup;
}

/** Reads the most recent snapshot, or null when none exists / is corrupt. */
export async function readSessionBackup(storage: KvStorage): Promise<SessionBackup | null> {
  const raw = await storage.get(SESSION_BACKUP_STORAGE_KEY);
  const value = raw[SESSION_BACKUP_STORAGE_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.savedAt !== "number" || !Array.isArray(candidate.tabs)) return null;
  const tabs = candidate.tabs.filter(isWorkspaceTab);
  if (tabs.length === 0) return null;
  return { savedAt: candidate.savedAt, tabs };
}

export async function clearSessionBackup(storage: KvStorage): Promise<void> {
  await storage.remove(SESSION_BACKUP_STORAGE_KEY);
}

export function localStorageSessionBackup(): KvStorage {
  return localStorageArea();
}
