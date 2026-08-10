// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportSessions, importSessions, serializeSessions } from "../src/core/session-io";
import { PARKING_STORAGE_KEY } from "../src/core/tab-parking";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;

describe("exportSessions", () => {
  it("gathers backup, workspaces and parked tabs", async () => {
    const storage = createMemoryStorage({
      "ok.sessionBackup": { savedAt: NOW, tabs: [{ url: "https://a.com", title: "A" }] },
      "ok.workspaces": [{ id: "w1", name: "Work", savedAt: NOW, tabs: [{ url: "https://b.com", title: "B" }] }],
      [PARKING_STORAGE_KEY]: [{ url: "https://c.com", title: "C", parkedAt: NOW }]
    });
    const out = await exportSessions(storage);
    expect(out.backup?.tabs).toHaveLength(1);
    expect(out.workspaces).toHaveLength(1);
    expect(out.parked).toHaveLength(1);
    expect(out.version).toBe(1);
    expect(serializeSessions(out)).toContain("https://c.com");
  });
});

describe("importSessions", () => {
  it("restores workspaces and parked tabs", async () => {
    const storage = createMemoryStorage();
    const result = await importSessions(storage, {
      version: 1,
      workspaces: [{ id: "w1", name: "Work", savedAt: NOW, tabs: [{ url: "https://b.com", title: "B" }] }],
      parked: [{ url: "https://c.com", title: "C", parkedAt: NOW }],
      backup: { savedAt: NOW, tabs: [{ url: "https://a.com", title: "A" }] }
    });
    expect(result.restored.workspaces).toBe(1);
    expect(result.restored.parked).toBe(1);
    expect(result.restored.backup).toBe(true);
    expect(result.errors).toEqual([]);
  });
  it("rejects garbage and empty files honestly", async () => {
    const storage = createMemoryStorage();
    const bad = await importSessions(storage, "nope");
    expect(bad.errors.length).toBeGreaterThan(0);
    const empty = await importSessions(storage, { workspaces: [], parked: [] });
    expect(empty.errors.some((e) => e.includes("No recognizable"))).toBe(true);
  });
  it("filters malformed entries", async () => {
    const storage = createMemoryStorage();
    const result = await importSessions(storage, {
      workspaces: [{ id: 1 }],
      parked: [{ url: "https://ok.com", title: "OK", parkedAt: NOW }, { url: 5 }]
    });
    expect(result.restored.parked).toBe(1);
    expect(result.restored.workspaces).toBe(0);
  });
});
