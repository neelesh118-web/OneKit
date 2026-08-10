// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadLimit, saveLimit, statusFor, suspensionCandidates } from "../src/core/tab-limiter";
import { createMemoryStorage } from "../src/core/storage-utils";

describe("loadLimit / saveLimit", () => {
  it("defaults and clamps", async () => {
    const storage = createMemoryStorage();
    expect(await loadLimit(storage)).toBe(40);
    expect(await saveLimit(storage, 5)).toBe(10);
    expect(await saveLimit(storage, 9999)).toBe(500);
    expect(await loadLimit(storage)).toBe(500);
  });
  it("rejects garbage stored values", async () => {
    const storage = createMemoryStorage({ "ok.tabLimit": "lots" });
    expect(await loadLimit(storage)).toBe(40);
  });
});

describe("statusFor", () => {
  it("under limit is ok", () => {
    expect(statusFor(20, 40).action).toBe("ok");
  });
  it("slightly over warns", () => {
    expect(statusFor(42, 40).action).toBe("warn");
  });
  it("well over flags", () => {
    expect(statusFor(80, 40).action).toBe("over");
  });
  it("limit 0 means off", () => {
    expect(statusFor(50, 0).action).toBe("ok");
  });
});

describe("suspensionCandidates", () => {
  const tabs = [
    { id: 1, active: true, lastAccessed: 100 },
    { id: 2, active: false, lastAccessed: 10 },
    { id: 3, active: false, lastAccessed: 50, pinned: true },
    { id: 4, active: false, lastAccessed: 5 },
    { id: 5, active: false, lastAccessed: 60, discarded: true }
  ];
  it("picks the oldest non-active, non-pinned, non-discarded tabs", () => {
    const candidates = suspensionCandidates(tabs, 1);
    // keep 1 → excess = 2 eligible (ids 2,4) minus 1 = 1 → oldest = id 4.
    expect(candidates).toEqual([4]);
  });
  it("returns none when under the keep threshold", () => {
    expect(suspensionCandidates(tabs, 10)).toEqual([]);
  });
});
