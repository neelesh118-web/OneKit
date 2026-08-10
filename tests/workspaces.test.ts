import { describe, expect, it } from "vitest";
import {
  clearWorkspaces,
  listWorkspaces,
  removeWorkspace,
  saveWorkspace,
  tabsToWorkspaceTabs
} from "../src/core/workspaces";
import type { TabLike } from "../src/core/tab-tools";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

const tab = (id: number, url: string, title?: string): TabLike => ({ id, url, title: title ?? url });

describe("workspaces", () => {
  it("saves only http(s) tabs", () => {
    const tabs = [
      tab(1, "https://a.com/"),
      tab(2, "http://b.com/x"),
      tab(3, "chrome://extensions"),
      tab(4, "about:blank"),
      tab(5, "file:///c:/x")
    ];
    const result = tabsToWorkspaceTabs(tabs);
    expect(result.map((t) => t.url)).toEqual(["https://a.com/", "http://b.com/x"]);
  });

  it("saves, lists newest-first, and can be restored by id", async () => {
    const s = storage();
    const first = await saveWorkspace(s, "Work", [tab(1, "https://a.com/")], 100);
    expect(first).not.toBeNull();
    const second = await saveWorkspace(s, "Play", [tab(2, "https://b.com/")], 200);
    const list = await listWorkspaces(s);
    expect(list.map((w) => w.name)).toEqual(["Play", "Work"]);

    const restored = list.find((w) => w.id === second!.id);
    expect(restored?.tabs[0]?.url).toBe("https://b.com/");
  });

  it("refuses to save an empty session", async () => {
    const s = storage();
    const ws = await saveWorkspace(s, "Empty", [tab(1, "chrome://extensions")]);
    expect(ws).toBeNull();
    expect(await listWorkspaces(s)).toHaveLength(0);
  });

  it("removes and clears workspaces", async () => {
    const s = storage();
    const ws = await saveWorkspace(s, "A", [tab(1, "https://a.com/")], 1);
    await removeWorkspace(s, ws!.id);
    expect(await listWorkspaces(s)).toHaveLength(0);
    await saveWorkspace(s, "B", [tab(2, "https://b.com/")], 2);
    await clearWorkspaces(s);
    expect(await listWorkspaces(s)).toHaveLength(0);
  });

  it("caps the number of saved workspaces", async () => {
    const s = storage();
    for (let i = 0; i < 30; i++) {
      await saveWorkspace(s, `S${i}`, [tab(i, `https://site${i}.com/`)], i);
    }
    const list = await listWorkspaces(s);
    expect(list).toHaveLength(25); // MAX_WORKSPACES
    expect(list[0]?.name).toBe("S29"); // newest kept
  });

  it("clears everything", async () => {
    const s = storage();
    await saveWorkspace(s, "A", [tab(1, "https://a.com/")], 1);
    await clearWorkspaces(s);
    expect(await listWorkspaces(s)).toHaveLength(0);
  });
});
