// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addGoal,
  listGoals,
  MAX_GOALS,
  removeGoal,
  toggleGoal
} from "../src/core/goals-store";
import {
  addLink,
  DEFAULT_LINKS,
  listLinks,
  removeLink
} from "../src/core/quick-links";
import { createMemoryStorage } from "../src/core/storage-utils";

describe("goals store", () => {
  it("adds, toggles and removes goals for a date", async () => {
    const storage = createMemoryStorage();
    const date = "2026-08-10";
    const one = await addGoal("Ship the build", storage, date);
    const two = await addGoal("Reply to client", storage, date);
    expect(one.length).toBe(1);
    expect(two.length).toBe(2);
    const done = await toggleGoal(two[1]!.id, storage, date);
    expect(done[1]!.done).toBe(true);
    const after = await removeGoal(one[0]!.id, storage, date);
    expect(after.length).toBe(1);
    expect(after[0]!.text).toBe("Reply to client");
  });

  it("ignores blank goals and enforces the cap", async () => {
    const storage = createMemoryStorage();
    await addGoal("   ", storage);
    expect(await listGoals(storage)).toHaveLength(0);
    for (let i = 0; i < MAX_GOALS + 3; i++) {
      await addGoal(`Goal ${i}`, storage);
    }
    expect((await listGoals(storage)).length).toBe(MAX_GOALS);
  });

  it("keeps different days separate", async () => {
    const storage = createMemoryStorage();
    await addGoal("Today's task", storage, "2026-08-10");
    expect(await listGoals(storage, "2026-08-09")).toHaveLength(0);
  });
});

describe("quick links store", () => {
  it("seeds defaults when empty", async () => {
    const storage = createMemoryStorage();
    expect((await listLinks(storage)).length).toBe(DEFAULT_LINKS.length);
  });

  it("adds links with a sensible label and removes them", async () => {
    const storage = createMemoryStorage();
    const list = await addLink("Docs", "https://docs.example.com", storage);
    expect(list[list.length - 1]!.label).toBe("Docs");
    const added = list[list.length - 1]!;
    const after = await removeLink(added.id, storage);
    expect(after.some((l) => l.id === added.id)).toBe(false);
  });

  it("rejects invalid URLs honestly", async () => {
    const storage = createMemoryStorage();
    await expect(addLink("x", "not a url", storage)).rejects.toThrow(/not a valid link/);
  });
});
