import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  autoRefreshFor,
  clearAllAutoRefresh,
  clearAutoRefresh,
  listAutoRefreshRules,
  normalizeIntervalSeconds,
  originOf,
  setAutoRefresh,
  AUTO_REFRESH_KEY
} from "../src/core/auto-refresh";

describe("auto-refresh", () => {
  it("normalizes intervals into the valid range", () => {
    expect(normalizeIntervalSeconds(10)).toBe(10);
    expect(normalizeIntervalSeconds(2)).toBe(5);
    expect(normalizeIntervalSeconds(999999)).toBe(24 * 60 * 60);
    expect(normalizeIntervalSeconds("bad")).toBe(5);
    expect(normalizeIntervalSeconds(7.6)).toBe(8);
  });

  it("keys rules on origin, ignoring path/query", () => {
    expect(originOf("https://example.com/a?b=1")).toBe("https://example.com");
    expect(originOf("https://example.com:8443/x")).toBe("https://example.com:8443");
  });

  it("sets, lists and clears rules", async () => {
    const storage = createMemoryStorage();
    await setAutoRefresh(storage, "https://example.com/status", 15, 1000);
    await setAutoRefresh(storage, "https://other.org/", 30, 2000);

    const rules = await listAutoRefreshRules(storage);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.intervalSeconds)).toEqual([15, 30]);

    // Updating an existing origin replaces it.
    await setAutoRefresh(storage, "https://example.com/", 20, 3000);
    const after = await listAutoRefreshRules(storage);
    expect(after).toHaveLength(2);
    expect(await autoRefreshFor(storage, "https://example.com/status")).toMatchObject({ intervalSeconds: 20 });

    expect(await clearAutoRefresh(storage, "https://example.com/")).toBe(true);
    expect(await clearAutoRefresh(storage, "https://example.com/")).toBe(false);
    expect(await clearAllAutoRefresh(storage)).toBe(1);
    const raw = await storage.get(AUTO_REFRESH_KEY);
    expect(raw[AUTO_REFRESH_KEY]).toEqual([]);
  });
});
