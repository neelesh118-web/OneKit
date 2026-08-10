import {
  chatMessageId,
  type ChatMessage,
  type ChatRole
} from "./chat-vault";

/**
 * AI Chat Vault capture — best-effort DOM extraction for the supported chat
 * sites. Selectors are tied to each site's current DOM and may drift when
 * the sites change their markup; capture is deliberately best-effort and
 * the vault never depends on it (the data is a convenience copy).
 */

export type ChatSiteId = "chatgpt" | "claude" | "gemini";

export interface ChatSiteConfig {
  id: ChatSiteId;
  /** Selectors for message elements, in DOM order. */
  userSelector: string;
  assistantSelector: string;
}

export const CHAT_SITES: ChatSiteConfig[] = [
  {
    id: "chatgpt",
    userSelector: '[data-message-author-role="user"]',
    assistantSelector: '[data-message-author-role="assistant"]'
  },
  {
    id: "claude",
    userSelector: '[data-testid="user-message"]',
    assistantSelector: '[data-testid="assistant-message"]'
  },
  {
    id: "gemini",
    userSelector: '[data-message-author-role="user"]',
    assistantSelector: '[data-message-author-role="model"], .model-response-text'
  }
];

export function detectChatSite(hostname: string): ChatSiteConfig | null {
  const host = hostname.toLowerCase();
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) {
    return CHAT_SITES.find((s) => s.id === "chatgpt") ?? null;
  }
  if (host === "claude.ai" || host.endsWith(".claude.ai")) {
    return CHAT_SITES.find((s) => s.id === "claude") ?? null;
  }
  if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
    return CHAT_SITES.find((s) => s.id === "gemini") ?? null;
  }
  return null;
}

function elementText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isVisible(el: Element): boolean {
  // Explicitly-hidden elements are skipped; layout-based checks are avoided
  // because they are unreliable before layout and always zero in jsdom.
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

/**
 * Extracts all messages in DOM order from a chat page root. Deduplicates
 * nested matches (e.g. a container that matches both selectors or contains
 * a child match) by keeping only the OUTERMOST match per message.
 */
export function extractMessages(
  config: ChatSiteConfig,
  root: ParentNode,
  now: number = Date.now()
): ChatMessage[] {
  const matches: Array<{ role: ChatRole; el: Element }> = [];
  const seenEls = new Set<Element>();

  const collect = (selector: string, role: ChatRole): void => {
    let nodes: NodeListOf<Element>;
    try {
      nodes = root.querySelectorAll(selector);
    } catch {
      return;
    }
    for (const el of nodes) {
      // Skip elements nested inside an already-collected match.
      let parent: Element | null = el.parentElement;
      let nested = false;
      while (parent) {
        if (seenEls.has(parent)) {
          nested = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (nested) continue;
      if (seenEls.has(el)) continue;
      if (!isVisible(el)) continue;
      const text = elementText(el);
      if (!text) continue;
      seenEls.add(el);
      matches.push({ role, el });
    }
  };

  collect(config.userSelector, "user");
  collect(config.assistantSelector, "assistant");

  // DOM order (querySelectorAll returns document order; index by it).
  const order = new Map<Element, number>();
  root.querySelectorAll("*").forEach((el, i) => order.set(el, i));
  matches.sort((a, b) => (order.get(a.el) ?? 0) - (order.get(b.el) ?? 0));

  return matches.map(({ role, el }) => {
    const text = elementText(el);
    return { id: chatMessageId(role, text), role, text, ts: now };
  });
}

/** A stable conversation title: page title minus the site suffix. */
export function extractTitle(config: ChatSiteConfig, root: ParentNode): string {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const title = doc?.title?.trim() ?? "";
  if (title) {
    // Strip common suffixes like " - ChatGPT" / " | Claude".
    const cleaned = title
      .replace(/\s*[-|–—]\s*(ChatGPT|Claude|Gemini|Google AI Studio).*$/i, "")
      .trim();
    if (cleaned) return cleaned.slice(0, 120);
  }
  // Fall back to the first user message.
  const first = extractMessages(config, root, 0).find((m) => m.role === "user");
  if (first) return first.text.slice(0, 80);
  return "Untitled chat";
}
