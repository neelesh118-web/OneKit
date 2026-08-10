import { describe, expect, it } from "vitest";
import {
  addFocusRule,
  allowHostnameToday,
  formatMinutes,
  isHostnameAllowedToday,
  isHostnameBlocked,
  isRuleBlocking,
  isFocusPaused,
  isValidHostname,
  listFocusRules,
  normalizeHostname,
  parseMinutes,
  pauseFocusUntil,
  removeFocusRule,
  setFocusRuleEnabled,
  shouldBlockNow,
  type FocusRule
} from "../src/core/focus";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

const at = (day: number, hour: number, minute = 0): Date => {
  // Fixed week in 2026-08: day 0 = Sunday 2026-08-09.
  const base = new Date(2026, 7, 9 + day, hour, minute);
  return base;
};

const rule = (over: Partial<FocusRule> = {}): FocusRule => ({
  id: "r1",
  hostname: "facebook.com",
  always: false,
  startMin: 9 * 60,
  endMin: 17 * 60,
  days: [1, 2, 3, 4, 5],
  enabled: true,
  ...over
});

describe("focus rules", () => {
  it("formats and parses minute windows", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(9 * 60)).toBe("09:00");
    expect(formatMinutes(17 * 60 + 30)).toBe("17:30");
    expect(formatMinutes(23 * 60 + 59)).toBe("23:59");
    expect(formatMinutes(99 * 60)).toBe("23:59"); // clamps
    expect(parseMinutes("09:00")).toBe(9 * 60);
    expect(parseMinutes("17:30")).toBe(17 * 60 + 30);
    expect(parseMinutes("24:00")).toBe(0); // invalid hour
    expect(parseMinutes("9am")).toBe(0);
    expect(parseMinutes("")).toBe(0);
  });

  it("normalizes and validates hostnames", () => {
    expect(normalizeHostname("https://www.Facebook.com/path")).toBe("facebook.com");
    expect(normalizeHostname("  twitter.com  ")).toBe("twitter.com");
    expect(isValidHostname("facebook.com")).toBe(true);
    expect(isValidHostname("www.facebook.com")).toBe(true);
    expect(isValidHostname("not a host")).toBe(false);
    expect(isValidHostname("")).toBe(false);
    expect(isValidHostname("192.168.1.1")).toBe(false);
  });

  it("blocks inside the daily window on scheduled days", () => {
    const r = rule();
    expect(isRuleBlocking(r, at(1, 9, 0))).toBe(true); // Mon 09:00
    expect(isRuleBlocking(r, at(1, 12))).toBe(true);
    expect(isRuleBlocking(r, at(1, 16, 59))).toBe(true);
    expect(isRuleBlocking(r, at(1, 8, 59))).toBe(false);
    expect(isRuleBlocking(r, at(1, 17, 0))).toBe(false);
  });

  it("ignores unscheduled days", () => {
    expect(isRuleBlocking(rule(), at(0, 12))).toBe(false); // Sunday
    expect(isRuleBlocking(rule(), at(6, 12))).toBe(false); // Saturday
  });

  it("handles overnight windows (end <= start)", () => {
    const r = rule({ startMin: 22 * 60, endMin: 6 * 60 });
    expect(isRuleBlocking(r, at(1, 23))).toBe(true);
    expect(isRuleBlocking(r, at(2, 3))).toBe(true); // next morning
    expect(isRuleBlocking(r, at(1, 12))).toBe(false);
  });

  it("always rules block regardless of time or day", () => {
    expect(isRuleBlocking(rule({ always: true }), at(0, 3))).toBe(true);
  });

  it("disabled rules never block", () => {
    expect(isRuleBlocking(rule({ enabled: false }), at(1, 12))).toBe(false);
  });

  it("matches the exact host and subdomains", () => {
    const r = rule();
    const date = at(1, 12);
    expect(isHostnameBlocked([r], "facebook.com", date)).toBe(true);
    expect(isHostnameBlocked([r], "m.facebook.com", date)).toBe(true);
    expect(isHostnameBlocked([r], "www.facebook.com", date)).toBe(true);
    expect(isHostnameBlocked([r], "notfacebook.com", date)).toBe(false);
    expect(isHostnameBlocked([r], "facebook.com.evil.net", date)).toBe(false);
  });
});

describe("focus store", () => {
  it("adds, lists, toggles, removes rules and rejects duplicates/bad hosts", async () => {
    const s = storage();
    const added = await addFocusRule(s, { hostname: "https://x.com/", always: true, startMin: 0, endMin: 0, days: [] });
    expect(added?.hostname).toBe("x.com");
    const dup = await addFocusRule(s, { hostname: "x.com", always: true, startMin: 0, endMin: 0, days: [] });
    expect(dup).toBeNull();
    const bad = await addFocusRule(s, { hostname: "garbage host", always: true, startMin: 0, endMin: 0, days: [] });
    expect(bad).toBeNull();

    const rules = await listFocusRules(s);
    expect(rules).toHaveLength(1);

    await setFocusRuleEnabled(s, added!.id, false);
    expect((await listFocusRules(s))[0]?.enabled).toBe(false);

    await removeFocusRule(s, added!.id);
    expect(await listFocusRules(s)).toHaveLength(0);
  });

  it("pause overrides blocking", async () => {
    const s = storage();
    const r = rule();
    await pauseFocusUntil(s, 2000);
    expect(await isFocusPaused(s, 1000)).toBe(true);
    expect(await isFocusPaused(s, 3000)).toBe(false); // expired
    expect(await shouldBlockNow(s, "facebook.com", at(1, 12))).toBe(false); // paused
    // Without rules nothing blocks; with rules it blocks again.
    expect(await shouldBlockNow(s, "facebook.com", at(1, 12))).toBe(false);
    await addFocusRule(s, { hostname: "facebook.com", always: false, startMin: 9 * 60, endMin: 17 * 60, days: [1, 2, 3, 4, 5] });
    expect(await shouldBlockNow(s, "facebook.com", at(1, 12))).toBe(true);
    expect(await shouldBlockNow(s, "facebook.com", at(1, 20))).toBe(false);
  });

  it("allow-today overrides blocking for the rest of the day only", async () => {
    const s = storage();
    await addFocusRule(s, { hostname: "facebook.com", always: true, startMin: 0, endMin: 0, days: [] });
    const day1 = at(1, 12);
    const day2 = at(2, 12);
    expect(await shouldBlockNow(s, "facebook.com", day1)).toBe(true);
    await allowHostnameToday(s, "facebook.com", day1);
    expect(await isHostnameAllowedToday(s, "facebook.com", day1)).toBe(true);
    expect(await shouldBlockNow(s, "facebook.com", day1)).toBe(false);
    expect(await shouldBlockNow(s, "facebook.com", day2)).toBe(true); // next day blocks again
  });
});
