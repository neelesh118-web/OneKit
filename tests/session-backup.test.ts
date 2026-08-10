import { describe, expect, it } from "vitest";
import {
  clearSessionBackup,
  readSessionBackup,
  saveSessionBackup
} from "../src/core/session-backup";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("session-backup", () => {
  it("saves and reads back a snapshot", async () => {
    const s = storage();
    const tabs = [
      { id: 1, url: "https://a.com/", title: "A" },
      { id: 2, url: "https://b.com/", title: "B" }
    ];
    const saved = await saveSessionBackup(s, tabs, 1000);
    expect(saved?.tabs).toHaveLength(2);
    const backup = await readSessionBackup(s);
    expect(backup?.savedAt).toBe(1000);
    expect(backup?.tabs[0]?.url).toBe("https://a.com/");
  });

  it("skips non-http(s) tabs", async () => {
    const s = storage();
    await saveSessionBackup(s, [
      { id: 1, url: "https://a.com/", title: "A" },
      { id: 2, url: "chrome://extensions", title: "Ext" },
      { id: 3, url: "about:blank", title: "" }
    ]);
    const backup = await readSessionBackup(s);
    expect(backup?.tabs.map((t) => t.url)).toEqual(["https://a.com/"]);
  });

  it("returns null when there is nothing to save", async () => {
    const s = storage();
    expect(await saveSessionBackup(s, [], 1)).toBeNull();
    expect(await readSessionBackup(s)).toBeNull();
  });

  it("treats corrupt snapshots as missing", async () => {
    const s = storage();
    await s.set({ "ok.sessionBackup": { savedAt: "not-a-number", tabs: [] } });
    expect(await readSessionBackup(s)).toBeNull();
    await clearSessionBackup(s);
    expect(await readSessionBackup(s)).toBeNull();
  });
});
