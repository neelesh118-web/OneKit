import {
  deleteSnippet,
  isValidAlias,
  listSnippets,
  localStorageSnippets,
  normalizeAlias,
  saveSnippet
} from "../core/snippets";
import { textStats } from "../core/text-utils";
import { sortTabsByPosition } from "../core/tab-tools";
import { tabsToMarkdown } from "../core/markdown";
import { EMOJI_GROUPS, searchEmoji } from "../core/emoji";
import { CASE_STYLES, convertCase, type CaseStyle } from "../core/case-convert";
import { replaceSummary } from "../core/find-replace";
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

  /* Copy as Markdown ----------------------------------------------------- */
  const mdActiveTab = $("md-active-tab") as HTMLButtonElement;
  const mdAllTabs = $("md-all-tabs") as HTMLButtonElement;
  const mdPageLinks = $("md-page-links") as HTMLButtonElement;
  const mdStatus = $("md-status");

  function flashCopied(message: string): void {
    mdStatus.textContent = message;
    window.setTimeout(() => (mdStatus.textContent = ""), 2500);
  }

  mdActiveTab.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.url) {
        mdStatus.textContent = "No normal page open to copy.";
        return;
      }
      const md = tabsToMarkdown([tab]);
      if (!md) {
        mdStatus.textContent = "That page can't be copied as Markdown (http/https only).";
        return;
      }
      await caps.copyText(md);
      flashCopied("Active tab copied as Markdown ✓");
    })().catch(() => {
      mdStatus.textContent = "Could not copy.";
    });
  });

  mdAllTabs.addEventListener("click", () => {
    void (async () => {
      const tabs = sortTabsByPosition(await caps.queryTabs());
      const md = tabsToMarkdown(tabs);
      if (!md) {
        mdStatus.textContent = "No http(s) tabs open to copy.";
        return;
      }
      await caps.copyText(md);
      flashCopied(`Copied ${tabs.filter((t) => t.url).length} tabs as Markdown ✓`);
    })().catch(() => {
      mdStatus.textContent = "Could not copy tabs.";
    });
  });

  mdPageLinks.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (tab.id === undefined) {
        mdStatus.textContent = "No page open to read links from.";
        return;
      }
      await caps.sendMessage(tab.id, { type: "ok:copy-all-links" });
      flashCopied("Asked the page to copy its links — check the toast there.");
    })().catch(() => {
      mdStatus.textContent = "Could not reach that page (it may not have OneKit loaded).";
    });
  });

  /* Emoji picker -------------------------------------------------------- */
  const emojiSearch = $("emoji-search") as HTMLInputElement;
  const emojiGrid = $("emoji-grid");
  const emojiStatus = $("emoji-status");

  function renderEmoji(): void {
    const results = searchEmoji(emojiSearch.value);
    emojiGrid.innerHTML = "";
    if (results.length === 0) {
      emojiStatus.textContent = "No emoji match that search.";
      return;
    }
    emojiStatus.textContent = `${results.length} emoji — click any to copy it.`;
    for (const entry of results) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-cell";
      btn.textContent = entry.emoji;
      btn.title = entry.name;
      btn.addEventListener("click", () => {
        void caps.copyText(entry.emoji).then(() => {
          emojiStatus.textContent = `${entry.emoji} ${entry.name} — copied ✓`;
        });
      });
      emojiGrid.appendChild(btn);
    }
  }

  emojiSearch.addEventListener("input", renderEmoji);
  renderEmoji();
  void EMOJI_GROUPS; // keep the grouped export referenced for tree-shaking

  /* Text case converter -------------------------------------------------- */
  const caseInput = $("case-input") as HTMLTextAreaElement;
  const caseStyle = $("case-style") as HTMLSelectElement;
  const caseConvertBtn = $("case-convert-btn") as HTMLButtonElement;
  const caseOutput = $("case-output") as HTMLInputElement;
  const caseCopy = $("case-copy") as HTMLButtonElement;
  const caseStatus = $("case-status");

  for (const style of CASE_STYLES) {
    const option = document.createElement("option");
    option.value = style.id;
    option.textContent = `${style.label} — ${style.example}`;
    caseStyle.appendChild(option);
  }

  caseConvertBtn.addEventListener("click", () => {
    const text = caseInput.value;
    if (!text.trim()) {
      caseStatus.textContent = "Type or paste some text first.";
      caseOutput.value = "";
      caseCopy.disabled = true;
      return;
    }
    caseOutput.value = convertCase(text, caseStyle.value as CaseStyle);
    caseCopy.disabled = false;
    caseStatus.textContent = "Converted locally — nothing leaves your device.";
  });

  caseCopy.addEventListener("click", () => {
    void caps.copyText(caseOutput.value).then(() => {
      caseStatus.textContent = "Copied ✓";
      window.setTimeout(() => (caseStatus.textContent = ""), 1500);
    });
  });

  /* Find & replace on page ----------------------------------------------- */
  const frQuery = $("fr-query") as HTMLInputElement;
  const frReplacement = $("fr-replacement") as HTMLInputElement;
  const frCase = $("fr-case") as HTMLInputElement;
  const frRun = $("fr-run") as HTMLButtonElement;
  const frStatus = $("fr-status");

  frRun.addEventListener("click", () => {
    void (async () => {
      const query = frQuery.value.trim();
      if (!query) {
        frStatus.textContent = "Type the text you want to find first.";
        return;
      }
      const tab = await caps.getActiveTab();
      if (tab.id === undefined) {
        frStatus.textContent = "Open a normal page first.";
        return;
      }
      const result = (await caps.sendMessage(tab.id, {
        type: "ok:find-replace",
        query,
        replacement: frReplacement.value,
        caseSensitive: frCase.checked
      })) as { replaced?: number } | undefined;
      const replaced = result?.replaced ?? 0;
      frStatus.textContent =
        replaced > 0
          ? `${replaceSummary(replaced)} Check the toast on the page.`
          : "No matches on this page. The page may need a reload if it just changed.";
    })().catch(() => {
      frStatus.textContent = "Could not reach the page — reload it and try again.";
    });
  });

  void renderSnippets();
  return () => {};
}
