import { describe, expect, it } from "vitest";
import {
  buildCookieEdit,
  classifyCookies,
  cookieSize,
  exportCookies,
  isSafeCookieName,
  isSafeCookieValue,
  isSameSiteCookie,
  type CookieLike
} from "../src/core/cookie-manager";

const cookie = (overrides: Partial<CookieLike> = {}): CookieLike => ({
  name: "session",
  value: "abc123",
  domain: "example.com",
  path: "/",
  secure: true,
  httpOnly: true,
  session: false,
  ...overrides
});

describe("classifyCookies", () => {
  it("counts totals, session, secure, and httpOnly", () => {
    const stats = classifyCookies([
      cookie({ session: true }),
      cookie({ secure: false }),
      cookie({ httpOnly: false })
    ]);
    expect(stats.total).toBe(3);
    expect(stats.session).toBe(1);
    expect(stats.secure).toBe(2);
    expect(stats.httpOnly).toBe(2);
  });
});

describe("cookieSize", () => {
  it("estimates the bytes a cookie occupies", () => {
    expect(cookieSize(cookie({ name: "ab", value: "cd" }))).toBeGreaterThan(0);
  });
});

describe("safety", () => {
  it("rejects control characters and separators in values", () => {
    expect(isSafeCookieValue("plain value")).toBe(true);
    expect(isSafeCookieValue("has;semicolon")).toBe(false);
    expect(isSafeCookieValue("has\nnewline")).toBe(false);
  });

  it("validates cookie names", () => {
    expect(isSafeCookieName("session_id")).toBe(true);
    expect(isSafeCookieName("")).toBe(false);
    expect(isSafeCookieName("bad name")).toBe(false);
    expect(isSafeCookieName("bad=name")).toBe(false);
  });
});

describe("buildCookieEdit", () => {
  it("builds a valid edit", () => {
    const result = buildCookieEdit({ name: "theme", value: "dark", domain: "example.com", path: "/" });
    expect(result.ok && result.value).toEqual({ name: "theme", value: "dark", domain: "example.com", path: "/" });
  });

  it("rejects invalid names, values, and missing domains", () => {
    expect(buildCookieEdit({ name: "", value: "x", domain: "example.com", path: "/" }).ok).toBe(false);
    expect(buildCookieEdit({ name: "a;b", value: "x", domain: "example.com", path: "/" }).ok).toBe(false);
    expect(buildCookieEdit({ name: "a", value: "x;y", domain: "example.com", path: "/" }).ok).toBe(false);
    expect(buildCookieEdit({ name: "a", value: "x", domain: "", path: "/" }).ok).toBe(false);
  });
});

describe("exportCookies + isSameSiteCookie", () => {
  it("exports as JSON and detects same-site cookies", () => {
    const json = exportCookies([cookie()]);
    expect(JSON.parse(json)[0]!.name).toBe("session");
    expect(isSameSiteCookie(cookie({ domain: ".example.com" }), "example.com")).toBe(true);
    expect(isSameSiteCookie(cookie({ domain: "sub.example.com" }), "example.com")).toBe(true);
    expect(isSameSiteCookie(cookie({ domain: "evil.com" }), "example.com")).toBe(false);
  });
});
