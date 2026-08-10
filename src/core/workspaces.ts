import { localStorageArea, type KvStorage } from "./storage-utils";
import type { TabLike } from "./tab-tools";

/**
 * Tab workspaces — save and restore whole tab sessions locally. A workspace
 * captures the open tabs' urls/titles at the moment it's saved; restoring
 * reopens them (never closes anything — the user's current session stays
 * untouched).
 */

export interface WorkspaceTab {
  url: string;
  title: string;
}

export interface Workspace {
  id: string;
  name: string;
  savedAt: number;
  tabs: WorkspaceTab[];
}

export const WORKSPACES_STORAGE_KEY = "ok.workspaces";
export const MAX_WORKSPACES = 25;
export const MAX_WORKSPACE_TABS = 200;

function makeId(now: number): string {
  return `ws-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string" && typeof v.title === "string";
}

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.savedAt === "number" &&
    Array.isArray(v.tabs) &&
    v.tabs.every(isWorkspaceTab)
  );
}

async function readWorkspaces(storage: KvStorage): Promise<Workspace[]> {
  const raw = await storage.get(WORKSPACES_STORAGE_KEY);
  const list = raw[WORKSPACES_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isWorkspace);
}

async function writeWorkspaces(storage: KvStorage, workspaces: Workspace[]): Promise<void> {
  await storage.set({ [WORKSPACES_STORAGE_KEY]: workspaces });
}

/**
 * Builds a workspace tab list from browser tabs. Skips non-http(s) URLs
 * (chrome://, about:, extension pages) — those can't be meaningfully restored.
 */
export function tabsToWorkspaceTabs(tabs: TabLike[]): WorkspaceTab[] {
  const out: WorkspaceTab[] = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    try {
      const parsed = new URL(tab.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    out.push({ url: tab.url, title: tab.title || tab.url });
    if (out.length >= MAX_WORKSPACE_TABS) break;
  }
  return out;
}

/** Saves a new workspace from the given tabs. Returns the saved workspace. */
export async function saveWorkspace(
  storage: KvStorage,
  name: string,
  tabs: TabLike[],
  now: number = Date.now()
): Promise<Workspace | null> {
  const workspaceTabs = tabsToWorkspaceTabs(tabs);
  if (workspaceTabs.length === 0) return null;
  const workspaces = await readWorkspaces(storage);
  const workspace: Workspace = {
    id: makeId(now),
    name: name.trim() || `Session ${new Date(now).toLocaleDateString()}`,
    savedAt: now,
    tabs: workspaceTabs
  };
  workspaces.unshift(workspace);
  await writeWorkspaces(storage, workspaces.slice(0, MAX_WORKSPACES));
  return workspace;
}

export async function listWorkspaces(storage: KvStorage): Promise<Workspace[]> {
  const workspaces = await readWorkspaces(storage);
  return workspaces.sort((a, b) => b.savedAt - a.savedAt);
}

export async function removeWorkspace(storage: KvStorage, id: string): Promise<void> {
  const workspaces = await readWorkspaces(storage);
  await writeWorkspaces(storage, workspaces.filter((w) => w.id !== id));
}

export async function clearWorkspaces(storage: KvStorage): Promise<void> {
  await storage.remove(WORKSPACES_STORAGE_KEY);
}

export function localStorageWorkspaces(): KvStorage {
  return localStorageArea();
}
