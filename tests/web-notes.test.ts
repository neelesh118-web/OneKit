import { describe, expect, it } from "vitest";
import {
  addWebNote,
  clearAllNotes,
  clearNotesForOrigin,
  listNotesForOrigin,
  MAX_NOTE_TEXT,
  removeWebNote,
  updateWebNote
} from "../src/core/web-notes";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();
const note = (overrides: Partial<Parameters<typeof addWebNote>[1]> = {}) => ({
  origin: "https://example.com",
  url: "https://example.com/post",
  text: "Remember to double-check this section.",
  color: "yellow" as const,
  xPct: 70,
  yPct: 40,
  ...overrides
});

describe("web notes", () => {
  it("adds and lists notes per origin, newest first", async () => {
    const s = storage();
    await addWebNote(s, note({ text: "first" }), 100);
    await addWebNote(s, note({ text: "second" }), 200);
    const list = await listNotesForOrigin(s, "https://example.com");
    expect(list.map((n) => n.text)).toEqual(["second", "first"]);
    expect(list[0]!.id).toMatch(/^note-/);
  });

  it("never leaks notes across origins", async () => {
    const s = storage();
    await addWebNote(s, note({ origin: "https://a.com", text: "a-note" }), 1);
    await addWebNote(s, note({ origin: "https://b.com", text: "b-note" }), 2);
    const a = await listNotesForOrigin(s, "https://a.com");
    expect(a.map((n) => n.text)).toEqual(["a-note"]);
  });

  it("rejects empty notes and clamps color + text length", async () => {
    const s = storage();
    expect(await addWebNote(s, note({ text: "   " }), 1)).toBeNull();
    const long = await addWebNote(s, note({ text: "x".repeat(5000) }), 1);
    expect(long!.text.length).toBe(MAX_NOTE_TEXT);
    const badColor = await addWebNote(s, note({ color: "purple" as never, text: "ok" }), 1);
    expect(badColor!.color).toBe("yellow");
  });

  it("updates text and color", async () => {
    const s = storage();
    const saved = await addWebNote(s, note(), 1);
    await updateWebNote(s, saved!.id, { text: "updated", color: "blue" });
    const list = await listNotesForOrigin(s, "https://example.com");
    expect(list[0]!.text).toBe("updated");
    expect(list[0]!.color).toBe("blue");
    await updateWebNote(s, "does-not-exist", { text: "x" }); // no crash
  });

  it("removes a note and clears by origin or entirely", async () => {
    const s = storage();
    const a = await addWebNote(s, note({ origin: "https://a.com", text: "a" }), 1);
    await addWebNote(s, note({ origin: "https://a.com", text: "b" }), 2);
    await removeWebNote(s, a!.id);
    expect(await listNotesForOrigin(s, "https://a.com")).toHaveLength(1);
    await clearNotesForOrigin(s, "https://a.com");
    expect(await listNotesForOrigin(s, "https://a.com")).toHaveLength(0);
    await addWebNote(s, note({ origin: "https://a.com", text: "c" }), 3);
    await clearAllNotes(s);
    expect(await listNotesForOrigin(s, "https://a.com")).toHaveLength(0);
  });
});
