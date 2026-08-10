// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearActivity, describeEvent, loadActivity, logActivity, MAX_ENTRIES } from "../src/core/activity-log";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;

describe("activity log", () => {
  it("appends newest-first", async () => {
    const storage = createMemoryStorage();
    await logActivity(storage, "reminder.fired", "Stand up", NOW);
    await logActivity(storage, "export.json", "Exported 3 stores", NOW + 1);
    const list = await loadActivity(storage);
    expect(list).toHaveLength(2);
    expect(list[0]!.type).toBe("export.json");
  });
  it("caps the list", async () => {
    const storage = createMemoryStorage();
    for (let i = 0; i < MAX_ENTRIES + 20; i++) await logActivity(storage, "t", `e${i}`, NOW + i);
    expect(await loadActivity(storage)).toHaveLength(MAX_ENTRIES);
  });
  it("clears and describes", async () => {
    const storage = createMemoryStorage();
    await logActivity(storage, "t", "hello", NOW);
    expect(describeEvent((await loadActivity(storage))[0]!)).toContain("hello");
    await clearActivity(storage);
    expect(await loadActivity(storage)).toHaveLength(0);
  });
  it("ignores malformed entries", async () => {
    const storage = createMemoryStorage({ "ok.activityLog": [{ id: 1 }, "x"] });
    expect(await loadActivity(storage)).toHaveLength(0);
  });
});
