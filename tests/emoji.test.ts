// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emojiCount, EMOJI_GROUPS, searchEmoji } from "../src/core/emoji";

describe("emoji picker", () => {
  it("ships a curated set with no duplicate emoji", () => {
    expect(emojiCount()).toBeGreaterThan(100);
    const seen = new Set<string>();
    for (const group of EMOJI_GROUPS) {
      for (const item of group.items) {
        expect(seen.has(item.emoji)).toBe(false);
        seen.add(item.emoji);
      }
    }
  });

  it("searches by name and keywords, case-insensitively", () => {
    expect(searchEmoji("pizza")[0]?.emoji).toBe("🍕");
    expect(searchEmoji("laugh").some((e) => e.emoji === "😂")).toBe(true);
    expect(searchEmoji("LOVE").some((e) => e.emoji === "❤️")).toBe(true);
  });

  it("returns everything on an empty query and nothing on garbage", () => {
    expect(searchEmoji("")).toHaveLength(emojiCount());
    expect(searchEmoji("zzzznotreal")).toHaveLength(0);
  });
});
