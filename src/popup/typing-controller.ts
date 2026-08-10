import {
  deleteSnippet,
  isValidAlias,
  listSnippets,
  localStorageSnippets,
  normalizeAlias,
  saveSnippet
} from "../core/snippets";
import { textStats } from "../core/text-utils";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Typing tab — text expander snippets (CRUD) and the word counter.
 * The expander engine runs in the content script; this controller manages
 * the snippet library and previews the counter locally.
 */
export function createTypingController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const aliasInput = $("snippet-alias") as HTMLInputElement;
  const textInput = $("snippet-text") as HTMLTextAreaElement;
  const addBtn = $("snippet-add") as HTMLButtonElement;
  const listEl = $("snippet-list");
  const status = $("snippet-status");

  const counterInput = $("counter-input") as HTMLTextAreaElement;
  const counterStats = $("counter-stats");

  async function renderSnippets(): Promise<void> {
    const snippets = await listSnippets(caps.storage);
    listEl.innerHTML = "";
    if (snippets.length === 0) {
      listEl.textContent = "No snippets yet. Add one above — type ;alias + space on any page to expand it.";
      return;
    }
    for (const snippet of snippets) {
      const row = document.createElement("div");
      row.className = "result-row";
      const head = document.createElement("strong");
      head.className = "result-title";
      head.textContent = `;${snippet.alias}`;
      const preview = document.createElement("p");
      preview.className = "result-snippet";
      preview.textContent = snippet.text.slice(0, 80);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini-btn danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        void deleteSnippet(caps.storage, snippet.id).then(() => void renderSnippets());
      });
      row.append(head, preview, del);
      listEl.appendChild(row);
    }
  }

  function addSnippet(): void {
    const alias = normalizeAlias(aliasInput.value);
    if (!isValidAlias(alias)) {
      status.textContent = "Alias: 1–24 chars of letters, numbers, dot, dash or underscore (e.g. addr).";
      return;
    }
    if (!textInput.value.trim()) {
      status.textContent = "Snippet text cannot be empty.";
      return;
    }
    void saveSnippet(caps.storage, alias, textInput.value).then((result) => {
      if (result.ok) {
        status.textContent = `Saved ;${alias}. Type it + space on any page to expand.`;
        aliasInput.value = "";
        textInput.value = "";
        void renderSnippets();
      } else {
        status.textContent = result.error ?? "Could not save snippet.";
      }
    });
  }

  addBtn.addEventListener("click", addSnippet);
  aliasInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSnippet();
    }
  });

  counterInput.addEventListener("input", () => {
    const stats = textStats(counterInput.value);
    counterStats.textContent = counterInput.value
      ? `${stats.words} words · ${stats.chars} characters · ${stats.charsNoSpaces} without spaces · ${stats.lines} lines`
      : "Start typing or paste text to count it.";
  });

  void renderSnippets();
  return () => {};
}
