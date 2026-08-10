import {
  conversationIdFor,
  upsertConversation,
  type ChatConversation
} from "./chat-vault";
import { extractMessages, extractTitle, type ChatSiteConfig } from "./chat-capture";
import type { KvStorage } from "./storage-utils";

/**
 * Content-script runner for the AI Chat Vault. Watches the chat page with a
 * MutationObserver, debounces, extracts messages, and upserts the local
 * vault. Capture is best-effort and never blocks the page.
 */
export function createChatVaultCapture(opts: {
  config: ChatSiteConfig;
  storage: KvStorage;
  now?: () => number;
}): { start: () => void; stop: () => void } {
  const { config, storage } = opts;
  const now = opts.now ?? Date.now;
  let timer: number | undefined;
  let observer: MutationObserver | null = null;
  let stopped = false;

  const capture = async (): Promise<void> => {
    if (stopped) return;
    const root = document.body;
    if (!root) return;
    const url = window.location.href;
    const pathname = window.location.pathname;
    const conversationId = conversationIdFor(config.id, pathname);
    const messages = extractMessages(config, root, now());
    if (messages.length === 0) return;
    const conversation: Omit<ChatConversation, "created" | "updated"> = {
      id: conversationId,
      siteId: config.id,
      title: extractTitle(config, root),
      url,
      messages
    };
    try {
      await upsertConversation(storage, conversation, now());
    } catch {
      // Best-effort: a storage failure must never break the page.
    }
  };

  const schedule = (delay = 1500): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => void capture(), delay);
  };

  return {
    start: () => {
      stopped = false;
      schedule(300); // initial capture
      observer = new MutationObserver(() => schedule());
      observer.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      observer?.disconnect();
      observer = null;
    }
  };
}
