import { describe, expect, it } from "vitest";
import {
  endFocusSession,
  focusSessionRemainingMs,
  formatRemaining,
  readFocusSession,
  sessionAllowsHostname,
  sessionBlocksHostname,
  startFocusSession
} from "../src/core/focus-session";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();
const NOW = 1_000_000;

describe("focus session", () => {
  it("starts a session and clamps the duration", async () => {
    const s = storage();
    const session = await startFocusSession(s, 45, ["github.com", " docs.google.com "], NOW);
    expect(session.until - session.startedAt).toBe(45 * 60 * 1000);
    expect(session.allowlist).toEqual(["github.com", "docs.google.com"]);
    const tiny = await startFocusSession(s, 0, [], NOW);
    expect(tiny.until - tiny.startedAt).toBe(60 * 1000); // min 1 minute
    const huge = await startFocusSession(s, 9999, [], NOW);
    expect(huge.until - huge.startedAt).toBe(12 * 60 * 60 * 1000); // max 12h
  });

  it("reads back the active session", async () => {
    const s = storage();
    expect(await readFocusSession(s)).toBeNull();
    await startFocusSession(s, 45, [], NOW);
    expect((await readFocusSession(s))?.startedAt).toBe(NOW);
  });

  it("reports remaining time and auto-ends an expired session", async () => {
    const s = storage();
    await startFocusSession(s, 45, [], NOW);
    expect(await focusSessionRemainingMs(s, NOW + 10 * 60 * 1000)).toBeCloseTo(35 * 60 * 1000);
    // After the end time, the session is gone and remaining is 0.
    expect(await focusSessionRemainingMs(s, NOW + 46 * 60 * 1000)).toBe(0);
    expect(await readFocusSession(s)).toBeNull();
  });

  it("blocks hostnames outside the allowlist only", async () => {
    const s = storage();
    await startFocusSession(s, 45, ["github.com"], NOW);
    expect(await sessionBlocksHostname(s, "twitter.com", NOW + 1000)).toBe(true);
    expect(await sessionBlocksHostname(s, "github.com", NOW + 1000)).toBe(false);
    expect(await sessionBlocksHostname(s, "www.github.com", NOW + 1000)).toBe(false);
    // Subdomain trick must not bypass: github.com.evil.net is not allowed.
    expect(await sessionBlocksHostname(s, "github.com.evil.net", NOW + 1000)).toBe(true);
  });

  it("never blocks when no session is active", async () => {
    const s = storage();
    expect(await sessionBlocksHostname(s, "twitter.com", NOW)).toBe(false);
    await endFocusSession(s);
    expect(await readFocusSession(s)).toBeNull();
  });

  it("sessionAllowsHostname matches exact and subdomains", () => {
    const session = {
      startedAt: NOW,
      until: NOW + 60000,
      allowlist: ["github.com"]
    };
    expect(sessionAllowsHostname(session, "github.com")).toBe(true);
    expect(sessionAllowsHostname(session, "api.github.com")).toBe(true);
    expect(sessionAllowsHostname(session, "github.com.evil.net")).toBe(false);
    expect(sessionAllowsHostname(session, "gitlab.com")).toBe(false);
  });

  it("formats the countdown readably", () => {
    expect(formatRemaining(90_000)).toBe("01:30");
    expect(formatRemaining(45 * 60 * 1000)).toBe("45:00");
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5)).toBe("00:00");
  });
});
