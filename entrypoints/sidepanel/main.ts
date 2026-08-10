import { browser } from "wxt/browser";
import { localStorageArea } from "../../src/core/storage-utils";
import { unifiedSearch, type SearchAction, type SearchResult } from "../../src/core/unified-search";
import { searchConversations } from "../../src/core/chat-vault";
import { searchHistory } from "../../src/core/history-store";
import { listDrafts } from "../../src/core/drafts-store";
import { listClipboard } from "../../src/core/clipboard-store";
import { listReadLater } from "../../src/core/read-later-store";
import { listHighlights } from "../../src/core/highlights-store";
import { listWorkspaces } from "../../src/core/workspaces";
import { screenTimeStats } from "../../src/core/screen-time";
import { listFocusRules } from "../../src/core/focus";
import { TOOLS } from "../../src/core/tool-manifest";
import {
  endFocusSession,
  formatRemaining,
  readFocusSession,
  startFocusSession
} from "../../src/core/focus-session";
import { buildTabOutline, filterTabOutline } from "../../src/core/tab-outline";

/**
 * OneKit side panel — the search palette and focus session as a docked
 * panel (Chrome 114+). Reuses the same unified-search core as Ctrl+Shift+K.
 */

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

const storage = localStorageArea();

function applyTheme(): void {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/* Search -------------------------------------------------------------- */

const searchInput = $("search") as HTMLInputElement;
const resultsEl = $("results");

function historyResults(entries: Array<{ title: string; url: string }>): SearchResult[] {
  return entries.map((e) => ({
    id: `hist-${e.url}`,
    title: e.title,
    subtitle: e.url,
    action: { kind: "open-url", url: e.url }
  }));
}

async function savedResults(query: string): Promise<SearchResult[]> {
  const q = query.toLowerCase();
  const out: SearchResult[] = [];
  for (const item of await listReadLater(storage)) {
    if (!item.title.toLowerCase().includes(q) && !item.url.toLowerCase().includes(q)) continue;
    out.push({
      id: `readlater-${item.id}`,
      title: `📚 ${item.title}`,
      subtitle: item.url,
      action: { kind: "open-url", url: item.url }
    });
  }
  for (const highlight of await listHighlights(storage)) {
    if (!highlight.text.toLowerCase().includes(q)) continue;
    out.push({
      id: `highlight-${highlight.id}`,
      title: `⭐ “${highlight.text.slice(0, 60)}”`,
      subtitle: highlight.url,
      action: { kind: "open-url", url: highlight.url }
    });
  }
  for (const workspace of await listWorkspaces(storage)) {
    if (!workspace.name.toLowerCase().includes(q)) continue;
    const first = workspace.tabs[0];
    out.push({
      id: `workspace-${workspace.id}`,
      title: `🗂 ${workspace.name} (${workspace.tabs.length} tabs)`,
      subtitle: first?.url ?? "",
      action: first ? { kind: "open-url", url: first.url } : { kind: "copy", text: workspace.name }
    });
  }
  return out;
}

async function runSearch(): Promise<void> {
  const q = searchInput.value;
  if (!q.trim()) {
    resultsEl.innerHTML = '<div class="empty">Search pages, chats, tabs, drafts, saved items and tools — all local.</div>';
    return;
  }
  const groups = await unifiedSearch(q, {
    history: async (query) => historyResults(await searchHistory(storage, query)),
    saved: (query) => savedResults(query),
    chats: async (query) =>
      (await searchConversations(storage, query)).map((c) => ({
        id: `chat-${c.id}`,
        title: c.title,
        subtitle: `${c.siteId} · ${c.messages.length} messages`,
        action: { kind: "open-url", url: c.url }
      })),
    tabs: async (query) => {
      const raw = await browser.runtime.sendMessage({ type: "ok:search-tabs", query });
      return Array.isArray(raw) ? (raw as SearchResult[]) : [];
    },
    drafts: async (query) =>
      listDrafts(storage).then((drafts) =>
        drafts
          .filter((d) => d.value.toLowerCase().includes(query.toLowerCase()) || d.fieldLabel.toLowerCase().includes(query.toLowerCase()))
          .map((d) => ({
            id: `draft-${d.key}`,
            title: d.fieldLabel,
            subtitle: `${d.origin} · ${d.value.slice(0, 60)}`,
            action: { kind: "copy", text: d.value }
          }))
      ),
    clipboard: async (query) =>
      listClipboard(storage).then((entries) =>
        entries
          .filter((e) => e.text.toLowerCase().includes(query.toLowerCase()))
          .map((e) => ({
            id: `clip-${e.id}`,
            title: e.text.slice(0, 80),
            subtitle: e.url ?? "clipboard",
            action: { kind: "copy", text: e.text }
          }))
      ),
    screenTime: async (query) => {
      const ql = query.toLowerCase();
      const out: SearchResult[] = [];
      const stats = await screenTimeStats(storage);
      for (const site of stats.todaySites) {
        const host = site.origin.replace(/^https?:\/\//, "");
        if (!host.toLowerCase().includes(ql)) continue;
        out.push({
          id: `st-${site.origin}`,
          title: `⏱ ${host}`,
          subtitle: `${Math.round(site.seconds / 60)} min on screen today`,
          action: { kind: "copy", text: host }
        });
      }
      for (const rule of await listFocusRules(storage)) {
        if (!rule.hostname.toLowerCase().includes(ql)) continue;
        out.push({
          id: `focus-${rule.id}`,
          title: `🧘 ${rule.hostname}`,
          subtitle: rule.always ? "blocked at all times" : "blocked on a schedule",
          action: { kind: "copy", text: rule.hostname }
        });
      }
      return out;
    },
    tools: async (query) =>
      TOOLS.filter((t) => t.tab !== "settings")
        .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.description.toLowerCase().includes(query.toLowerCase()))
        .map((t) => ({
          id: `tool-${t.id}`,
          title: `${t.icon} ${t.name}`,
          subtitle: t.description,
          action: { kind: "open-popup", toolId: t.id }
        }))
  });
  resultsEl.innerHTML = "";
  if (groups.length === 0) {
    resultsEl.innerHTML = '<div class="empty">Nothing found — try a different word.</div>';
    return;
  }
  for (const group of groups) {
    const label = document.createElement("div");
    label.className = "group-label";
    label.textContent = group.label;
    resultsEl.appendChild(label);
    for (const result of group.results) {
      const row = document.createElement("div");
      row.className = "row";
      const title = document.createElement("span");
      title.className = "row-title";
      title.textContent = result.title;
      const sub = document.createElement("span");
      sub.className = "row-sub";
      sub.textContent = result.subtitle;
      row.append(title, sub);
      row.addEventListener("click", () => void activate(result.action));
      resultsEl.appendChild(row);
    }
  }
}

async function activate(action: SearchAction): Promise<void> {
  if (action.kind === "open-url") {
    await browser.tabs.create({ url: action.url });
  } else if (action.kind === "activate-tab") {
    const tab = await browser.tabs.get(action.tabId);
    await browser.tabs.update(action.tabId, { active: true });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
  } else if (action.kind === "copy") {
    await navigator.clipboard.writeText(action.text);
  } else if (action.kind === "open-popup") {
    try {
      await browser.action.openPopup();
    } catch {
      // Unsupported — the side panel itself is the surface.
    }
  }
}

let searchDebounce: number | undefined;
searchInput.addEventListener("input", () => {
  if (searchDebounce !== undefined) window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(() => void runSearch(), 150);
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = resultsEl.querySelector<HTMLElement>(".row");
    first?.click();
  }
});

