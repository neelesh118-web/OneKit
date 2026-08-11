import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  getSerpNote,
  listSerpNotes,
  queryKey,
  removeSerpNote,
  setSerpNote
} from "../src/core/serp-notes";

describe("serp notes", () => {
  it("normalizes queries for storage", () => {
    expect(queryKey("  Best  Laptops  ")).toBe("best laptops");
    expect(queryKey("")).toBe("");
  });

  it("sets, reads and lists notes per query", async () => {
    const storage = createMemoryStorage();
    await setSerpNote(storage, "Best laptops 2026", "comparing for work", 1000);
    expect(await getSerpNote(storage, "best laptops 2026")).toEqual({
      note: "comparing for work",
      updatedAt: 1000
    });
    await setSerpNote(storage, "wireless mice", "for the new setup", 2000);
    const notes = await listSerpNotes(storage);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.query).toBe("wireless mice"); // newest first
  });

  it("an empty note deletes the entry", async () => {
    const storage = createMemoryStorage();
    await setSerpNote(storage, "query", "note", 1);
    await setSerpNote(storage, "query", "   ", 2);
    expect(await getSerpNote(storage, "query")).toBeNull();
    expect(await listSerpNotes(storage)).toHaveLength(0);
  });

  it("removes notes and rejects empty queries", async () => {
    const storage = createMemoryStorage();
    await setSerpNote(storage, "query", "note", 1);
    expect(await removeSerpNote(storage, "query")).toBe(true);
    expect(await removeSerpNote(storage, "query")).toBe(false);
    await expect(setSerpNote(storage, "   ", "note")).rejects.toThrow();
  });
});
