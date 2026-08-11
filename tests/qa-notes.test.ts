import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  addQaNote,
  clearQaNotes,
  listQaNotes,
  qaReport,
  removeQaNote
} from "../src/core/qa-notes";

describe("qa notes", () => {
  it("adds and lists captures newest-first", async () => {
    const storage = createMemoryStorage();
    await addQaNote(storage, { url: "https://a.com", title: "A", note: "first" }, 1000);
    await addQaNote(storage, { url: "https://b.com", title: "B", note: "second" }, 2000);
    const notes = await listQaNotes(storage);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.note).toBe("second");
  });

  it("requires a note or screenshot", async () => {
    const storage = createMemoryStorage();
    await expect(addQaNote(storage, { url: "https://a.com", title: "A", note: "   " })).rejects.toThrow();
  });

  it("keeps an optional screenshot and builds a report", async () => {
    const storage = createMemoryStorage();
    const note = await addQaNote(storage, {
      url: "https://a.com/x",
      title: "Broken page",
      note: "footer overlaps content",
      screenshot: "data:image/png;base64,abc"
    }, 5000);
    expect(note.screenshot).toBe("data:image/png;base64,abc");
    const report = qaReport(note);
    expect(report).toContain("Broken page");
    expect(report).toContain("https://a.com/x");
    expect(report).toContain("footer overlaps content");
  });

  it("removes single notes and clears all", async () => {
    const storage = createMemoryStorage();
    const a = await addQaNote(storage, { url: "https://a.com", title: "A", note: "one" }, 1);
    await addQaNote(storage, { url: "https://b.com", title: "B", note: "two" }, 2);
    expect(await removeQaNote(storage, a.id)).toBe(true);
    expect(await removeQaNote(storage, a.id)).toBe(false);
    expect(await listQaNotes(storage)).toHaveLength(1);
    await clearQaNotes(storage);
    expect(await listQaNotes(storage)).toHaveLength(0);
  });
});
