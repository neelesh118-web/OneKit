import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  addVideoNote,
  clearVideoNotesFor,
  formatVideoTime,
  listVideoNotes,
  removeVideoNote
} from "../src/core/video-notes";

describe("video notes", () => {
  it("adds notes with timestamps", async () => {
    const storage = createMemoryStorage();
    const note = await addVideoNote(storage, "https://youtube.com/watch?v=1", 12.5, "Key point here", 1000);
    expect(note.timestamp).toBe(12.5);
    const list = await listVideoNotes(storage, "https://youtube.com/watch?v=1");
    expect(list).toHaveLength(1);
    expect(list[0]!.text).toBe("Key point here");
  });

  it("rejects empty notes", async () => {
    const storage = createMemoryStorage();
    await expect(addVideoNote(storage, "u", 0, "   ")).rejects.toThrow();
  });

  it("separates notes by video URL", async () => {
    const storage = createMemoryStorage();
    await addVideoNote(storage, "https://a.com/1", 5, "note A", 1000);
    await addVideoNote(storage, "https://b.com/2", 5, "note B", 2000);
    expect(await listVideoNotes(storage, "https://a.com/1")).toHaveLength(1);
    expect(await listVideoNotes(storage)).toHaveLength(2);
  });

  it("removes single notes and clears per video", async () => {
    const storage = createMemoryStorage();
    const n1 = await addVideoNote(storage, "u", 1, "one", 1000);
    await addVideoNote(storage, "u", 2, "two", 2000);
    await removeVideoNote(storage, n1.id);
    expect(await listVideoNotes(storage, "u")).toHaveLength(1);
    expect(await clearVideoNotesFor(storage, "u")).toBe(1);
    expect(await listVideoNotes(storage)).toHaveLength(0);
  });

  it("formats video times", () => {
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(75)).toBe("1:15");
    expect(formatVideoTime(5025)).toBe("1:23:45");
  });
});
