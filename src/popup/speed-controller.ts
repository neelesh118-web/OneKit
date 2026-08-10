import {
  duplicateTabIdsToClose,
  filterTabs,
  groupDuplicateTabs,
  normalizeTabUrl,
  sortTabsByPosition
} from "../core/tab-tools";
import {
  listWorkspaces,
  removeWorkspace,
  saveWorkspace
} from "../core/workspaces";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Speed tab — duplicate-tab killer and tab finder. Both run against the
 * current tab list; closing duplicates keeps the leftmost tab of each group.
 */
export function createSpeedController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const dupesList = $("dupes-results");
  const dupesStatus = $("dupes-status");
  const dupesScan = $("dupes-scan") as HTMLButtonElement;
  const tabSearch = $("tab-search") as HTMLInputElement;
  const tabResults = $("tab-results");
  const tabStatus = $("tab-status");

  async function renderDupes(): Promise<void> {
    const tabs = sortTabsByPosition(await caps.queryTabs());
    const groups = groupDuplicateTabs(tabs);
    dupesList.innerHTML = "";
    if (groups.length === 0) {
      dupesStatus.textContent = "No duplicate tabs found. 🎉";
      return;
    }
    const total = groups.reduce((n, g) => n + g.length - 1, 0);
    dupesStatus.textContent = `${groups.length} duplicate group${groups.length === 1 ? "" : "s"} — ${total} tab${total === 1 ? "" : "s"} can be closed.`;
    for (const group of groups) {
      const block = document.createElement("div");
      block.className = "result-row dupes-group";
      const head = document.createElement("strong");
      head.className = "result-title";
      head.textContent = `${group[0]?.title ?? "Untitled"} (×${group.length})`;
      const url = document.createElement("span");
      url.className = "result-meta";
      url.textContent = normalizeTabUrl(group[0]?.url);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "mini-btn danger";
      close.textContent = `Close ${group.length - 1} duplicate${group.length === 2 ? "" : "s"}`;
      close.addEventListener("click", () => {
        const ids = duplicateTabIdsToClose([group]);
        void caps.closeTabs(ids).then(() => void renderDupes());
      });
      block.append(head, url, close);
      dupesList.appendChild(block);
    }
  }

  async function runTabSearch(): Promise<void> {
    const tabs = sortTabsByPosition(await caps.queryTabs());
    const q = tabSearch.value;
    const filtered = q.trim() ? filterTabs(tabs, q) : tabs;
    tabResults.innerHTML = "";
    if (filtered.length === 0) {
      tabStatus.textContent = "No tabs match.";
      return;
    }
    tabStatus.textContent = `${filtered.length} tab${filtered.length === 1 ? "" : "s"}.`;
    for (const tab of filtered.slice(0, 60)) {
      if (tab.id === undefined) continue;
      const row = document.createElement("div");
      row.className = "result-row tab-row";
      const title = document.createElement("span");
      title.className = "result-title";
      title.textContent = tab.title || "Untitled";
      title.title = tab.url ?? "";
      const meta = document.createElement("span");
      meta.className = "result-meta";
      try {
        meta.textContent = tab.url ? new URL(tab.url).hostname : "";
      } catch {
        meta.textContent = "";
      }
      row.addEventListener("click", () => {
        void caps.activateTab(tab.id!);
        window.close();
      });
      row.append(title, meta);
      tabResults.appendChild(row);
    }
  }

  dupesScan.addEventListener("click", () => void renderDupes());
  tabSearch.addEventListener("input", () => void runTabSearch());

  /* Tab workspaces ---------------------------------------------------- */
  const wsName = $("workspace-name") as HTMLInputElement;
  const wsSave = $("workspace-save") as HTMLButtonElement;
  const wsList = $("workspace-list");
  const wsStatus = $("workspace-status");

  async function renderWorkspaces(): Promise<void> {
    const workspaces = await listWorkspaces(caps.storage);
    wsList.innerHTML = "";
    if (workspaces.length === 0) {
      wsStatus.textContent = "No saved sessions yet. Save one with the button above.";
      return;
    }
    wsStatus.textContent = `${workspaces.length} saved session${workspaces.length === 1 ? "" : "s"} — restoring opens the saved tabs without touching your current ones.`;
    for (const workspace of workspaces) {
      const row = document.createElement("div");
      row.className = "result-row workspace-row";
      const left = document.createElement("div");
      left.className = "workspace-left";
      const title = document.createElement("span");
      title.className = "result-title";
      title.textContent = workspace.name;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${workspace.tabs.length} tab${workspace.tabs.length === 1 ? "" : "s"} · ${new Date(workspace.savedAt).toLocaleString()}`;
      left.append(title, meta);

      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "mini-btn";
      restore.textContent = "Restore";
      restore.addEventListener("click", () => {
        void (async () => {
          const fresh = (await listWorkspaces(caps.storage)).find((w) => w.id === workspace.id);
          if (!fresh) return;
          for (const tab of fresh.tabs) {
            await caps.openUrl(tab.url);
          }
          wsStatus.textContent = `Opened ${fresh.tabs.length} tab${fresh.tabs.length === 1 ? "" : "s"} from “${fresh.name}”.`;
        })();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void removeWorkspace(caps.storage, workspace.id).then(() => void renderWorkspaces());
      });

      row.append(left, restore, remove);
      wsList.appendChild(row);
    }
  }

  wsSave.addEventListener("click", () => {
    void (async () => {
      const tabs = sortTabsByPosition(await caps.queryTabs());
      const workspace = await saveWorkspace(caps.storage, wsName.value, tabs);
      if (!workspace) {
        wsStatus.textContent = "Nothing to save — open some pages first (only http/https tabs are captured).";
        return;
      }
      wsName.value = "";
      wsStatus.textContent = `Saved “${workspace.name}” with ${workspace.tabs.length} tab${workspace.tabs.length === 1 ? "" : "s"}.`;
      await renderWorkspaces();
    })();
  });

  void renderDupes();
  void runTabSearch();
  void renderWorkspaces();
  return () => {};
}
