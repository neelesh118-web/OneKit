/**
 * Cookie manager — pure helpers for viewing and editing cookies for the
 * current site. The popup talks to chrome.cookies through injected
 * capabilities; this module validates edits, classifies cookies, and
 * formats exports so the logic stays testable.
 */

export interface CookieLike {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  session: boolean;
  expirationDate?: number;
  sameSite?: "no_restriction" | "lax" | "strict";
}

export interface CookieStats {
  total: number;
  session: number;
  secure: number;
  httpOnly: number;
}

/** Bytes a cookie occupies (name + value + attrs, ~ RFC 6265 estimate). */
export function cookieSize(cookie: CookieLike): number {
  const extras = cookie.domain.length + cookie.path.length + 32;
  return cookie.name.length + cookie.value.length + extras;
}

export function classifyCookies(cookies: CookieLike[]): CookieStats {
  return {
    total: cookies.length,
    session: cookies.filter((c) => c.session).length,
    secure: cookies.filter((c) => c.secure).length,
    httpOnly: cookies.filter((c) => c.httpOnly).length
  };
}

export function isSafeCookieValue(value: string): boolean {
  // Control characters and separators would corrupt the cookie jar.
  return !/[\u0000-\u001f\u007f;]/.test(value);
}

export function isSafeCookieName(name: string): boolean {
  return /^[^\u0000-\u001f\u007f;=\s]+$/.test(name) && name.length > 0;
}

export type CookieEdit = ToolResultLike<{ name: string; value: string; domain: string; path: string }>;

interface ToolResultLike<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

/** Builds a cookie edit from raw form values, validating name/value. */
export function buildCookieEdit(input: {
  name: string;
  value: string;
  domain: string;
  path: string;
}): CookieEdit {
  const name = input.name.trim();
  const domain = input.domain.trim();
  const path = input.path.trim() || "/";
  if (!isSafeCookieName(name)) return { ok: false, error: "Cookie name contains invalid characters." };
  if (!isSafeCookieValue(input.value)) return { ok: false, error: "Cookie value contains control characters or a semicolon." };
  if (!domain) return { ok: false, error: "Domain is required." };
  return { ok: true, value: { name, value: input.value, domain, path } };
}

/** JSON export of a site's cookies (for backup/sharing). */
export function exportCookies(cookies: CookieLike[]): string {
  return JSON.stringify(cookies, null, 2);
}

/**
 * Whether a cookie belongs to the site (same registrable domain, either
 * direction) — a cookie for example.com applies to sub.example.com and
 * vice versa. Third-party domains (evil.com) never match.
 */
export function isSameSiteCookie(cookie: CookieLike, hostname: string): boolean {
  const host = hostname.toLowerCase();
  const domain = cookie.domain.replace(/^\./, "").toLowerCase();
  return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);
}
