import { describe, expect, it } from "vitest";
import {
  clearProgress,
  isArticleLike,
  listProgress,
  progressPercent,
  readProgress,
  saveProgress
} from "../src/core/reading-progress";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("progressPercent", () => {
  it("computes 0–100 through the scrollable range", () => {
    expect(progressPercent(0, 2000, 500)).toBe(0);
    expect(progressPercent(750, 2000, 500)).toBe(50);
    expect(progressPercent(1500, 2000, 500)).toBe(100);
  });

  it("returns 100 for non-scrollable pages and clamps", () => {
    expect(progressPercent(0, 500, 500)).toBe(100);
    expect(progressPercent(-10, 2000, 500)).toBe(0);
    expect(progressPercent(99999, 2000, 500)).toBe(100);
  });
});

describe("isArticleLike", () => {
  it("requires long text with paragraphs AND a long page", () => {
    expect(isArticleLike({ textLength: 5000, paragraphCount: 8, scrollHeight: 5000, clientHeight: 800 })).toBe(true);
    expect(isArticleLike({ textLength: 200, paragraphCount: 2, scrollHeight: 5000, clientHeight: 800 })).toBe(false);
    expect(isArticleLike({ textLength: 5000, paragraphCount: 8, scrollHeight: 1000, clientHeight: 800 })).toBe(false);
  });
});

describe("reading progress storage", () => {
  it("saves and reads per-URL progress", async () => {
    const s = storage();
    expect(await readProgress(s, "https://a.com/post")).toBeNull();
    await saveProgress(s, "https://a.com/post", 42);
    expect((await readProgress(s, "https://a.com/post"))?.pct).toBe(42);
  });

  it("lists most-recently-updated first and caps the store", async () => {
    const s = storage();
    for (let i = 0; i < 205; i++) {
      await saveProgress(s, `https://s${i}.com/`, i, 1000 + i);
    }
    const list = await listProgress(s);
    expect(list).toHaveLength(200);
    expect(list[0]!.url).toBe("https://s204.com/");
    // The oldest 5 URLs fell off the end.
    expect(list.some((r) => r.url === "https://s0.com/")).toBe(false);
  });

  it("updating a URL moves it to the front", async () => {
    const s = storage();
    await saveProgress(s, "https://a.com/", 10, 100);
    await saveProgress(s, "https://b.com/", 20, 200);
    await saveProgress(s, "https://a.com/", 99, 300);
    const list = await listProgress(s);
    expect(list[0]!.url).toBe("https://a.com/");
    expect(list[0]!.pct).toBe(99);
    expect(list).toHaveLength(2);
  });

  it("clears all progress", async () => {
    const s = storage();
    await saveProgress(s, "https://a.com/", 10);
    await clearProgress(s);
    expect(await listProgress(s)).toHaveLength(0);
  });
});
