/**
 * Color palette history — saved swatches for the color picker. Kept in
 * chrome.storage (KvStorage), capped at 24 entries so it can't grow
 * without bound. Pure and testable.
 */
import type { KvStorage } from "./storage-utils";

const KEY = "ok:palette";
const MAX = 24;

export function normalizeHex(input: string): string | null {
  let hex = input.trim().toLowerCase();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

async function readPalette(storage: KvStorage): Promise<string[]> {
  const got = await storage.get(KEY);
  const raw = got[KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is string => typeof c === "string" && normalizeHex(c) !== null);
}

export async function listPalette(storage: KvStorage): Promise<string[]> {
  return readPalette(storage);
}

/** Adds a color (newest first, deduped, capped at 24). Returns the list. */
export async function addPaletteColor(input: string, storage: KvStorage): Promise<string[]> {
  const hex = normalizeHex(input);
  if (!hex) return readPalette(storage);
  const list = (await readPalette(storage)).filter((c) => c !== hex);
  const next = [hex, ...list].slice(0, MAX);
  await storage.set({ [KEY]: next });
  return next;
}

export async function removePaletteColor(input: string, storage: KvStorage): Promise<string[]> {
  const hex = normalizeHex(input);
  const next = (await readPalette(storage)).filter((c) => c !== hex);
  await storage.set({ [KEY]: next });
  return next;
}

export async function clearPalette(storage: KvStorage): Promise<void> {
  await storage.remove(KEY);
}
