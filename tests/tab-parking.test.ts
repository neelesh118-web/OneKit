// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearParked, loadParked, parkTabs, parkedStats, removeParked, restoreParked } from "../src/core/tab-parking";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;

describe("parkTabs", () => {
  it("parks web tabs and returns their ids", async () => {
    const storage = createMemoryStorage();
    const { parked, tabIds } = await parkTabs(
      storage,
      [
        { id: 1, title: "A", url: "https://a.com", active: false },
        { id: 2, title: "B", url: "https://b.com", active: false },
        { id: 3, title: "New Tab", url: "chrome://newtab/", active: false },
        { id: 4, title: "Active", url: "https://active.com", active: true }
      ],
      NOW
    );
    expect(parked.map((t) => t.url)).toEqual(["https://a.com", "https://b.com"]);
    expect(tabIds).toEqual([1, 2]);
  });
  it("never parks pinned or active tabs", async () => {
    const storage = createMemoryStorage();
    const { parked } = await parkTabs(
      storage,
      [
        { id: 1, title: "Pinned", url: "https://pinned.com", active: false, pinned: true },
        { id: 2, title: "Active", url: "https://active.com", active: true }
      ],
      NOW
    );
    expect(parked).toEqual([]);
  });
  it("dedupes by URL and never deletes stored data", async () => {
    const storage = createMemoryStorage();
    await parkTabs(storage, [{ id: 1, title: "A", url: "https://a.com", active: false }], NOW);
    const second = await parkTabs(storage, [{ id: 2, title: "A", url: "https://a.com", active: false }], NOW + 1);
    expect(second.parked).toEqual([]);
    expect((await loadParked(storage)).map((t) => t.url)).toEqual(["https://a.com"]);
  });
});

describe("restoreParked", () => {
  it("restores selected tabs and removes them from the list", async () => {
    const storage = createMemoryStorage();
    await parkTabs(storage, [
      { id: 1, title: "A", url: "https://a.com", active: false },
      { id: 2, title: "B", url: "https://b.com", active: false }
    ], NOW);
    const { restored, removed } = await restoreParked(storage, ["https://a.com"]);
    expect(restored).toBe(1);
    expect(removed).toEqual(["https://a.com"]);
    expect((await loadParked(storage)).map((t) => t.url)).toEqual(["https://b.com"]);
  });
  it("clears and removes individually", async () => {
    const storage = createMemoryStorage();
    await parkTabs(storage, [{ id: 1, title: "A", url: "https://a.com", active: false }], NOW);
    await removeParked(storage, "https://a.com");
    expect(await loadParked(storage)).toHaveLength(0);
    await parkTabs(storage, [{ id: 2, title: "B", url: "https://b.com", active: false }], NOW);
    await clearParked(storage);
    expect(await loadParked(storage)).toHaveLength(0);
  });
  it("ignores malformed stored entries", async () => {
    const storage = createMemoryStorage({ "ok.parking": [{ url: 1 }, "nope"] });
    expect(await loadParked(storage)).toHaveLength(0);
  });
});

describe("parkedStats", () => {
  it("counts entries and unique hosts", () => {
    const stats = parkedStats([
      { url: "https://a.com/x", title: "1", parkedAt: 1 },
      { url: "https://a.com/y", title: "2", parkedAt: 2 },
      { url: "https://b.com/", title: "3", parkedAt: 3 }
    ]);
    expect(stats.count).toBe(3);
    expect(stats.hosts).toBe(2);
  });
});
