import { describe, expect, it } from "vitest";
import {
  clearArchive,
  listArchive,
  MAX_ARCHIVE_ITEMS,
  removeArchiveItem,
  saveArchiveItem,
  searchArchive
} from "../src/core/web-archive";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();
const entry = (overrides: Partial<{ url: string; title: string; text: string; html: string }> = {}) => ({
  url: "https://example.com/post",
  title: "Example Post",
  text: "This is the readable body text of the saved page.",
  html: "<html><body><p>full html</p></body></html>",
  ...overrides
});

describe("web archive", () => {
  it("saves, lists, and searches items", async () => {
    const s = storage();
    const saved = await saveArchiveItem(s, entry(), 1000);
    expect(saved).not.toBeNull();
    expect(saved!.id).toMatch(/^arch-/);
    expect(await listArchive(s)).toHaveLength(1);
    const found = await searchArchive(s, "readable body");
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toBe("Example Post");
    expect(await searchArchive(s, "nothing-matches-this")).toHaveLength(0);
  });

  it("refuses to save empty pages", async () => {
    const s = storage();
    expect(await saveArchiveItem(s, entry({ text: "   " }), 1)).toBeNull();
    expect(await listArchive(s)).toHaveLength(0);
  });

  it("caps the archive at MAX_ARCHIVE_ITEMS, newest first", async () => {
    const s = storage();
    for (let i = 0; i < MAX_ARCHIVE_ITEMS + 5; i++) {
      await saveArchiveItem(s, entry({ url: `https://example.com/${i}`, title: `post ${i}` }), i);
    }
    const items = await listArchive(s);
    expect(items).toHaveLength(MAX_ARCHIVE_ITEMS);
    // Newest (highest timestamp) first.
    expect(items[0]!.title).toBe(`post ${MAX_ARCHIVE_ITEMS + 4}`);
  });

  it("truncates very large HTML", async () => {
    const s = storage();
    const saved = await saveArchiveItem(s, entry({ html: "x".repeat(500_000) }), 1);
    expect(saved!.html.length).toBeLessThanOrEqual(400_000);
  });

  it("removes single items and clears the archive", async () => {
    const s = storage();
    const a = await saveArchiveItem(s, entry({ url: "https://a.com/", title: "a" }), 1);
    const b = await saveArchiveItem(s, entry({ url: "https://b.com/", title: "b" }), 2);
    await removeArchiveItem(s, a!.id);
    const items = await listArchive(s);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(b!.id);
    await clearArchive(s);
    expect(await listArchive(s)).toHaveLength(0);
  });
});
