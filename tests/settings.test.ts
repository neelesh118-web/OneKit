import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeSettings,
  saveSettings,
  updateSettings
} from "../src/core/settings";
import { createMemoryStorage } from "../src/core/storage-utils";

describe("settings", () => {
  it("defaults: memory + stats tools on, page-acting tools off", () => {
    expect(DEFAULT_SETTINGS.tools.historyIndex).toBe(true);
    expect(DEFAULT_SETTINGS.tools.clipboardHistory).toBe(true);
    expect(DEFAULT_SETTINGS.tools.cookieReject).toBe(false);
    expect(DEFAULT_SETTINGS.tools.autoplayKiller).toBe(false);
    expect(DEFAULT_SETTINGS.tools.textExpander).toBe(false);
    expect(DEFAULT_SETTINGS.tools.pasteCleaner).toBe(false);
    expect(DEFAULT_SETTINGS.tools.dictation).toBe(false);
    expect(DEFAULT_SETTINGS.tools.draftVault).toBe(false);
    expect(DEFAULT_SETTINGS.tools.chatVault).toBe(false);
    expect(DEFAULT_SETTINGS.tools.commandPalette).toBe(true);
    expect(DEFAULT_SETTINGS.tools.focusBlocker).toBe(false);
    expect(DEFAULT_SETTINGS.tools.screenTime).toBe(true);
  });

  it("normalizes garbage storage into valid settings", () => {
    const s = normalizeSettings({ theme: "dark", tools: { cookieReject: true }, bogus: 1 });
    expect(s.theme).toBe("dark");
    expect(s.tools.cookieReject).toBe(true);
    expect(s.tools.historyIndex).toBe(true);
    expect(normalizeSettings(null).theme).toBe("system");
    expect(normalizeSettings({ theme: "neon" }).theme).toBe("system");
  });

  it("round-trips through storage", async () => {
    const s = createMemoryStorage();
    await saveSettings({ ...DEFAULT_SETTINGS, theme: "dark" }, s);
    expect((await loadSettings(s)).theme).toBe("dark");
  });

  it("updateSettings merges patches", async () => {
    const s = createMemoryStorage();
    const next = await updateSettings({ theme: "dark" }, s);
    expect(next.theme).toBe("dark");
    expect(next.tools.historyIndex).toBe(true);
  });
});
