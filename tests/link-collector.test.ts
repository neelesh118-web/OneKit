// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addCollectedLink,
  clearCollection,
  collectionToCsv,
  collectionToMarkdown,
  loadCollection,
  removeCollectedLink
} from "../src/core/link-collector";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;

describe("addCollectedLink", () => {
  it("adds and dedupes", async () => {
    const storage = createMemoryStorage();
    const first = await addCollectedLink({ url: "https://a.com", title: "A" }, storage, NOW);
    expect(first.added).toBe(true);
    expect(first.count).toBe(1);
    const dup = await addCollectedLink({ url: "https://a.com", title: "A" }, storage, NOW);
    expect(dup.added).toBe(false);
    expect(dup.count).toBe(1);
  });
  it("rejects non-http URLs", async () => {
    const storage = createMemoryStorage();
    const r = await addCollectedLink({ url: "javascript:alert(1)" }, storage, NOW);
    expect(r.added).toBe(false);
  });
  it("newest first", async () => {
    const storage = createMemoryStorage();
    await addCollectedLink({ url: "https://a.com" }, storage, NOW);
    await addCollectedLink({ url: "https://b.com" }, storage, NOW + 1);
    const list = await loadCollection(storage);
    expect(list[0]!.url).toBe("https://b.com");
  });
});

describe("exports", () => {
  it("markdown renders links", async () => {
    const storage = createMemoryStorage();
    await addCollectedLink({ url: "https://a.com", title: "A [x]" }, storage, NOW);
    const md = collectionToMarkdown(await loadCollection(storage));
    expect(md).toContain("[A x](https://a.com)");
  });
  it("csv escapes", async () => {
    const storage = createMemoryStorage();
    await addCollectedLink({ url: "https://a.com", title: 'He said "hi"' }, storage, NOW);
    const csv = collectionToCsv(await loadCollection(storage));
    expect(csv).toContain('"He said ""hi"""');
  });
});

describe("remove & clear", () => {
  it("removes one and clears all", async () => {
    const storage = createMemoryStorage();
    await addCollectedLink({ url: "https://a.com" }, storage, NOW);
    await addCollectedLink({ url: "https://b.com" }, storage, NOW);
    await removeCollectedLink("https://a.com", storage);
    expect((await loadCollection(storage)).map((l) => l.url)).toEqual(["https://b.com"]);
    await clearCollection(storage);
    expect(await loadCollection(storage)).toHaveLength(0);
  });
});
