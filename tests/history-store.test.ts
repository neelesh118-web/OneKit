import { describe, expect, it } from "vitest";
import {
  addHistoryEntry,
  clearHistory,
  extractPageText,
  historyStats,
  listHistory,
  MAX_HISTORY_ENTRIES,
  removeHistoryEntry,
  searchHistory
} from "../src/core/history-store";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("history-store", () => {
  it("extracts and collapses page text", () => {
    expect(extractPageText("  hello   world\n\nagain  ")).toBe("hello world again");
    expect(extractPageText("a".repeat(5000), 100).length).toBe(100);
  });

  it("adds and searches entries", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/x", "Alpha page", "the red fox jumped", 1000);
    await addHistoryEntry(s, "https://b.com/y", "Beta page", "green frog swimming", 2000);
    const hits = await searchHistory(s, "fox");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.url).toBe("https://a.com/x");
    expect(await searchHistory(s, "green")).toHaveLength(1);
    expect(await searchHistory(s, "missing")).toHaveLength(0);
  });

  it("searches titles too and sorts newest first", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/1", "Rust guide", "content one", 100);
    await addHistoryEntry(s, "https://b.com/2", "Other", "rust in peace content", 300);
    const hits = await searchHistory(s, "rust");
    expect(hits.map((h) => h.url)).toEqual(["https://b.com/2", "https://a.com/1"]);
  });

  it("dedupes by url and bumps visits", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/", "Page", "hello", 100);
    await addHistoryEntry(s, "https://a.com/", "Page", "hello", 200);
    const list = await listHistory(s);
    expect(list).toHaveLength(1);
    expect(list[0]?.visits).toBe(2);
    expect(list[0]?.ts).toBe(200);
  });

  it("caps total entries at the max and drops the oldest", async () => {
    const s = storage();
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 2; i++) {
      await addHistoryEntry(s, `https://a.com/${i}`, `P${i}`, "text", i);
    }
    const list = await listHistory(s);
    expect(list).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(list.some((e) => e.url === "https://a.com/0")).toBe(false);
    expect(list.some((e) => e.url === `https://a.com/${MAX_HISTORY_ENTRIES + 1}`)).toBe(true);
  });

  it("removes and clears", async () => {
    const s = storage();
    await addHistoryEntry(s, "https://a.com/1", "One", "text", 1);
    await addHistoryEntry(s, "https://a.com/2", "Two", "text", 2);
    await removeHistoryEntry(s, "https://a.com/1");
    expect(await listHistory(s)).toHaveLength(1);
    await clearHistory(s);
    expect(await historyStats(s)).toEqual({ count: 0, bytes: 2 });
  });
});
