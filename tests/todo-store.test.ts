// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addTodo,
  createTodo,
  dueLabel,
  loadTodos,
  removeTodo,
  sortTodos,
  TODO_STORAGE_KEY,
  todoStats,
  toggleTodo,
  updateTodo
} from "../src/core/todo-store";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe("createTodo", () => {
  it("builds a valid todo", () => {
    const t = createTodo({ title: "  Send invoice  ", priority: "high", due: NOW + DAY }, NOW);
    expect(t.title).toBe("Send invoice");
    expect(t.priority).toBe("high");
    expect(t.due).toBe(NOW + DAY);
    expect(t.done).toBe(false);
    expect(t.completedAt).toBeNull();
    expect(t.id).toBeTruthy();
  });
  it("rejects empty titles", () => {
    expect(() => createTodo({ title: "   " }, NOW)).toThrow(/title/);
  });
  it("defaults priority and due", () => {
    const t = createTodo({ title: "x" }, NOW);
    expect(t.priority).toBe("medium");
    expect(t.due).toBeNull();
  });
});

describe("store CRUD", () => {
  it("adds, toggles, updates and removes", async () => {
    const store = createMemoryStorage();
    let todos = await addTodo(store, { title: "One" }, NOW);
    const id = todos[0]!.id;
    expect(todos).toHaveLength(1);

    todos = await toggleTodo(store, id, NOW + 1000);
    expect(todos[0]!.done).toBe(true);
    expect(todos[0]!.completedAt).toBe(NOW + 1000);

    todos = await updateTodo(store, id, { priority: "high", title: "One!" }, NOW + 2000);
    expect(todos[0]!.title).toBe("One!");
    expect(todos[0]!.priority).toBe("high");

    todos = await removeTodo(store, id);
    expect(todos).toHaveLength(0);
    expect(await loadTodos(store)).toEqual([]);
  });

  it("ignores corrupt stored data", async () => {
    const store = createMemoryStorage({ [TODO_STORAGE_KEY]: [{ title: "broken" }] });
    expect(await loadTodos(store)).toEqual([]);
  });
});

describe("sortTodos", () => {
  const t = (title: string, over: Partial<Parameters<typeof createTodo>[0]> = {}, done = false) =>
    ({ ...createTodo({ title, ...over }, NOW), done, completedAt: done ? NOW : null }) as ReturnType<
      typeof createTodo
    > & { done: boolean };

  it("puts open todos before done ones", () => {
    const open = t("open");
    const done = t("done", {}, true);
    expect(sortTodos([done, open])[0]!.title).toBe("open");
  });
  it("sorts by priority then due date", () => {
    const low = t("low", { priority: "low", due: NOW });
    const high = t("high", { priority: "high", due: NOW + 3 * DAY });
    const medium = t("medium", { priority: "medium", due: NOW + DAY });
    const sorted = sortTodos([medium, low, high]);
    expect(sorted.map((x) => x.title)).toEqual(["high", "medium", "low"]);
  });
  it("undated items sort last within a priority", () => {
    const dated = t("dated", { priority: "high", due: NOW + DAY });
    const undated = t("undated", { priority: "high" });
    expect(sortTodos([undated, dated]).map((x) => x.title)).toEqual(["dated", "undated"]);
  });
  it("sorts by createdAt (oldest first) within equal priority/due", () => {
    const a = t("a", { priority: "medium" }); // createdAt NOW
    const b = { ...t("b", { priority: "medium" }), createdAt: NOW - 1000 };
    expect(sortTodos([a, b]).map((x) => x!.title)).toEqual(["b", "a"]);
  });
});

describe("dueLabel", () => {
  it("labels overdue, today, tomorrow and future", () => {
    expect(dueLabel(NOW - 2 * DAY, NOW)).toBe("overdue by 2d");
    expect(dueLabel(NOW, NOW)).toBe("due today");
    expect(dueLabel(NOW + DAY, NOW)).toBe("due tomorrow");
    expect(dueLabel(NOW + 3 * DAY, NOW)).toBe("in 3d");
    expect(dueLabel(null, NOW)).toBeNull();
  });
});

describe("todoStats", () => {
  it("counts open and done", () => {
    const store = createMemoryStorage();
    void store;
    const todos = [createTodo({ title: "a" }, NOW), createTodo({ title: "b" }, NOW), createTodo({ title: "c" }, NOW)];
    todos[0]!.done = true;
    const stats = todoStats(todos);
    expect(stats).toEqual({ total: 3, open: 2, done: 1 });
  });
});
