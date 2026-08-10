// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BACKUP_KEYS } from "../src/core/backup-restore";

/** All src/core TypeScript sources as raw text (Vite resolves at build time). */
const CORE_SOURCES = import.meta.glob("../src/core/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

function declaredKeys(): Set<string> {
  const keys = new Set<string>();
  for (const text of Object.values(CORE_SOURCES)) {
    for (const match of text.matchAll(/"ok\.[a-zA-Z0-9.]+"/g)) {
      keys.add(match[0].slice(1, -1));
    }
  }
  return keys;
}

/**
 * The backup catalog is the single source of truth for what a full backup
 * contains. Every `ok.*` key a store declares must be listed there, or a
 * user can believe a backup protects data it silently omits.
 */
describe("backup catalog completeness (audit F-01)", () => {
  it("covers every ok.* storage key declared in src/core", () => {
    const declared = declaredKeys();
    expect(declared.size).toBeGreaterThan(20);
    for (const key of [...declared].sort()) {
      expect(BACKUP_KEYS).toContain(key);
    }
  });

  it("does not list keys that no store declares (no dead entries)", () => {
    const declared = declaredKeys();
    for (const key of BACKUP_KEYS) {
      expect(declared.has(key), `BACKUP_KEYS lists "${key}" but no core module declares it`).toBe(true);
    }
  });
});
