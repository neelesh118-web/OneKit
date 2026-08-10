import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Per-site daily budgets — cap how many minutes per day you spend on a
 * site. The distraction blocker consults these (only while the blocker is
 * on): when today's screen time for a site exceeds its budget, the site
 * gets the same overlay as a schedule block.
 */

export const BUDGETS_STORAGE_KEY = "ok.budgets";
export const MAX_BUDGETS = 50;
export const MAX_BUDGET_MINUTES = 24 * 60;

export interface BudgetRule {
  id: string;
  hostname: string;
  minutesPerDay: number;
}

/** Normalizes a hostname: lowercase, trimmed, no protocol or path. */
export function normalizeBudgetHostname(raw: string): string {
  let host = raw.trim().toLowerCase();
  try {
    // Accept full URLs too ("https://www.facebook.com/feed" → facebook.com).
    if (/^https?:\/\//.test(host)) {
      host = new URL(host).hostname;
    }
  } catch {
    // Fall through to the plain-string cleanup below.
  }
  host = host.replace(/^www\./, "");
  return host;
}

export function isValidBudgetHostname(hostname: string): boolean {
  const host = normalizeBudgetHostname(hostname);
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host);
}

/** Does `hostname` match a budget rule (rule hostname, or any subdomain of it)? */
export function budgetForHostname(budgets: BudgetRule[], hostname: string): BudgetRule | null {
  const host = hostname.toLowerCase();
  for (const rule of budgets) {
    const ruleHost = rule.hostname.toLowerCase();
    if (host === ruleHost || host.endsWith(`.${ruleHost}`)) return rule;
  }
  return null;
}

function makeId(now: number): string {
  return `budget-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isBudgetRule(value: unknown): value is BudgetRule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.hostname === "string" &&
    typeof v.minutesPerDay === "number" &&
    Number.isFinite(v.minutesPerDay)
  );
}

async function readBudgets(storage: KvStorage): Promise<BudgetRule[]> {
  const raw = await storage.get(BUDGETS_STORAGE_KEY);
  const list = raw[BUDGETS_STORAGE_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isBudgetRule);
}

async function writeBudgets(storage: KvStorage, budgets: BudgetRule[]): Promise<void> {
  await storage.set({ [BUDGETS_STORAGE_KEY]: budgets });
}

export async function listBudgets(storage: KvStorage): Promise<BudgetRule[]> {
  const budgets = await readBudgets(storage);
  return budgets.sort((a, b) => a.hostname.localeCompare(b.hostname));
}

/** Adds or updates a budget rule. Returns the saved rule, or null when invalid. */
export async function saveBudget(
  storage: KvStorage,
  hostnameRaw: string,
  minutesPerDay: number,
  now: number = Date.now()
): Promise<BudgetRule | null> {
  const hostname = normalizeBudgetHostname(hostnameRaw);
  if (!isValidBudgetHostname(hostname)) return null;
  const minutes = Math.max(1, Math.min(MAX_BUDGET_MINUTES, Math.round(minutesPerDay)));
  const budgets = await readBudgets(storage);
  const existing = budgets.find((b) => b.hostname === hostname);
  if (existing) {
    existing.minutesPerDay = minutes;
    await writeBudgets(storage, budgets);
    return existing;
  }
  if (budgets.length >= MAX_BUDGETS) return null;
  const rule: BudgetRule = { id: makeId(now), hostname, minutesPerDay: minutes };
  budgets.push(rule);
  await writeBudgets(storage, budgets);
  return rule;
}

export async function removeBudget(storage: KvStorage, id: string): Promise<void> {
  const budgets = await readBudgets(storage);
  await writeBudgets(storage, budgets.filter((b) => b.id !== id));
}

export async function clearBudgets(storage: KvStorage): Promise<void> {
  await storage.remove(BUDGETS_STORAGE_KEY);
}

export function localStorageBudgets(): KvStorage {
  return localStorageArea();
}
