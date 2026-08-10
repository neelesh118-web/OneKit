/**
 * Minimal KV storage abstraction so every OneKit module is testable without
 * a live `browser.storage.local`. Real extension code uses `localStorageArea()`;
 * tests use `createMemoryStorage()`.
 */

import { browser } from "wxt/browser";

export interface KvStorage {
  get(keys: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Wraps chrome/browser storage.local. */
export function localStorageArea(): KvStorage {
  const area = browser.storage?.local;
  if (!area) {
    throw new Error("browser.storage.local is not available in this context");
  }
  return {
    async get(keys) {
      return (await area.get(keys)) as Record<string, unknown>;
    },
    async set(items) {
      await area.set(items);
    },
    async remove(keys) {
      await area.remove(keys);
    }
  };
}

/** In-memory storage for tests and fallbacks. */
export function createMemoryStorage(initial?: Record<string, unknown>): KvStorage {
  const data: Record<string, unknown> = { ...(initial ?? {}) };
  return {
    async get(keys) {
      if (keys === null) return { ...data };
      if (typeof keys === "string") {
        return data[keys] === undefined ? {} : { [keys]: data[keys] };
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (data[k] !== undefined) out[k] = data[k];
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [k, def] of Object.entries(keys)) {
        out[k] = data[k] !== undefined ? data[k] : def;
      }
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const k of list) delete data[k];
    }
  };
}
