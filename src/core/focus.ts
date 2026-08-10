import { dayKey } from "./date-utils";
import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Distraction blocker — per-site schedules that hide a distracting page
 * behind an honest overlay during work hours. Local only. The overlay is
 * never a trap: "pause for 10 minutes" and "allow today" are always one
 * click away, and disabling the tool in Settings stops it entirely.
 */

/** Days of the week as Date.getDay() numbers: 0 = Sunday … 6 = Saturday. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface FocusRule {
  id: string;
  /** Hostname to block (e.g. "facebook.com"). Subdomains are included. */
  hostname: string;
  /** Block at all times (true) or only inside the daily window (false). */
  always: boolean;
  /** Minutes since midnight the window starts (inclusive). */
  startMin: number;
  /** Minutes since midnight the window ends (exclusive). */
  endMin: number;
  /** Days the schedule applies to (0–6). Ignored when always is true. */
  days: DayOfWeek[];
  enabled: boolean;
}

export const FOCUS_RULES_STORAGE_KEY = "ok.focusRules";
export const FOCUS_PAUSE_STORAGE_KEY = "ok.focusPause";
export const FOCUS_ALLOW_TODAY_STORAGE_KEY = "ok.focusAllowToday";
export const MAX_FOCUS_RULES = 20;

/** Formats minutes-since-midnight as "HH:MM" (popup schedule form). */
export function formatMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parses an "HH:MM" string into minutes-since-midnight (0 on garbage). */
export function parseMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return 0;
  return h * 60 + m;
}