/* Focus session -------------------------------------------------------- */

const sessionMinutes = $("session-minutes") as HTMLSelectElement;
const sessionStart = $("session-start") as HTMLButtonElement;
const sessionEnd = $("session-end") as HTMLButtonElement;
const sessionStatus = $("session-status");

async function renderSession(): Promise<void> {
  const session = await readFocusSession(storage);
  if (!session) {
    sessionEnd.disabled = true;
    sessionStatus.textContent = "No active session.";
    return;
  }
  const remaining = Math.max(0, session.until - Date.now());
  if (remaining <= 0) {
    await endFocusSession(storage);
    await renderSession();
    return;
  }
  sessionEnd.disabled = false;
  sessionStatus.textContent = `Active — ends in ${formatRemaining(remaining)}.`;
}

sessionStart.addEventListener("click", () => {
  void (async () => {
    const minutes = Number(sessionMinutes.value) || 45;
    const session = await startFocusSession(storage, minutes, [], Date.now());
    sessionStatus.textContent = `Started — ${formatRemaining(session.until - session.startedAt)} of deep work.`;
  })();
});

sessionEnd.addEventListener("click", () => {
  void endFocusSession(storage).then(() => void renderSession());
});

/* Screen time ----------------------------------------------------------- */

const screenTimeEl = $("screen-time");

