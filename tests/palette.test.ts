// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addPaletteColor,
  clearPalette,
  listPalette,
  normalizeHex,
  removePaletteColor
} from "../src/core/palette";
import { createMemoryStorage } from "../src/core/storage-utils";

describe("normalizeHex", () => {
  it("expands shorthand and normalizes case", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("ff00ff")).toBe("#ff00ff");
    expect(normalizeHex("nope")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
});

describe("palette store", () => {
  it("adds colors newest-first and dedupes", async () => {
    const storage = createMemoryStorage();
    await addPaletteColor("#ff0000", storage);
    await addPaletteColor("#00ff00", storage);
    const again = await addPaletteColor("FF0000", storage);
    expect(again).toEqual(["#ff0000", "#00ff00"]);
  });

  it("caps the palette at 24 entries", async () => {
    const storage = createMemoryStorage();
    for (let i = 0; i < 30; i++) {
      await addPaletteColor(`#${i.toString(16).padStart(6, "0")}`, storage);
    }
    expect((await listPalette(storage)).length).toBe(24);
  });

  it("removes and clears", async () => {
    const storage = createMemoryStorage();
    await addPaletteColor("#111111", storage);
    await addPaletteColor("#222222", storage);
    await removePaletteColor("#111111", storage);
    expect(await listPalette(storage)).toEqual(["#222222"]);
    await clearPalette(storage);
    expect(await listPalette(storage)).toEqual([]);
  });

  it("ignores invalid input instead of crashing", async () => {
    const storage = createMemoryStorage();
    await addPaletteColor("not a color", storage);
    expect(await listPalette(storage)).toEqual([]);
  });
});
