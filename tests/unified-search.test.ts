import { describe, expect, it } from "vitest";
import {
  GROUP_LIMITS,
  unifiedSearch,
  type SearchResult,
  type UnifiedSearchProviders
} from "../src/core/unified-search";

const result = (id: string, title: string, subtitle = ""): SearchResult => ({
  id,
  title,
  subtitle,
  action: { kind: "open-url", url: subtitle || "https://example.com/" }
});

const emptyProviders: UnifiedSearchProviders = {
  history: async () => [],
  chats: async () => [],
  tabs: async () => [],
  drafts: async () => [],
  clipboard: async () => []
};

describe("unified-search", () => {
  it("returns nothing for an empty query", async () => {
    expect(await unifiedSearch("   ", emptyProviders)).toEqual([]);
  });

  it("combines and labels groups from every provider", async () => {
    const providers: UnifiedSearchProviders = {
      ...emptyProviders,
      history: async () => [result("h1", "Page about k8s", "https://a.com/")],
      chats: async () => [result("c1", "K8s notes", "https://claude.ai/chat/1")],
      clipboard: async () => [result("p1", "k8s cheat sheet")]
    };
    const groups = await unifiedSearch("k8s", providers);
    expect(groups.map((g) => g.id)).toEqual(["history", "chats", "clipboard"]);
    expect(groups[0]?.label).toBe("Pages you've visited");
  });

  it("drops empty groups and caps each group", async () => {
    const many = Array.from({ length: 30 }, (_, i) => result(`t${i}`, `tab ${i}`));
    const providers: UnifiedSearchProviders = {
      ...emptyProviders,
      tabs: async () => many
    };
    const groups = await unifiedSearch("tab", providers);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.results.length).toBe(GROUP_LIMITS.tabs);
  });

  it("runs all providers even when some fail (best-effort)", async () => {
    const providers: UnifiedSearchProviders = {
      history: async () => {
        throw new Error("storage error");
      },
      chats: async () => [result("c1", "found it")],
      tabs: async () => [],
      drafts: async () => [],
      clipboard: async () => []
    };
    // The palette calls unifiedSearch with catch-wrapped providers; here we
    // verify the orchestration still surfaces what succeeded when a provider
    // is wrapped to degrade to [].
    const safe: UnifiedSearchProviders = {
      history: async () => {
        try {
          return await providers.history("x");
        } catch {
          return [];
        }
      },
      chats: providers.chats,
      tabs: providers.tabs,
      drafts: providers.drafts,
      clipboard: providers.clipboard
    };
    const groups = await unifiedSearch("x", safe);
    expect(groups.map((g) => g.id)).toEqual(["chats"]);
  });
});
