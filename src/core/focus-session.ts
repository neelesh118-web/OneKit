import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Focus session — a one-click deep-work timer that blocks distracting
 * sites globally for a set period. While a session is active, every site
 * except the allowlist gets the blocker overlay with a countdown and an
 * "End session" escape. Overrides per-site schedules (this is a global,
 * temporary, user-initiated block).
 */

export const FOCUS_SESSION_KEY = "ok.focusSession";

export interface FocusSession {
  startedAt: number;
  /** Epoch ms when the session ends. */
  until: number;
  /** Hostnames allowed during the session (e.g. work sites). */
  allowlist: string[];
}

export const DEFAULT_SESSION_MINUTES = 45;

export function isFocusSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.startedAt === "number" &&
    typeof v.until === "number" &&
    Array.isArray(v.allowlist) &&
    v.allowlist.every((h) => typeof h === "string")
  );
}

export async function readFocusSession(storage: KvStorage): Promise<FocusSession | null> {
  const raw = await storage.get(FOCUS_SESSION_KEY);
  const value = raw[FOCUS_SESSION_KEY];
  if (!isFocusSession(value)) return null;
  return value;
}

export async function startFocusSession(
  storage: KvStorage,
  minutes: number,
  allowlist: string[],
  now: number = Date.now()
): Promise<FocusSession> {
  const duration = Math.max(1, Math.min(12 * 60, Math.round(minutes)));
  const session: FocusSession = {
    startedAt: now,
    until: now + duration * 60 * 1000,
    allowlist: allowlist.map((h) => h.trim().toLowerCase()).filter(Boolean)
  };
  await storage.set({ [FOCUS_SESSION_KEY]: session });
  return session;
}

export async function endFocusSession(storage: KvStorage): Promise<void> {
  await storage.remove(FOCUS_SESSION_KEY);
}

/** Remaining ms, or 0 when the session is over / missing. */
export async function focusSessionRemainingMs(storage: KvStorage, now: number = Date.now()): Promise<number> {
  const session = await readFocusSession(storage);
  if (!session) return 0;
  const remaining = session.until - now;
  if (remaining <= 0) {
    await endFocusSession(storage);
    return 0;
  }
  return remaining;
}

/** Is the hostname allowed (exact or subdomain of an allowlist entry)? */
export function sessionAllowsHostname(session: FocusSession, hostname: string): boolean {
  const host = hostname.toLowerCase();
  return session.allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Is the hostname blocked by the active session? */
export async function sessionBlocksHostname(
  storage: KvStorage,
  hostname: string,
  now: number = Date.now()
): Promise<boolean> {
  const session = await readFocusSession(storage);
  if (!session) return false;
  if (session.until <= now) {
    await endFocusSession(storage);
    return false;
  }
  return !sessionAllowsHostname(session, hostname);
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function localStorageFocusSession(): KvStorage {
  return localStorageArea();
}
