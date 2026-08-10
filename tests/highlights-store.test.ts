import { describe, expect, it } from "vitest";
import {
  clearHighlights,
  findRangeForText,
  listHighlights,
  listHighlightsForUrl,
  MAX_HIGHLIGHTS_PER_URL,
  removeHighlight,
  saveHighlight
} from "../src/core/highlights-store";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("highlights-store", () => {
  it("saves and lists highlights", async () => {
    const s = storage();
    await saveHighlight(s, "https://a.com/", "The quick brown fox", 100);
    await saveHighlight(s, "https://b.com/", "Different text", 200);
    const list = await listHighlights(s);
    expect(list).toHaveLength(2);
    expect(list[0]?.url).toBe("https://b.com/");
    const forUrl = await listHighlightsForUrl(s, "https://a.com/");
    expect(forUrl).toHaveLength(1);
    expect(forUrl[0]?.text).toBe("The quick brown fox");
  });

  it("rejects empty highlights", async () => {
    const s = storage();
    expect(await saveHighlight(s, "https://a.com/", "   ")).toBeNull();
  });

  it("caps highlights per url", async () => {
    const s = storage();
    for (let i = 0; i < MAX_HIGHLIGHTS_PER_URL + 2; i++) {
      await saveHighlight(s, "https://a.com/", `highlight number ${i}`, i);
    }
    const forUrl = await listHighlightsForUrl(s, "https://a.com/");
    expect(forUrl).toHaveLength(MAX_HIGHLIGHTS_PER_URL);
  });

  it("removes and clears", async () => {
    const s = storage();
    const saved = await saveHighlight(s, "https://a.com/", "some text", 1);
    await removeHighlight(s, saved!.id);
    expect(await listHighlights(s)).toHaveLength(0);
    await saveHighlight(s, "https://a.com/", "again", 2);
    await clearHighlights(s);
    expect(await listHighlights(s)).toHaveLength(0);
  });

  it("finds a range for exact text in the document", () => {
    document.body.innerHTML = `<p>Hello world. This is the target sentence here.</p><p>More text.</p>`;
    const range = findRangeForText(document, "the target sentence");
    expect(range).not.toBeNull();
    expect(range?.toString()).toContain("target sentence");
  });

  it("finds a range across whitespace differences", () => {
    document.body.innerHTML = `<p>Multi   line\n text here.</p>`;
    const range = findRangeForText(document, "multi line text");
    expect(range).not.toBeNull();
  });

  it("returns null when the text is absent", () => {
    document.body.innerHTML = `<p>Completely different words.</p>`;
    expect(findRangeForText(document, "not present anywhere")).toBeNull();
  });
});
