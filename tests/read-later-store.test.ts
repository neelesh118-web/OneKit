import { describe, expect, it } from "vitest";
import {
  addReadLater,
  clearReadLater,
  listReadLater,
  markReadLater,
  removeReadLater
} from "../src/core/read-later-store";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("read-later-store", () => {
  it("adds and lists items newest first", async () => {
    const s = storage();
    await addReadLater(s, "https://a.com/", "Alpha", 100);
    await addReadLater(s, "https://b.com/", "Beta", 200);
    const list = await listReadLater(s);
    expect(list.map((i) => i.title)).toEqual(["Beta", "Alpha"]);
    expect(list.every((i) => i.read === false)).toBe(true);
  });

  it("dedupes by url and bumps to unread", async () => {
    const s = storage();
    const first = await addReadLater(s, "https://a.com/", "Alpha", 100);
    await markReadLater(s, first.id, true);
    const again = await addReadLater(s, "https://a.com/", "Alpha", 300);
    expect(again.id).toBe(first.id);
    const list = await listReadLater(s);
    expect(list).toHaveLength(1);
    expect(list[0]?.read).toBe(false);
    expect(list[0]?.savedAt).toBe(300);
  });

  it("marks read and removes", async () => {
    const s = storage();
    const item = await addReadLater(s, "https://a.com/", "A", 1);
    await markReadLater(s, item.id, true);
    expect((await listReadLater(s))[0]?.read).toBe(true);
    await removeReadLater(s, item.id);
    expect(await listReadLater(s)).toHaveLength(0);
    await addReadLater(s, "https://b.com/", "B", 2);
    await clearReadLater(s);
    expect(await listReadLater(s)).toHaveLength(0);
  });
});
