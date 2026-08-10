import {
  searchConversations,
  type ChatConversation
} from "./chat-vault";
import { searchHistory, type HistoryEntry } from "./history-store";
import { listDrafts, type DraftEntry } from "./drafts-store";
import { listClipboard, type ClipboardEntry } from "./clipboard-store";
import { listReadLater } from "./read-later-store";
import { listHighlights } from "./highlights-store";
import { listWorkspaces } from "./workspaces";
import { screenTimeStats } from "./screen-time";
import { listFocusRules } from "./focus";
import { TOOLS } from "./tool-manifest";
import { unifiedSearch, type SearchGroup, type SearchResult } from "./unified-search";
import type { KvStorage } from "./storage-utils";

/**
 * The Ctrl+Shift+K unified search palette — a shadow-DOM overlay injected
 * into the page. Searches history + AI chats + open tabs + drafts +
 * clipboard in one query. Keyboard navigable: ↑/↓ move, Enter activates,
 * Esc closes. The overlay is inert until the shortcut is pressed.
 */

export interface PaletteCapabilities {
  storage: KvStorage;
  now(): number;
  sendMessage(message: unknown): Promise<unknown>;
  copyText(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  activateTab(tabId: number): Promise<void>;
  toast(message: string): void;
}

export interface PaletteHandle {
  open: () => void;
  close: () => void;
}

function chatResults(conversations: ChatConversation[]): SearchResult[] {
  return conversations.map((c) => ({
    id: `chat-${c.id}`,
    title: c.title,
    subtitle: `${c.siteId} · ${c.messages.length} messages`,
    action: { kind: "open-url", url: c.url }
  }));
}

function historyResults(entries: HistoryEntry[]): SearchResult[] {
  return entries.map((e) => ({
    id: `hist-${e.url}`,
    title: e.title,
    subtitle: e.url,
    action: { kind: "open-url", url: e.url }
  }));
}

function draftResults(drafts: DraftEntry[], query: string): SearchResult[] {
  const q = query.toLowerCase();
  return drafts
    .filter((d) => d.value.toLowerCase().includes(q) || d.fieldLabel.toLowerCase().includes(q))
    .map((d) => ({
      id: `draft-${d.key}`,
      title: d.fieldLabel,
      subtitle: `${d.origin} · ${d.value.slice(0, 60)}`,
      action: { kind: "copy", text: d.value }
    }));
}

function clipboardResults(entries: ClipboardEntry[], query: string): SearchResult[] {
  const q = query.toLowerCase();
  return entries
    .filter((e) => e.text.toLowerCase().includes(q))
    .map((e) => ({
      id: `clip-${e.id}`,
      title: e.text.slice(0, 80),
      subtitle: e.url ?? "clipboard",
      action: { kind: "copy", text: e.text }
    }));
}

/** Saved items: read-later, highlights, workspaces — anything with a URL. */
async function savedResults(storage: KvStorage, query: string): Promise<SearchResult[]> {
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

/** Screen time + focus rules — sites you're tracking, with copy actions. */
async function screenTimeResults(storage: KvStorage, query: string): Promise<SearchResult[]> {
  const q = query.toLowerCase();
  const out: SearchResult[] = [];
  const stats = await screenTimeStats(storage);
  for (const site of stats.todaySites) {
    const host = site.origin.replace(/^https?:\/\//, "");
    if (!host.toLowerCase().includes(q)) continue;
    const minutes = Math.round(site.seconds / 60);
    out.push({
      id: `st-${site.origin}`,
      title: `⏱ ${host}`,
      subtitle: `${minutes} min on screen today`,
      action: { kind: "copy", text: host }
    });
  }
  for (const rule of await listFocusRules(storage)) {
    if (!rule.hostname.toLowerCase().includes(q)) continue;
    out.push({
      id: `focus-${rule.id}`,
      title: `🧘 ${rule.hostname}`,
      subtitle: rule.always ? "blocked at all times" : "blocked on a schedule",
      action: { kind: "copy", text: rule.hostname }
    });
  }
  return out;
}

/** Tool launcher — type a tool's name to jump straight to it. */
function toolResults(query: string): SearchResult[] {
  const q = query.toLowerCase();
  return TOOLS.filter((t) => t.tab !== "settings")
    .filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    .map((t) => ({
      id: `tool-${t.id}`,
      title: `${t.icon} ${t.name}`,
      subtitle: t.description,
      action: { kind: "open-popup", toolId: t.id }
    }));
}

const TAB_NAMES: Record<string, string> = {
  memory: "Memory",
  vault: "Vault",
  safety: "Safety",
  speed: "Speed",
  focus: "Focus",
  typing: "Typing",
  tools: "Tools",
  downloads: "Downloads",
  settings: "Settings"
};

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.palette {
  position: fixed; top: 12vh; left: 50%; transform: translateX(-50%);
  width: min(560px, 92vw); background: #1e293b; color: #f1f5f9;
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  z-index: 2147483647; overflow: hidden;
}
.palette input {
  width: 100%; border: none; outline: none; background: transparent;
  color: inherit; font: 16px/1.5 system-ui, sans-serif;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.12);
}
.results { max-height: 50vh; overflow-y: auto; padding: 6px; }
.group-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
  color: #94a3b8; padding: 8px 10px 4px;
}
.row {
  display: flex; flex-direction: column; gap: 1px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
}
.row.selected { background: #4f46e5; }
.row-title { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-sub { font-size: 11.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row.selected .row-sub { color: #c7d2fe; }
.empty { padding: 18px 16px; color: #94a3b8; font-size: 13px; }
.hint { padding: 8px 14px; border-top: 1px solid rgba(255,255,255,.12); color: #94a3b8; font-size: 11px; }
`;

export function createCommandPalette(caps: PaletteCapabilities): PaletteHandle {
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let inputEl: HTMLInputElement | null = null;
  let resultsEl: HTMLElement | null = null;
  let groups: SearchGroup[] = [];
  let selectedIndex = 0;
  let debounce: number | undefined;

  function buildDom(): void {
    host = document.createElement("div");
    host.id = "onekit-palette-host";
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const palette = document.createElement("div");
    palette.className = "palette";
    inputEl = document.createElement("input");
    inputEl.placeholder = "Search pages, chats, tabs, drafts, saved items, tools…";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    resultsEl = document.createElement("div");
    resultsEl.className = "results";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "↑↓ navigate · Enter open/copy · Esc close";
    palette.append(inputEl, resultsEl, hint);
    shadow.append(style, palette);
    document.documentElement.appendChild(host);

    inputEl.addEventListener("input", () => {
      if (debounce !== undefined) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void runSearch(), 150);
    });
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        void activateSelected();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    palette.addEventListener("click", (event) => {
      const row = (event.target as HTMLElement | null)?.closest?.(".row");
      if (!row) return;
      const index = Number(row.getAttribute("data-index"));
      if (Number.isFinite(index)) void activate(index);
    });
  }

  const flatResults = (): SearchResult[] => groups.flatMap((g) => g.results);

  function moveSelection(delta: number): void {
    const total = flatResults().length;
    if (total === 0) return;
    selectedIndex = (selectedIndex + delta + total) % total;
    render();
  }

  async function runSearch(): Promise<void> {
    const q = inputEl?.value ?? "";
    groups = await unifiedSearch(q, {
      history: async (query) => historyResults(await searchHistory(caps.storage, query)),
      saved: async (query) => savedResults(caps.storage, query),
      chats: async (query) => chatResults(await searchConversations(caps.storage, query)),
      tabs: async (query) => {
        const raw = await caps.sendMessage({ type: "ok:search-tabs", query });
        return Array.isArray(raw) ? (raw as SearchResult[]) : [];
      },
      drafts: async (query) => draftResults(await listDrafts(caps.storage), query),
      clipboard: async (query) => clipboardResults(await listClipboard(caps.storage), query),
      screenTime: async (query) => screenTimeResults(caps.storage, query),
      tools: async (query) => toolResults(query)
    });
    selectedIndex = 0;
    render();
  }

  function render(): void {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    const all = flatResults();
    if (all.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = inputEl?.value
        ? "Nothing found — try a different word."
        : "Type to search pages, chats, tabs, drafts and clipboard.";
      resultsEl.appendChild(empty);
      return;
    }
    let flatIndex = 0;
    for (const group of groups) {
      const label = document.createElement("div");
      label.className = "group-label";
      label.textContent = group.label;
      resultsEl.appendChild(label);
      for (const result of group.results) {
        const row = document.createElement("div");
        row.className = `row${flatIndex === selectedIndex ? " selected" : ""}`;
        row.dataset.index = String(flatIndex);
        const title = document.createElement("span");
        title.className = "row-title";
        title.textContent = result.title;
        const sub = document.createElement("span");
        sub.className = "row-sub";
        sub.textContent = result.subtitle;
        row.append(title, sub);
        resultsEl.appendChild(row);
        flatIndex++;
      }
    }
    const selected = resultsEl.querySelector<HTMLElement>(".row.selected");
    selected?.scrollIntoView({ block: "nearest" });
  }

  async function activateSelected(): Promise<void> {
    await activate(selectedIndex);
  }

  async function activate(index: number): Promise<void> {
    const result = flatResults()[index];
    if (!result) return;
    const action = result.action;
    if (action.kind === "open-url") {
      await caps.openUrl(action.url);
      close();
    } else if (action.kind === "activate-tab") {
      await caps.activateTab(action.tabId);
      close();
    } else if (action.kind === "copy") {
      await caps.copyText(action.text);
      close();
      caps.toast("Copied to clipboard ✓");
    } else if (action.kind === "open-popup") {
      close();
      const tool = TOOLS.find((t) => t.id === action.toolId);
      const tabName = TAB_NAMES[tool?.tab ?? ""] ?? "";
      try {
        await caps.sendMessage({ type: "ok:open-popup" });
        caps.toast(tabName ? `OneKit opened — check the ${tabName} tab.` : "OneKit opened.");
      } catch {
        caps.toast(tabName ? `Open OneKit → ${tabName} tab.` : "OneKit from the toolbar.");
      }
    }
  }

  function open(): void {
    if (!host) buildDom();
    if (!host || !inputEl) return;
    host.style.display = "block";
    inputEl.value = "";
    groups = [];
    selectedIndex = 0;
    render();
    inputEl.focus();
  }

  function close(): void {
    if (host) host.style.display = "none";
  }

  return { open, close };
}
