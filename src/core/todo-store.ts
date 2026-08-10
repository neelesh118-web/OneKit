import type { KvStorage } from "./storage-utils";

/**
 * Local todo list — tasks with priorities and due dates, stored in
 * storage.local. No network, no account; complements the habit tracker
 * (habits = recurring, todos = one-off).
 */

export const TODO_STORAGE_KEY = "ok.todos";

export type TodoPriority = "high" | "medium" | "low";

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  priority: TodoPriority;
  /** Due date as epoch ms, or null when undated. */
  due: number | null;
  createdAt: number;
  completedAt: number | null;
}

export interface TodoDraft {
  title: string;
  priority?: TodoPriority;
  due?: number | null;
}

export function newTodoId(now: number): string {
  return `t${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createTodo(draft: TodoDraft, now: number): TodoItem {
  const title = draft.title.trim();
  if (!title) throw new Error("A todo needs a title.");
  return {
    id: newTodoId(now),
    title,
    done: false,
    priority: draft.priority ?? "medium",
    due: draft.due ?? null,
    createdAt: now,
    completedAt: null
  };
}

export async function loadTodos(storage: KvStorage): Promise<TodoItem[]> {
  const raw = await storage.get(TODO_STORAGE_KEY);
  const value = raw[TODO_STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isTodoItem);
}

function isTodoItem(value: unknown): value is TodoItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.done === "boolean" &&
    (v.priority === "high" || v.priority === "medium" || v.priority === "low") &&
    (typeof v.due === "number" || v.due === null) &&
    typeof v.createdAt === "number" &&
    (typeof v.completedAt === "number" || v.completedAt === null)
  );
}

export async function saveTodos(storage: KvStorage, todos: TodoItem[]): Promise<void> {
  await storage.set({ [TODO_STORAGE_KEY]: todos });
}

export async function addTodo(storage: KvStorage, draft: TodoDraft, now: number): Promise<TodoItem[]> {
  const todos = await loadTodos(storage);
  todos.push(createTodo(draft, now));
  await saveTodos(storage, todos);
  return todos;
}

export async function toggleTodo(storage: KvStorage, id: string, now: number): Promise<TodoItem[]> {
  const todos = await loadTodos(storage);
  const item = todos.find((t) => t.id === id);
  if (item) {
    item.done = !item.done;
    item.completedAt = item.done ? now : null;
  }
  await saveTodos(storage, todos);
  return todos;
}

export async function removeTodo(storage: KvStorage, id: string): Promise<TodoItem[]> {
  const todos = await loadTodos(storage);
  const next = todos.filter((t) => t.id !== id);
  await saveTodos(storage, next);
  return next;
}

export async function updateTodo(
  storage: KvStorage,
  id: string,
  patch: Partial<Pick<TodoItem, "title" | "priority" | "due">>,
  now: number
): Promise<TodoItem[]> {
  const todos = await loadTodos(storage);
  const item = todos.find((t) => t.id === id);
  if (item) {
    if (typeof patch.title === "string" && patch.title.trim()) item.title = patch.title.trim();
    if (patch.priority !== undefined) item.priority = patch.priority;
    if (patch.due !== undefined) item.due = patch.due;
    item.createdAt = item.createdAt; // keep original creation time for stable sort
    void now;
  }
  await saveTodos(storage, todos);
  return todos;
}

const PRIORITY_WEIGHT: Record<TodoPriority, number> = { high: 2, medium: 1, low: 0 };

/** Open first, then high-priority, then earliest due, then oldest created. */
export function sortTodos(todos: TodoItem[]): TodoItem[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pw !== 0) return pw;
    const ad = a.due ?? Number.MAX_SAFE_INTEGER;
    const bd = b.due ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.createdAt - b.createdAt;
  });
}

const DAY_MS = 86_400_000;

/** Short human label for a due date: "overdue by 2d", "due today", "in 3d". */
export function dueLabel(due: number | null, now: number): string | null {
  if (due === null) return null;
  const diffDays = Math.round((due - now) / DAY_MS);
  if (diffDays < 0) return `overdue by ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  return `in ${diffDays}d`;
}

export function todoStats(todos: TodoItem[]): { total: number; open: number; done: number } {
  const done = todos.filter((t) => t.done).length;
  return { total: todos.length, open: todos.length - done, done };
}
