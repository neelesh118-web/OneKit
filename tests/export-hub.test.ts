// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportJson, exportMarkdown } from "../src/core/export-hub";
import { createMemoryStorage } from "../src/core/storage-utils";
import type { CollectedLink } from "../src/core/link-collector";
import type { Reminder } from "../src/core/reminders";
import type { TodoItem } from "../src/core/todo-store";

describe("exportJson", () => {
  it("contains the stores that exist", async () => {
    const storage = createMemoryStorage({ "ok.todos": [{ id: "1", title: "T", done: false }] });
    const json = JSON.parse(await exportJson(storage)) as Record<string, unknown>;
    expect(json.exportedAt).toBeTruthy();
    expect(Array.isArray(json["ok.todos"])).toBe(true);
  });
  it("never touches other keys", async () => {
    const storage = createMemoryStorage({ "ok.secretJunk": "x", "ok.todos": [] });
    const json = JSON.parse(await exportJson(storage)) as Record<string, unknown>;
    expect(json["ok.secretJunk"]).toBeUndefined();
  });
});

describe("exportMarkdown", () => {
  it("renders links, todos and reminders from injected sources", async () => {
    const storage = createMemoryStorage();
    const sources = {
      async loadCollection(): Promise<CollectedLink[]> {
        return [{ url: "https://a.com", title: "A", addedAt: 1 }];
      },
      async loadTodos(): Promise<TodoItem[]> {
        return [{ id: "1", title: "Ship it", done: false, priority: "high", createdAt: 1, due: null, completedAt: null }];
      },
      async loadReminders(): Promise<Reminder[]> {
        return [{ id: "r", text: "Call back", due: 2, createdAt: 1, firedAt: null }];
      }
    };
    const md = await exportMarkdown(storage, sources);
    expect(md).toContain("[A](https://a.com)");
    expect(md).toContain("Ship it");
    expect(md).toContain("Call back");
  });
  it("handles empty stores", async () => {
    const md = await exportMarkdown(createMemoryStorage());
    expect(md).toContain("(none)");
  });
});
