import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_MODE,
  hostnameOnOffList,
  readDarkMode,
  saveDarkMode,
  shouldApplyDarkMode
} from "../src/core/dark-mode";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("dark mode", () => {
  it("defaults to off with an empty off-list", async () => {
    expect(await readDarkMode(storage())).toEqual(DEFAULT_DARK_MODE);
    expect(await shouldApplyDarkMode(storage(), "example.com")).toBe(false);
  });

  it("saves state and applies when enabled", async () => {
    const s = storage();
    await saveDarkMode(s, { enabled: true, offList: ["youtube.com"] });
    const state = await readDarkMode(s);
    expect(state.enabled).toBe(true);
    expect(await shouldApplyDarkMode(s, "example.com")).toBe(true);
  });

  it("respects the off-list with subdomains, case-insensitively", async () => {
    const s = storage();
    await saveDarkMode(s, { enabled: true, offList: ["YouTube.com"] });
    expect(await shouldApplyDarkMode(s, "youtube.com")).toBe(false);
    expect(await shouldApplyDarkMode(s, "www.youtube.com")).toBe(false);
    expect(await shouldApplyDarkMode(s, "m.youtube.com")).toBe(false);
    // A lookalike hostname must not match.
    expect(await shouldApplyDarkMode(s, "youtube.com.evil.net")).toBe(true);
    expect(await shouldApplyDarkMode(s, "youtube.org")).toBe(true);
  });

  it("hostnameOnOffList matches exact and subdomains only", () => {
    const off = ["github.com"];
    expect(hostnameOnOffList(off, "github.com")).toBe(true);
    expect(hostnameOnOffList(off, "gist.github.com")).toBe(true);
    expect(hostnameOnOffList(off, "gitlab.com")).toBe(false);
    expect(hostnameOnOffList(off, "notgithub.com")).toBe(false);
  });

  it("coerces corrupt stored values back to defaults", async () => {
    const s = storage();
    await s.set({ "ok.darkMode": { enabled: "yes" } });
    const state = await readDarkMode(s);
    expect(state.enabled).toBe(false);
    expect(state.offList).toEqual([]);
  });
});
