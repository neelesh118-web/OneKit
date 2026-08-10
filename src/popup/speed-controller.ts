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
import {
  clearSessionBackup,
  readSessionBackup,
  saveSessionBackup
} from "../core/session-backup";
import { tabsToSuspend, thresholdLabel } from "../core/tab-suspender";
import {
  clearSnoozedTabs,
  formatReopenLabel,
  listSnoozedTabs,
  snoozeTab,
  unsnoozeTab
} from "../core/tab-snooze";
import { loadSettings, saveSettings } from "../core/settings";
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

  /* Tab snooze ----------------------------------------------------------- */
  const snoozeDelay = $("snooze-delay") as HTMLSelectElement;
  const snoozeBtn = $("snooze-btn") as HTMLButtonElement;
  const snoozeList = $("snooze-list");
  const snoozeStatus = $("snooze-status");

  async function renderSnoozes(): Promise<void> {
    const items = await listSnoozedTabs(caps.storage);
    snoozeList.innerHTML = "";
    if (items.length === 0) {
      snoozeStatus.textContent = "Nothing snoozed — pick a time above and park the current tab.";
      return;
    }
    snoozeStatus.textContent = `${items.length} tab${items.length === 1 ? "" : "s"} parked — they reopen automatically when due.`;
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "result-row";
      const left = document.createElement("div");
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = item.title;
      title.title = item.url;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `reopens ${formatReopenLabel(item.reopenAt, caps.now())} · ${item.url}`;
      left.append(title, meta);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "mini-btn";
      open.textContent = "Open now";
      open.addEventListener("click", () => {
        void caps.openUrl(item.url).then(() => void unsnoozeTab(caps.storage, item.id)).then(() => void renderSnoozes());
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Cancel";
      remove.addEventListener("click", () => {
        void unsnoozeTab(caps.storage, item.id).then(() => void renderSnoozes());
      });
      row.append(left, open, remove);
      snoozeList.appendChild(row);
    }
  }

  snoozeBtn.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (tab.id === undefined || !tab.url) {
        snoozeStatus.textContent = "Nothing to snooze — open a normal page first.";
        return;
      }
      const minutes = Number(snoozeDelay.value) || 1440;
      const record = await snoozeTab(
        caps.storage,
        { url: tab.url, title: tab.title ?? tab.url, reopenAt: caps.now() + minutes * 60 * 1000 },
        caps.now()
      );
      if (!record) {
        snoozeStatus.textContent = "That page can't be snoozed (only http/https tabs).";
        return;
      }
      await caps.closeTabs([tab.id]);
      snoozeStatus.textContent = `Parked for ${minutes} min — it reopens automatically.`;
      await renderSnoozes();
    })();
  });

  /* Auto tab grouping --------------------------------------------------- */
  const groupBtn = $("group-tabs-btn") as HTMLButtonElement;
  const groupStatus = $("group-tabs-status");

  groupBtn.addEventListener("click", () => {
    void (async () => {
      groupStatus.textContent = "Grouping…";
      const { grouped } = await caps.groupTabs();
      groupStatus.textContent =
        grouped > 0
          ? `Grouped ${grouped} tab${grouped === 1 ? "" : "s"} by site — tabs already in a group were left alone.`
          : "Nothing to group — open a few tabs on the same site first (single-tab sites don't need a group).";
    })().catch(() => {
      groupStatus.textContent = "Could not group tabs — this browser may not support tab groups.";
    });
  });

  /* Automatic session backup ------------------------------------------- */
  const backupStatus = $("backup-status");
  const backupRestoreBtn = $("backup-restore-btn") as HTMLButtonElement;
  const backupNow = $("backup-now") as HTMLButtonElement;
  const backupClear = $("backup-clear") as HTMLButtonElement;

  async function renderBackup(): Promise<void> {
    const backup = await readSessionBackup(caps.storage);
    if (!backup) {
      backupStatus.textContent =
        "No backup yet — the first snapshot saves shortly after you open tabs (toggle it in Settings → Tools).";
      return;
    }
    const ago = Math.max(0, Math.round((caps.now() - backup.savedAt) / 60000));
    backupStatus.textContent = `Last backup ${ago} min ago · ${backup.tabs.length} tab${backup.tabs.length === 1 ? "" : "s"}.`;
  }

  backupNow.addEventListener("click", () => {
    void (async () => {
      const tabs = sortTabsByPosition(await caps.queryTabs());
      const backup = await saveSessionBackup(caps.storage, tabs, caps.now());
      backupStatus.textContent = backup
        ? `Backed up ${backup.tabs.length} tab${backup.tabs.length === 1 ? "" : "s"} just now.`
        : "Nothing to back up — open some pages first (only http/https tabs are captured).";
    })();
  });

  backupRestoreBtn.addEventListener("click", () => {
    void (async () => {
      const backup = await readSessionBackup(caps.storage);
      if (!backup) {
        backupStatus.textContent = "No backup to restore yet.";
        return;
      }
      for (const tab of backup.tabs) {
        await caps.openUrl(tab.url);
      }
      backupStatus.textContent = `Restored ${backup.tabs.length} tab${backup.tabs.length === 1 ? "" : "s"} from the last backup.`;
    })();
  });

  backupClear.addEventListener("click", () => {
    void clearSessionBackup(caps.storage).then(() => void renderBackup());
  });

  /* Tab memory saver ---------------------------------------------------- */
  const suspenderToggle = $("suspender-toggle") as HTMLInputElement;
  const suspenderThreshold = $("suspender-threshold") as HTMLSelectElement;
  const suspenderNow = $("suspender-now") as HTMLButtonElement;
  const suspenderStatus = $("suspender-status");

  async function renderSuspender(): Promise<void> {
    const settings = await loadSettings(caps.storage);
    suspenderToggle.checked = settings.tools.tabSuspender;
    suspenderStatus.textContent = settings.tools.tabSuspender
      ? `On — tabs idle for ${thresholdLabel(Number(suspenderThreshold.value) || 30)} min get suspended automatically.`
      : "Off — nothing is suspended until you switch it on (or use the button below).";
  }

  suspenderToggle.addEventListener("change", () => {
    void (async () => {
      const settings = await loadSettings(caps.storage);
      settings.tools.tabSuspender = suspenderToggle.checked;
      await saveSettings(settings, caps.storage);
      await renderSuspender();
    })();
  });

  suspenderThreshold.addEventListener("change", () => void renderSuspender());

  suspenderNow.addEventListener("click", () => {
    void (async () => {
      const tabs = sortTabsByPosition(await caps.queryTabs());
      const activeTab = (await caps.getActiveTab()).id;
      const ids = tabsToSuspend(tabs, {
        thresholdMs: Number(suspenderThreshold.value) * 60 * 1000,
        activeTabId: activeTab
      });
      if (ids.length === 0) {
        suspenderStatus.textContent = "No tabs idle long enough to suspend right now.";
        return;
      }
      await caps.discardTabs(ids);
      suspenderStatus.textContent = `Suspended ${ids.length} tab${ids.length === 1 ? "" : "s"} — they reload when clicked.`;
    })();
  });

  void renderDupes();
  void runTabSearch();
  void renderWorkspaces();
  void renderBackup();
  void renderSuspender();
  void renderSnoozes();
  return () => {};
}
