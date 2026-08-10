import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * AI Chat Vault — local archive of conversations from AI chat sites
 * (ChatGPT / Claude / Gemini). Every message is stored on-device only;
 * nothing here ever leaves the browser. Capped, deduped, searchable,
 * exportable.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  /** Stable id derived from role + text so re-captures never duplicate. */
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
}

export interface ChatConversation {
  /** `${site}:${pathname}` — stable across visits to the same chat. */
  id: string;
  siteId: string;
  title: string;
  url: string;
  messages: ChatMessage[];
  created: number;
  updated: number;
}

export const CHAT_VAULT_STORAGE_KEY = "ok.chatVault";
export const MAX_VAULT_CONVERSATIONS = 50;
export const MAX_MESSAGES_PER_CONVERSATION = 400;
export const MAX_MESSAGE_CHARS = 8000;

/** Small stable string hash (djb2) — used for message ids, not security. */
export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeChatText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_CHARS);
}

export function chatMessageId(role: ChatRole, text: string): string {
  return `${role[0]}-${stableHash(normalizeChatText(text))}`;
}

export function conversationIdFor(siteId: string, pathname: string): string {
  return `${siteId}:${pathname.replace(/\/+$/, "") || "/"}`;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.role === "user" || v.role === "assistant") &&
    typeof v.text === "string" &&
    typeof v.ts === "number"
  );
}

function isChatConversation(value: unknown): value is ChatConversation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.siteId === "string" &&
    typeof v.title === "string" &&
    typeof v.url === "string" &&
    Array.isArray(v.messages) &&
    v.messages.every(isChatMessage)
  );
}

async function readConversations(storage: KvStorage): Promise<ChatConversation[]> {
  const raw = await storage.get(CHAT_VAULT_STORAGE_KEY);
  const list = raw[CHAT_VAULT_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isChatConversation);
}

async function writeConversations(storage: KvStorage, conversations: ChatConversation[]): Promise<void> {
  await storage.set({ [CHAT_VAULT_STORAGE_KEY]: conversations });
}

/**
 * Upserts a captured conversation. Merges by message id so re-captures of
 * the same chat never duplicate, keeps the newest title, and caps both
 * messages-per-conversation and total conversations.
 */
export async function upsertConversation(
  storage: KvStorage,
  conversation: Omit<ChatConversation, "created" | "updated">,
  now: number = Date.now()
): Promise<ChatConversation> {
  const messages = conversation.messages
    .map((m) => ({ ...m, text: normalizeChatText(m.text) }))
    .filter((m) => m.text.length > 0)
    .slice(-MAX_MESSAGES_PER_CONVERSATION);

  const existingList = await readConversations(storage);
  const existing = existingList.find((c) => c.id === conversation.id);
  const merged: ChatConversation = existing
    ? {
        ...existing,
        title: conversation.title || existing.title,
        url: conversation.url || existing.url,
        updated: now
      }
    : {
        ...conversation,
        title: conversation.title || "Untitled chat",
        created: now,
        updated: now
      };

  // Merge by message id, keep order, cap.
  const byId = new Map<string, ChatMessage>();
  for (const m of [...merged.messages, ...messages]) byId.set(m.id, m);
  merged.messages = [...byId.values()].slice(-MAX_MESSAGES_PER_CONVERSATION);

  const withoutExisting = existingList.filter((c) => c.id !== conversation.id);
  const next = [merged, ...withoutExisting].slice(0, MAX_VAULT_CONVERSATIONS);
  await writeConversations(storage, next);
  return merged;
}

export async function listConversations(storage: KvStorage): Promise<ChatConversation[]> {
  const list = await readConversations(storage);
  return list.sort((a, b) => b.updated - a.updated);
}

export async function getConversation(storage: KvStorage, id: string): Promise<ChatConversation | null> {
  const list = await readConversations(storage);
  return list.find((c) => c.id === id) ?? null;
}

export async function searchConversations(
  storage: KvStorage,
  query: string,
  limit: number = 30
): Promise<ChatConversation[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const list = await readConversations(storage);
  return list
    .filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text.toLowerCase().includes(q))
    )
    .sort((a, b) => b.updated - a.updated)
    .slice(0, limit);
}

export async function deleteConversation(storage: KvStorage, id: string): Promise<void> {
  const list = await readConversations(storage);
  await writeConversations(storage, list.filter((c) => c.id !== id));
}

export async function clearVault(storage: KvStorage): Promise<void> {
  await storage.remove(CHAT_VAULT_STORAGE_KEY);
}

export async function vaultStats(storage: KvStorage): Promise<{
  conversations: number;
  messages: number;
  bytes: number;
}> {
  const list = await readConversations(storage);
  const messages = list.reduce((n, c) => n + c.messages.length, 0);
  const bytes = JSON.stringify(list).length;
  return { conversations: list.length, messages, bytes };
}

/** Renders one conversation as Markdown for export/download. */
export function exportConversationMarkdown(conversation: ChatConversation): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title}`);
  lines.push("");
  lines.push(`> ${conversation.url}`);
  lines.push("");
  for (const message of conversation.messages) {
    const speaker = message.role === "user" ? "**You**" : "**Assistant**";
    lines.push(`### ${speaker}`);
    lines.push("");
    lines.push(message.text);
    lines.push("");
  }
  return lines.join("\n");
}

export function localStorageVault(): KvStorage {
  return localStorageArea();
}
