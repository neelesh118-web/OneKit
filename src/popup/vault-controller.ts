import {
  clearVault,
  deleteConversation,
  exportConversationMarkdown,
  listConversations,
  searchConversations,
  vaultStats
} from "../core/chat-vault";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Vault tab — the AI Chat Vault: search, open, export, delete saved
 * conversations. All local.
 */
export function createVaultController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const search = $("vault-search") as HTMLInputElement;
  const results = $("vault-results");
  const status = $("vault-status");
  const count = $("vault-count");
  const refreshBtn = $("vault-refresh") as HTMLButtonElement;
  const clearBtn = $("vault-clear") as HTMLButtonElement;

  const SITE_LABELS: Record<string, string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini"
  };

  async function render(): Promise<void> {
    const q = search.value;
    const conversations = q.trim() ? await searchConversations(caps.storage, q) : await listConversations(caps.storage);
    results.innerHTML = "";
    if (conversations.length === 0) {
      status.textContent = q.trim()
        ? "No chats match."
        : "No chats saved yet. Turn on 'Save AI chat conversations locally' in Settings, then use ChatGPT / Claude / Gemini.";
      return;
    }
    status.textContent = `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}.`;
    for (const conversation of conversations) {
      const row = document.createElement("div");
      row.className = "result-row";

      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = conversation.title;

      const meta = document.createElement("span");
      meta.className = "result-meta";
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      meta.textContent = `${SITE_LABELS[conversation.siteId] ?? conversation.siteId} · ${conversation.messages.length} messages · ${new Date(conversation.updated).toLocaleString()}${lastMessage ? ` · ${lastMessage.text.slice(0, 60)}` : ""}`;

      const actions = document.createElement("div");
      actions.className = "btn-row";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "mini-btn";
      open.textContent = "Open";
      open.addEventListener("click", () => {
        void caps.openUrl(conversation.url);
        window.close();
      });

      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "mini-btn";
      exportBtn.textContent = "Export .md";
      exportBtn.addEventListener("click", () => {
        const md = exportConversationMarkdown(conversation);
        const filename = `${conversation.title.slice(0, 50).replace(/[\\/:*?"<>|]/g, "")}.md`;
        caps.downloadText(md, filename);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "mini-btn danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        void deleteConversation(caps.storage, conversation.id).then(() => void render());
      });

      actions.append(open, exportBtn, deleteBtn);
      row.append(title, meta, actions);
      results.appendChild(row);
    }
  }

  async function refreshCount(): Promise<void> {
    const stats = await vaultStats(caps.storage);
    count.textContent = `${stats.conversations} chats · ${stats.messages} msgs`;
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([render(), refreshCount()]);
  }

  let debounce: number | undefined;
  search.addEventListener("input", () => {
    if (debounce !== undefined) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void render(), 200);
  });
  refreshBtn.addEventListener("click", () => void refreshAll());
  clearBtn.addEventListener("click", () => {
    void clearVault(caps.storage).then(() => void refreshAll());
  });

  void refreshAll();
  return () => {};
}
