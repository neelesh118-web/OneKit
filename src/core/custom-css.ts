/**
 * Custom CSS per site — power users' #1 ask that every "stylish"-style
 * extension got killed for by selling browsing data. This one is fully
 * local: rules keyed by hostname, applied as a <style> tag, with a
 * simple sandboxed editor in the popup. Nothing ever leaves the device.
 */

import type { KvStorage } from "./storage-utils";

export const CUSTOM_CSS_KEY = "ok.customCss";

export interface SiteCssRule {
  hostname: string;
  css: string;
  updatedAt: number;
  enabled: boolean;
}

function isRule(value: unknown): value is SiteCssRule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.hostname === "string" &&
    typeof v.css === "string" &&
    typeof v.updatedAt === "number" &&
    typeof v.enabled === "boolean"
  );
}

async function readRules(storage: KvStorage): Promise<SiteCssRule[]> {
  const raw = await storage.get(CUSTOM_CSS_KEY);
  const list = raw[CUSTOM_CSS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isRule);
}

async function writeRules(storage: KvStorage, rules: SiteCssRule[]): Promise<void> {
  await storage.set({ [CUSTOM_CSS_KEY]: rules });
}

/** Hostname key from a URL (lowercase, no www). */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^www\./, "").toLowerCase();
  }
}

export async function listCssRules(storage: KvStorage): Promise<SiteCssRule[]> {
  const rules = await readRules(storage);
  return rules.sort((a, b) => a.hostname.localeCompare(b.hostname));
}

/** Enabled CSS for a hostname, or null. */
export async function cssForHostname(storage: KvStorage, hostname: string): Promise<string | null> {
  const rules = await readRules(storage);
  const rule = rules.find((r) => r.hostname === hostname && r.enabled && r.css.trim().length > 0);
  return rule?.css ?? null;
}

export async function upsertCssRule(
  storage: KvStorage,
  hostname: string,
  css: string,
  now: number = Date.now()
): Promise<SiteCssRule> {
  const cleanHost = hostname.replace(/^www\./, "").toLowerCase().trim();
  if (!cleanHost) throw new Error("Enter a hostname first (e.g. example.com).");
  const rule: SiteCssRule = { hostname: cleanHost, css, updatedAt: now, enabled: true };
  const rules = await readRules(storage);
  const next = rules.filter((r) => r.hostname !== cleanHost).concat(rule);
  await writeRules(storage, next);
  return rule;
}

export async function removeCssRule(storage: KvStorage, hostname: string): Promise<boolean> {
  const rules = await readRules(storage);
  const next = rules.filter((r) => r.hostname !== hostname);
  if (next.length === rules.length) return false;
  await writeRules(storage, next);
  return true;
}

export async function toggleCssRule(storage: KvStorage, hostname: string, enabled: boolean): Promise<void> {
  const rules = await readRules(storage);
  const rule = rules.find((r) => r.hostname === hostname);
  if (!rule) return;
  rule.enabled = enabled;
  await writeRules(storage, rules);
}

export function localStorageCustomCss(): KvStorage {
  return localStorageAreaRef();
}

import { localStorageArea as localStorageAreaRef } from "./storage-utils";
