import { describe, expect, it } from "vitest";
import {
  mergeSavedPools,
  pickRandomItem,
  pickRandomItemSeeded,
  type SavedItemLike
} from "../src/core/random-revisit";

const make = (id: string, read: boolean): SavedItemLike => ({ id, url: `https://${id}.example`, title: id, read });

describe("random revisit", () => {
  it("returns null for an empty pool", () => {
    expect(pickRandomItem([])).toBeNull();
  });

  it("picks from read items when everything is read", () => {
    const items = [make("a", true), make("b", true)];
    const pick = pickRandomItemSeeded(items, () => 0.9);
    expect(pick).not.toBeNull();
  });

  it("returns only unread when unreadOnly is set", () => {
    const items = [make("a", true), make("b", false)];
    const pick = pickRandomItemSeeded(items, () => 0.9, { unreadOnly: true });
    expect(pick!.id).toBe("b");
  });

  it("returns an unread item when the roll lands in unread mass", () => {
    const items = [make("a", false), make("b", true), make("c", true)];
    const pick = pickRandomItemSeeded(items, () => 0.1, { preferUnread: true });
    expect(pick!.read).toBe(false);
  });

  it("can return a read item when the roll lands in read mass", () => {
    const items = [make("a", false), make("b", true)];
    const pick = pickRandomItemSeeded(items, () => 0.99, { preferUnread: true });
    expect(pick!.id).toBe("b");
  });

  it("ignores preference entirely when preferUnread is false", () => {
    const items = [make("a", false), make("b", true)];
    const pick = pickRandomItemSeeded(items, () => 0.5, { preferUnread: false });
    expect(["a", "b"]).toContain(pick!.id);
  });

  it("merges read-later and highlight pools with distinct ids", () => {
    const merged = mergeSavedPools(
      [make("1", false)],
      [{ id: "h1", url: "https://x.example", text: "A highlighted note" }]
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]!.id).toBe("h-h1");
    expect(merged[1]!.read).toBe(true);
  });
});