async function renderScreenTime(): Promise<void> {
  const stats = await screenTimeStats(storage);
  if (stats.todaySeconds > 0) {
    const minutes = Math.round(stats.todaySeconds / 60);
    const top = stats.todaySites[0];
    screenTimeEl.textContent = top
      ? `${minutes} min on screen today — most on ${top.origin.replace(/^https?:\/\//, "")}.`
      : `${minutes} min on screen today.`;
  } else {
    screenTimeEl.textContent = "No active time recorded today yet.";
  }
}

/* Tab outline ------------------------------------------------------------ */

const tabFilter = $("tab-filter") as HTMLInputElement;
const tabOutlineEl = $("tab-outline");
const tabOutlineStatus = $("tab-outline-status");

async function renderTabOutline(): Promise<void> {
  const raw = await browser.tabs.query({});
  const outline = filterTabOutline(
    buildTabOutline(raw as unknown as Array<Partial<{ id: number; title: string; url: string; index: number; active: boolean; discarded: boolean; pinned: boolean; windowId?: number }>>),
    tabFilter.value
  );
  tabOutlineEl.innerHTML = "";
  if (outline.totalTabs === 0) {
    tabOutlineStatus.textContent = "No tabs open.";
    return;
  }
  tabOutlineStatus.textContent =
    `${outline.totalTabs} tabs across ${outline.windows} window${outline.windows === 1 ? "" : "s"} — ${outline.groups.length} site${outline.groups.length === 1 ? "" : "s"}.`;
  for (const group of outline.groups) {
    const label = document.createElement("div");
    label.className = "group-label";
    label.textContent = `${group.host} (${group.tabs.length})`;
    tabOutlineEl.appendChild(label);
    for (const tab of group.tabs) {
      const row = document.createElement("div");
      row.className = "row";
      const title = document.createElement("span");
      title.className = "row-title";
      title.textContent = (tab.pinned ? "📌 " : "") + (tab.title || tab.host || "(untitled)");
      const sub = document.createElement("span");
      sub.className = "row-sub";
      sub.textContent = tab.discarded ? `${tab.url} · suspended` : tab.url;
      const actions = document.createElement("span");
      actions.className = "btn-row";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "✕";
      close.title = "Close tab";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        void browser.tabs.remove(tab.id);
      });
      const suspend = document.createElement("button");
      suspend.type = "button";
      suspend.textContent = "💤";
      suspend.title = tab.discarded ? "Already suspended" : "Suspend tab (free memory)";
      suspend.disabled = tab.discarded;
      suspend.addEventListener("click", (e) => {
        e.stopPropagation();
        void browser.tabs.discard(tab.id).catch(() => {
          // A tab may close mid-action; fine.
        });
      });
      actions.append(suspend, close);
      row.addEventListener("click", () => {
        void (async () => {
          await browser.tabs.update(tab.id, { active: true });
          if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
        })();
      });
      row.append(title, sub, actions);
      tabOutlineEl.appendChild(row);
    }
  }
}

tabFilter.addEventListener("input", () => void renderTabOutline());

$("open-popup").addEventListener("click", () => {
  void (async () => {
    try {
      await browser.action.openPopup();
    } catch {
      // Unsupported — nothing to do.
    }
  })();
});

applyTheme();
void renderSession();
void renderScreenTime();
void renderTabOutline();
window.setInterval(() => {
  void renderSession();
  void renderScreenTime();
  void renderTabOutline();
}, 30_000);
