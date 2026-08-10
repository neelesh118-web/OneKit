import { describe, expect, it } from "vitest";
import {
  addClipboardEntry,
  clearClipboard,
  listClipboard,
  normalizeClipboardText,
  removeClipboardEntry
} from "../src/core/clipboard-store";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("clipboard-store", () => {
  it("normalizes copied text", () => {
    expect(normalizeClipboardText("  hello   world  ")).toBe("hello world");
    expect(normalizeClipboardText("   ")).toBe("");
    expect(normalizeClipboardText("x".repeat(5000)).length).toBe(4000);
  });

  it("adds entries newest first with url", async () => {
    const s = storage();
    await addClipboardEntry(s, "first copy", 100, "https://a.com");
    await addClipboardEntry(s, "second copy", 200, "https://b.com");
    const list = await listClipboard(s);
    expect(list.map((e) => e.text)).toEqual(["second copy", "first copy"]);
    expect(list[0]?.url).toBe("https://b.com");
  });

  it("dedupes exact text by moving it to the front", async () => {
    const s = storage();
    await addClipboardEntry(s, "same", 100);
    await addClipboardEntry(s, "other", 200);
    await addClipboardEntry(s, "same", 300);
    const list = await listClipboard(s);
    expect(list).toHaveLength(2);
    expect(list[0]?.text).toBe("same");
  });

  it("caps at MAX_CLIPBOARD_ENTRIES and ignores empty", async () => {
    const s = storage();
    for (let i = 0; i < 60; i++) await addClipboardEntry(s, `entry ${i}`, i);
    expect(await listClipboard(s)).toHaveLength(50);
    expect(await addClipboardEntry(s, "   ")).toBeNull();
  });

  it("removes and clears", async () => {
    const s = storage();
    await addClipboardEntry(s, "one", 1);
    await addClipboardEntry(s, "two", 2);
    const [first] = await listClipboard(s);
    await removeClipboardEntry(s, first!.id);
    expect(await listClipboard(s)).toHaveLength(1);
    await clearClipboard(s);
    expect(await listClipboard(s)).toHaveLength(0);
  });
});
