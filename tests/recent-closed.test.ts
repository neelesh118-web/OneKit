import { describe, expect, it } from "vitest";
import { closedTabLabel, recentClosedTabs, type SessionLike } from "../src/core/recent-closed";

describe("recently closed tabs", () => {
  it("keeps only tab sessions, ignoring windows", () => {
    const sessions: SessionLike[] = [
      { tab: { sessionId: "s1", url: "https://a.com", title: "A" } },
      { window: { sessionId: "w1" } },
      { tab: { sessionId: "s2", url: "https://b.com", title: "B" } }
    ];
    const tabs = recentClosedTabs(sessions);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.url).toBe("https://a.com");
    expect(tabs[1]!.url).toBe("https://b.com");
  });

  it("drops sessions without a url or sessionId", () => {
    const sessions: SessionLike[] = [
      { tab: { sessionId: "s1" } },
      { tab: { url: "https://a.com" } },
      { tab: { sessionId: "s2", url: "https://a.com" } }
    ];
    expect(recentClosedTabs(sessions)).toHaveLength(1);
  });

  it("dedupes by sessionId and caps the list", () => {
    const sessions: SessionLike[] = [
      { tab: { sessionId: "dup", url: "https://a.com" } },
      { tab: { sessionId: "dup", url: "https://a.com" } },
      { tab: { sessionId: "s2", url: "https://b.com" } },
      { tab: { sessionId: "s3", url: "https://c.com" } }
    ];
    expect(recentClosedTabs(sessions, 2)).toHaveLength(2);
  });

  it("labels tabs with a title fallback and truncation", () => {
    const long = "x".repeat(100);
    expect(closedTabLabel({ title: "Hello", url: "https://a.com" })).toBe("Hello");
    expect(closedTabLabel({ url: "https://a.com" })).toBe("https://a.com");
    expect(closedTabLabel({ title: long })).toHaveLength(60);
  });
});
