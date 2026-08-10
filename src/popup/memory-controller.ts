import {
  clearClipboard,
  listClipboard,
  removeClipboardEntry
} from "../core/clipboard-store";
import { clearDrafts, listDrafts, removeDraft } from "../core/drafts-store";
import {
  clearHistory,
  historyStats,
  removeHistoryEntry,
  searchHistory
} from "../core/history-store";
import {
  clearHighlights,
  listHighlights,
  removeHighlight
} from "../core/highlights-store";
import {
  clearReadLater,
  listReadLater,
  markReadLater,
  removeReadLater
} from "../core/read-later-store";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Memory tab — full-text history search, clipboard history, and the form
 * draft vault. All local; nothing here touches the network.
 */
export function createMemoryController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const historySearch = $("history-search") as HTMLInputElement;
  const historyResults = $("history-results");
  const historyStatus = $("history-status");
  const historyClear = $("history-clear") as HTMLButtonElement;
  const historyCount = $("history-count");

  const clipboardList = $("clipboard-list");
  const clipboardClear = $("clipboard-clear") as HTMLButtonElement;

  const draftsList = $("drafts-list");
  const draftsClear = $("drafts-clear") as HTMLButtonElement;

  const highlightsList = $("highlights-list");
  const highlightsClear = $("highlights-clear") as HTMLButtonElement;

  const readLaterList = $("readlater-list");
  const readLaterClear = $("readlater-clear") as HTMLButtonElement;

  const refreshMemory = $("memory-refresh") as HTMLButtonElement;

  function setStatus(el: HTMLElement, message: string): void {
    el.textContent = message;
  }

  async function runHistorySearch(): Promise<void> {
    const q = historySearch.value;
    if (!q.trim()) {
      historyResults.innerHTML = "";
      setStatus(historyStatus, "Type a word or phrase you remember from a page.");
      return;
    }
    const results = await searchHistory(caps.storage, q);
    historyResults.innerHTML = "";
    if (results.length === 0) {
      setStatus(historyStatus, "No matches — try a different word.");
      return;
    }
    setStatus(historyStatus, `${results.length} result${results.length === 1 ? "" : "s"}.`);
    for (const entry of results) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("a");
      title.className = "result-title";
      title.textContent = entry.title;
      title.href = entry.url;
      title.target = "_blank";
      title.rel = "noreferrer";
      const snippet = document.createElement("p");
      snippet.className = "result-snippet";
      snippet.textContent = entry.text.slice(0, 140);
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${new URL(entry.url).hostname} · ${new Date(entry.ts).toLocaleString()}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn";
      remove.textContent = "Forget";
      remove.addEventListener("click", () => {
        void removeHistoryEntry(caps.storage, entry.url).then(() => void runHistorySearch());
      });
      row.append(title, snippet, meta, remove);
      historyResults.appendChild(row);
    }
  }

  async function renderClipboard(): Promise<void> {
    const entries = await listClipboard(caps.storage);
    clipboardList.innerHTML = "";
    if (entries.length === 0) {
      setStatus(clipboardList, "Nothing copied yet — copies are remembered here.");
      return;
    }
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "result-row";
      const text = document.createElement("p");
      text.className = "result-snippet";
      text.textContent = entry.text;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${entry.url ?? "unknown site"} · ${new Date(entry.ts).toLocaleString()}`;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "mini-btn";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => {
        void caps.copyText(entry.text).then(() => {
          copy.textContent = "Copied ✓";
          window.setTimeout(() => (copy.textContent = "Copy"), 1200);
        });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        void removeClipboardEntry(caps.storage, entry.id).then(() => void renderClipboard());
      });
      row.append(text, meta, copy, remove);
      clipboardList.appendChild(row);
    }
  }

  async function renderDrafts(): Promise<void> {
    const drafts = await listDrafts(caps.storage);
    draftsList.innerHTML = "";
    if (drafts.length === 0) {
      setStatus(draftsList, "No saved drafts. Turn on \u201cAuto-save form drafts\u201d in the Settings tab, then type into any form — drafts appear here.");
      return;
    }
    for (const draft of drafts) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = draft.fieldLabel;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${draft.origin} · ${new Date(draft.ts).toLocaleString()}`;
      const value = document.createElement("p");
      value.className = "result-snippet";
      value.textContent = draft.value.slice(0, 120);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "mini-btn";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => {
        void caps.copyText(draft.value).then(() => {
          copy.textContent = "Copied ✓";
          window.setTimeout(() => (copy.textContent = "Copy"), 1200);
        });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void removeDraft(caps.storage, draft.key).then(() => void renderDrafts());
      });
      row.append(title, meta, value, copy, remove);
      draftsList.appendChild(row);
    }
  }

  async function renderHighlights(): Promise<void> {
    const highlights = await listHighlights(caps.storage);
    highlightsList.innerHTML = "";
    if (highlights.length === 0) {
      highlightsList.textContent = "No highlights yet. Select text on any page → right-click → OneKit → Highlight selection.";
      return;
    }
    for (const highlight of highlights) {
      const row = document.createElement("div");
      row.className = "result-row";
      const text = document.createElement("p");
      text.className = "result-snippet";
      text.textContent = `“${highlight.text.slice(0, 120)}”`;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      try {
        meta.textContent = `${new URL(highlight.url).hostname} · ${new Date(highlight.ts).toLocaleString()}`;
      } catch {
        meta.textContent = new Date(highlight.ts).toLocaleString();
      }
      const open = document.createElement("button");
      open.type = "button";
      open.className = "mini-btn";
      open.textContent = "Open";
      open.addEventListener("click", () => void caps.openUrl(highlight.url));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        void removeHighlight(caps.storage, highlight.id).then(() => void renderHighlights());
      });
      row.append(text, meta, open, remove);
      highlightsList.appendChild(row);
    }
  }

  async function renderReadLater(): Promise<void> {
    const items = await listReadLater(caps.storage);
    readLaterList.innerHTML = "";
    if (items.length === 0) {
      readLaterList.textContent = "Nothing saved yet. Right-click any page → OneKit → Save page to read later.";
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = `${item.read ? "✓ " : ""}${item.title}`;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${item.url} · ${new Date(item.savedAt).toLocaleString()}`;
      const actions = document.createElement("div");
      actions.className = "btn-row";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "mini-btn";
      open.textContent = "Read";
      open.addEventListener("click", () => {
        void caps.openUrl(`/reader.html?url=${encodeURIComponent(item.url)}`);
      });
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mini-btn";
      toggle.textContent = item.read ? "Unread" : "Done";
      toggle.addEventListener("click", () => {
        void markReadLater(caps.storage, item.id, !item.read).then(() => void renderReadLater());
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        void removeReadLater(caps.storage, item.id).then(() => void renderReadLater());
      });
      actions.append(open, toggle, remove);
      row.append(title, meta, actions);
      readLaterList.appendChild(row);
    }
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([
      runHistorySearch(),
      renderClipboard(),
      renderDrafts(),
      renderHighlights(),
      renderReadLater()
    ]);
    const stats = await historyStats(caps.storage);
    historyCount.textContent = String(stats.count);
  }

  let searchDebounce: number | undefined;
  historySearch.addEventListener("input", () => {
    if (searchDebounce !== undefined) window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => void runHistorySearch(), 200);
  });
  historyClear.addEventListener("click", () => {
    void clearHistory(caps.storage).then(() => void refreshAll());
  });
  clipboardClear.addEventListener("click", () => {
    void clearClipboard(caps.storage).then(() => void renderClipboard());
  });
  draftsClear.addEventListener("click", () => {
    void clearDrafts(caps.storage).then(() => void renderDrafts());
  });
  highlightsClear.addEventListener("click", () => {
    void clearHighlights(caps.storage).then(() => void renderHighlights());
  });
  readLaterClear.addEventListener("click", () => {
    void clearReadLater(caps.storage).then(() => void renderReadLater());
  });
  refreshMemory.addEventListener("click", () => void refreshAll());

  void refreshAll();
  return () => {
    // No timers to clean up in v1.
  };
}
