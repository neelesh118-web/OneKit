import { describe, expect, it } from "vitest";
import {
  clearDrafts,
  draftKeyFor,
  listDrafts,
  listDraftsForOrigin,
  removeDraft,
  saveDraft
} from "../src/core/drafts-store";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("drafts-store", () => {
  it("builds site-scoped keys", () => {
    const a = draftKeyFor("https://shop.com", "email", "");
    const b = draftKeyFor("https://other.com", "email", "");
    expect(a).not.toBe(b);
    expect(a).toContain("shop.com");
  });

  it("saves, updates, and lists drafts", async () => {
    const s = storage();
    const key = draftKeyFor("https://a.com", "name");
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "name", value: "Neel" }, 100);
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "name", value: "Neel Sati" }, 200);
    const list = await listDrafts(s);
    expect(list).toHaveLength(1);
    expect(list[0]?.value).toBe("Neel Sati");
    expect(list[0]?.ts).toBe(200);
  });

  it("removes a draft when value becomes empty", async () => {
    const s = storage();
    const key = draftKeyFor("https://a.com", "notes");
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "notes", value: "some notes" }, 100);
    expect(await listDrafts(s)).toHaveLength(1);
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "notes", value: "   " }, 200);
    expect(await listDrafts(s)).toHaveLength(0);
  });

  it("scopes listing by origin", async () => {
    const s = storage();
    await saveDraft(s, { key: draftKeyFor("https://a.com", "f"), origin: "https://a.com", fieldLabel: "f", value: "a" }, 1);
    await saveDraft(s, { key: draftKeyFor("https://b.com", "f"), origin: "https://b.com", fieldLabel: "f", value: "b" }, 2);
    const aOnly = await listDraftsForOrigin(s, "https://a.com");
    expect(aOnly).toHaveLength(1);
    expect(aOnly[0]?.value).toBe("a");
  });

  it("removes and clears", async () => {
    const s = storage();
    const key = draftKeyFor("https://a.com", "f");
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "f", value: "v" }, 1);
    await removeDraft(s, key);
    expect(await listDrafts(s)).toHaveLength(0);
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "f", value: "v2" }, 2);
    await clearDrafts(s);
    expect(await listDrafts(s)).toHaveLength(0);
  });

  it("caps values", async () => {
    const s = storage();
    const key = draftKeyFor("https://a.com", "long");
    await saveDraft(s, { key, origin: "https://a.com", fieldLabel: "long", value: "x".repeat(50000) }, 1);
    const [draft] = await listDrafts(s);
    expect(draft!.value.length).toBeLessThanOrEqual(20000);
  });
});
