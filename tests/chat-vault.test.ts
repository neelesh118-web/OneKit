import { describe, expect, it } from "vitest";
import {
  chatMessageId,
  clearVault,
  conversationIdFor,
  deleteConversation,
  exportConversationMarkdown,
  listConversations,
  MAX_VAULT_CONVERSATIONS,
  searchConversations,
  upsertConversation,
  vaultStats,
  type ChatConversation
} from "../src/core/chat-vault";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

const conv = (id: string, messages: ChatConversation["messages"], title = "T"): Omit<ChatConversation, "created" | "updated"> => ({
  id,
  siteId: "claude",
  title,
  url: `https://claude.ai${id}`,
  messages
});

describe("chat-vault", () => {
  it("builds stable ids and conversation keys", () => {
    expect(chatMessageId("user", "Hello world")).toBe(chatMessageId("user", "  Hello   world "));
    expect(chatMessageId("user", "a")).not.toBe(chatMessageId("assistant", "a"));
    expect(conversationIdFor("claude", "/chat/abc/")).toBe("claude:/chat/abc");
  });

  it("upserts a conversation and dedupes re-captures by message id", async () => {
    const s = storage();
    const messages = [
      { id: chatMessageId("user", "hi"), role: "user" as const, text: "hi", ts: 1 },
      { id: chatMessageId("assistant", "hello"), role: "assistant" as const, text: "hello", ts: 2 }
    ];
    await upsertConversation(s, conv("c1", messages), 100);
    // Re-capture: same messages again, plus one new.
    const again = [
      ...messages,
      { id: chatMessageId("user", "another"), role: "user" as const, text: "another", ts: 3 }
    ];
    await upsertConversation(s, conv("c1", again), 200);
    const list = await listConversations(s);
    expect(list).toHaveLength(1);
    expect(list[0]?.messages).toHaveLength(3);
    expect(list[0]?.updated).toBe(200);
  });

  it("searches title and message text", async () => {
    const s = storage();
    await upsertConversation(s, conv("c1", [{ id: "u1", role: "user", text: "kubernetes networking", ts: 1 }], "K8s notes"), 100);
    await upsertConversation(s, conv("c2", [{ id: "u2", role: "user", text: "pasta recipe", ts: 2 }], "Dinner"), 200);
    expect(await searchConversations(s, "kubernetes")).toHaveLength(1);
    expect(await searchConversations(s, "dinner")).toHaveLength(1);
    expect(await searchConversations(s, "pasta")).toHaveLength(1);
    expect(await searchConversations(s, "zzz")).toHaveLength(0);
  });

  it("caps total conversations", async () => {
    const s = storage();
    for (let i = 0; i < MAX_VAULT_CONVERSATIONS + 3; i++) {
      await upsertConversation(s, conv(`c${i}`, [{ id: `u${i}`, role: "user", text: `m${i}`, ts: i }]), i);
    }
    expect(await listConversations(s)).toHaveLength(MAX_VAULT_CONVERSATIONS);
  });

  it("caps messages per conversation", async () => {
    const s = storage();
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      role: "user" as const,
      text: `message ${i}`,
      ts: i
    }));
    await upsertConversation(s, conv("c1", many), 1);
    const [saved] = await listConversations(s);
    expect(saved!.messages.length).toBeLessThanOrEqual(400);
  });

  it("deletes, clears, and reports stats", async () => {
    const s = storage();
    await upsertConversation(s, conv("c1", [{ id: "u1", role: "user", text: "one", ts: 1 }]), 1);
    await upsertConversation(s, conv("c2", [{ id: "u2", role: "user", text: "two", ts: 2 }]), 2);
    await deleteConversation(s, "c1");
    expect(await listConversations(s)).toHaveLength(1);
    const stats = await vaultStats(s);
    expect(stats.conversations).toBe(1);
    expect(stats.messages).toBe(1);
    await clearVault(s);
    expect(await listConversations(s)).toHaveLength(0);
  });

  it("exports markdown with both roles", async () => {
    const s = storage();
    const saved = await upsertConversation(
      s,
      conv("c1", [
        { id: "u1", role: "user", text: "hello", ts: 1 },
        { id: "a1", role: "assistant", text: "hi there", ts: 2 }
      ]),
      1
    );
    const md = exportConversationMarkdown(saved);
    expect(md).toContain("# T");
    expect(md).toContain("**You**");
    expect(md).toContain("**Assistant**");
    expect(md).toContain("hello");
    expect(md).toContain("hi there");
  });
});