function makeId(): string {
  return `fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isDayOfWeek(value: unknown): value is DayOfWeek {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

function isFocusRule(value: unknown): value is FocusRule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.hostname === "string" &&
    typeof v.always === "boolean" &&
    typeof v.startMin === "number" &&
    typeof v.endMin === "number" &&
    Array.isArray(v.days) &&
    v.days.every(isDayOfWeek) &&
    typeof v.enabled === "boolean"
  );
}

/** Normalizes a user-entered hostname (strips scheme/path/www. prefix). */
export function normalizeHostname(input: string): string {
  let raw = input.trim().toLowerCase();
  try {
    if (raw.includes("://") || raw.startsWith("//")) {
      raw = new URL(raw.includes("://") ? raw : `https:${raw}`).hostname;
    }
  } catch {
    // Fall through to manual cleanup.
  }
  raw = raw.replace(/^www\./, "");
  raw = raw.replace(/\/.*$/, "");
  return raw;
}

export function isValidHostname(input: string): boolean {
  const host = normalizeHostname(input);
  if (!host) return false;
  if (/^[\d.]+$/.test(host)) return false; // bare IPs are too broad — require a real host
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host);
}

export interface NewFocusRule {
  hostname: string;
  always: boolean;
  startMin: number;
  endMin: number;
  days: DayOfWeek[];
}

async function readRules(storage: KvStorage): Promise<FocusRule[]> {
  const raw = await storage.get(FOCUS_RULES_STORAGE_KEY);
  const list = raw[FOCUS_RULES_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isFocusRule);
}

async function writeRules(storage: KvStorage, rules: FocusRule[]): Promise<void> {
  await storage.set({ [FOCUS_RULES_STORAGE_KEY]: rules });
}

/** Adds a rule. Returns null (and writes nothing) when the hostname is invalid. */
export async function addFocusRule(
  storage: KvStorage,
  input: NewFocusRule
): Promise<FocusRule | null> {
  const hostname = normalizeHostname(input.hostname);
  if (!isValidHostname(input.hostname)) return null;
  const rules = await readRules(storage);
  if (rules.some((r) => r.hostname === hostname)) return null; // no duplicates
  const rule: FocusRule = {
    id: makeId(),
    hostname,
    always: input.always,
    startMin: clampMinutes(input.startMin),
    endMin: clampMinutes(input.endMin),
    days: input.days.length > 0 ? input.days : ([1, 2, 3, 4, 5] as DayOfWeek[]),
    enabled: true
  };
  rules.unshift(rule);
  await writeRules(storage, rules.slice(0, MAX_FOCUS_RULES));
  return rule;
}

function clampMinutes(min: number): number {
  if (!Number.isFinite(min)) return 0;
  return Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
}

export async function listFocusRules(storage: KvStorage): Promise<FocusRule[]> {
  return readRules(storage);
}

export async function setFocusRuleEnabled(
  storage: KvStorage,
  id: string,
  enabled: boolean
): Promise<void> {
  const rules = await readRules(storage);
  const rule = rules.find((r) => r.id === id);
  if (rule) {
    rule.enabled = enabled;
    await writeRules(storage, rules);
  }
}

export async function removeFocusRule(storage: KvStorage, id: string): Promise<void> {
  const rules = await readRules(storage);
  await writeRules(storage, rules.filter((r) => r.id !== id));
}

export async function clearFocusRules(storage: KvStorage): Promise<void> {
  await storage.remove(FOCUS_RULES_STORAGE_KEY);
}

/**
 * True when the given rule blocks `now`. Overnight windows (end <= start)
 * block from start until midnight and from midnight until end.
 */
export function isRuleBlocking(rule: FocusRule, now: Date): boolean {
  if (!rule.enabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay() as DayOfWeek;
  if (rule.always) return true;
  if (!rule.days.includes(day)) return false;
  if (rule.endMin > rule.startMin) {
    return minutes >= rule.startMin && minutes < rule.endMin;
  }
  // Crosses midnight: blocked late in the day or early the next morning.
  return minutes >= rule.startMin || minutes < rule.endMin;
}

/** True when any rule matches the hostname (exact or subdomain) and blocks now. */
export function isHostnameBlocked(rules: FocusRule[], hostname: string, now: Date): boolean {
  const host = hostname.toLowerCase();
  return rules.some((rule) => {
    const ruleHost = rule.hostname.toLowerCase();
    if (host !== ruleHost && !host.endsWith(`.${ruleHost}`)) return false;
    return isRuleBlocking(rule, now);
  });
}

/* Pause + allow-today overrides ------------------------------------- */

/** Pauses blocking everywhere until the given timestamp (ms). */
export async function pauseFocusUntil(storage: KvStorage, untilMs: number): Promise<void> {
  await storage.set({ [FOCUS_PAUSE_STORAGE_KEY]: untilMs });
}

export async function isFocusPaused(storage: KvStorage, now: number): Promise<boolean> {
  const raw = await storage.get(FOCUS_PAUSE_STORAGE_KEY);
  const until = raw[FOCUS_PAUSE_STORAGE_KEY];
  return typeof until === "number" && until > now;
}

/** Allows a hostname for the rest of today. */
export async function allowHostnameToday(storage: KvStorage, hostname: string, now: Date): Promise<void> {
  const raw = await storage.get(FOCUS_ALLOW_TODAY_STORAGE_KEY);
  const map = (raw[FOCUS_ALLOW_TODAY_STORAGE_KEY] &&
    typeof raw[FOCUS_ALLOW_TODAY_STORAGE_KEY] === "object"
    ? raw[FOCUS_ALLOW_TODAY_STORAGE_KEY]
    : {}) as Record<string, string>;
  map[normalizeHostname(hostname)] = dayKey(now);
  await storage.set({ [FOCUS_ALLOW_TODAY_STORAGE_KEY]: map });
}

export async function isHostnameAllowedToday(
  storage: KvStorage,
  hostname: string,
  now: Date
): Promise<boolean> {
  const raw = await storage.get(FOCUS_ALLOW_TODAY_STORAGE_KEY);
  const map = raw[FOCUS_ALLOW_TODAY_STORAGE_KEY];
  if (!map || typeof map !== "object") return false;
  const record = map as Record<string, unknown>;
  return record[normalizeHostname(hostname)] === dayKey(now);
}

/** Overall decision: should this hostname be covered by an overlay right now? */
export async function shouldBlockNow(
  storage: KvStorage,
  hostname: string,
  now: Date
): Promise<boolean> {
  if (await isFocusPaused(storage, now.getTime())) return false;
  if (await isHostnameAllowedToday(storage, hostname, now)) return false;
  const rules = await readRules(storage);
  return isHostnameBlocked(rules, hostname, now);
}

export function localStorageFocus(): KvStorage {
  return localStorageArea();
}
