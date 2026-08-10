// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addClipboardEntry, listClipboard, setClipboardPinned } from "../src/core/clipboard-store";
import { clipboardToMarkdown, clipboardToPlainText } from "../src/core/clipboard-export";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;

describe("pinned clipboard", () => {
  it("pins an entry and it survives the trim", async () => {
    const storage = createMemoryStorage();
    const pinned = await addClipboardEntry(storage, "IMPORTANT", NOW);
    await setClipboardPinned(storage, pinned!.id, true);
    for (let i = 0; i < 60; i++) await addClipboardEntry(storage, `item-${i}`, NOW + i);
    const list = await listClipboard(storage);
    expect(list.find((e) => e.text === "IMPORTANT")).toBeTruthy();
    expect(list[0]!.text).toBe("IMPORTANT"); // pinned sorts above
  });
  it("unpins", async () => {
    const storage = createMemoryStorage();
    const e = await addClipboardEntry(storage, "x", NOW);
    await setClipboardPinned(storage, e!.id, true);
    await setClipboardPinned(storage, e!.id, false);
    expect((await listClipboard(storage))[0]!.pinned).toBeUndefined();
  });
});

describe("clipboard export", () => {
  it("renders markdown with timestamps", async () => {
    const storage = createMemoryStorage();
    await addClipboardEntry(storage, "hello world", NOW);
    const md = clipboardToMarkdown(await listClipboard(storage));
    expect(md).toContain("# Clipboard history");
    expect(md).toContain("hello world");
  });
  it("renders plain text separated by rules", () => {
    const text = clipboardToPlainText([
      { id: "1", text: "a", ts: NOW },
      { id: "2", text: "b", ts: NOW + 1 }
    ]);
    expect(text).toBe("a\n\n---\n\nb");
  });
});
