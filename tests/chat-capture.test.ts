import { describe, expect, it } from "vitest";
import { detectChatSite, extractMessages, extractTitle, type ChatSiteConfig } from "../src/core/chat-capture";

const configFor = (id: "chatgpt" | "claude" | "gemini"): ChatSiteConfig => {
  const found = detectChatSite(
    id === "chatgpt" ? "chatgpt.com" : id === "claude" ? "claude.ai" : "gemini.google.com"
  );
  expect(found).not.toBeNull();
  return found!;
};

function seedChat(html: string): void {
  document.body.innerHTML = html;
}

describe("chat-capture", () => {
  it("detects supported sites only", () => {
    expect(detectChatSite("chatgpt.com")?.id).toBe("chatgpt");
    expect(detectChatSite("claude.ai")?.id).toBe("claude");
    expect(detectChatSite("gemini.google.com")?.id).toBe("gemini");
    expect(detectChatSite("example.com")).toBeNull();
    expect(detectChatSite("evil-chatgpt.com")).toBeNull();
  });

  it("extracts ChatGPT messages in order with roles", () => {
    seedChat(`
      <div data-message-author-role="user">First question</div>
      <div data-message-author-role="assistant">The answer</div>
      <div data-message-author-role="user">Second question</div>
    `);
    const messages = extractMessages(configFor("chatgpt"), document.body, 1000);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0]?.text).toBe("First question");
    expect(messages[1]?.text).toBe("The answer");
    expect(messages[0]?.ts).toBe(1000);
  });

  it("extracts Claude messages via data-testid", () => {
    seedChat(`
      <div data-testid="user-message">Tell me a joke</div>
      <div data-testid="assistant-message">Why did the chicken…</div>
    `);
    const messages = extractMessages(configFor("claude"), document.body);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
  });

  it("does not double-count nested matches", () => {
    seedChat(`
      <div data-message-author-role="assistant">
        <div data-message-author-role="assistant">nested</div>
        <p>outer text</p>
      </div>
    `);
    const messages = extractMessages(configFor("chatgpt"), document.body);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toContain("outer text");
  });

  it("dedupes identical messages to the same id", () => {
    seedChat(`
      <div data-message-author-role="user">Hello</div>
    `);
    const first = extractMessages(configFor("chatgpt"), document.body);
    seedChat(`
      <div data-message-author-role="user">Hello</div>
      <div data-message-author-role="user">Hello</div>
    `);
    const second = extractMessages(configFor("chatgpt"), document.body);
    // Both captures produce the same ids for the same text.
    expect(second.map((m) => m.id)).toEqual([first[0]!.id, first[0]!.id]);
  });

  it("extracts a title from the page title", () => {
    seedChat(`<title>My big plan - Claude</title><div data-testid="user-message">Plan</div>`);
    expect(extractTitle(configFor("claude"), document)).toBe("My big plan");
  });

  it("falls back to the first user message for the title", () => {
    seedChat(`<title></title><div data-message-author-role="user">This is a long first message that should become the title</div>`);
    const title = extractTitle(configFor("chatgpt"), document);
    expect(title).toContain("This is a long first message");
  });
});
