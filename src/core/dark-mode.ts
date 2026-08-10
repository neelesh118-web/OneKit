import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Starter dark mode — a per-site CSS filter that inverts a page's colors.
 * Honest scope: it's a filter (like a basic Dark Reader), not per-rule
 * theming; images/videos are excluded from the inversion so they stay
 * natural. Sites can be added to an off-list where the filter never runs.
 */

export const DARK_MODE_KEY = "ok.darkMode";

export interface DarkModeState {
  enabled: boolean;
  offList: string[];
}

export const DEFAULT_DARK_MODE: DarkModeState = { enabled: false, offList: [] };

export function isDarkModeState(value: unknown): value is DarkModeState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.enabled === "boolean" &&
    Array.isArray(v.offList) &&
    v.offList.every((h) => typeof h === "string")
  );
}

export async function readDarkMode(storage: KvStorage): Promise<DarkModeState> {
  const raw = await storage.get(DARK_MODE_KEY);
  const value = raw[DARK_MODE_KEY];
  return isDarkModeState(value) ? value : { ...DEFAULT_DARK_MODE };
}

export async function saveDarkMode(storage: KvStorage, state: DarkModeState): Promise<void> {
  await storage.set({ [DARK_MODE_KEY]: state });
}

/** Is the hostname on the off-list (exact or subdomain)? */
export function hostnameOnOffList(offList: string[], hostname: string): boolean {
  const host = hostname.toLowerCase();
  return offList.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
}

/** Should the dark filter apply on this page? */
export async function shouldApplyDarkMode(
  storage: KvStorage,
  hostname: string
): Promise<boolean> {
  const state = await readDarkMode(storage);
  if (!state.enabled) return false;
  return !hostnameOnOffList(state.offList, hostname);
}

/** The CSS injected on a page when dark mode applies. */
export const DARK_MODE_CSS = `
html {
  filter: invert(0.9) hue-rotate(180deg) !important;
  background: #0f1115 !important;
}
html img,
html video,
html canvas,
html picture,
html svg,
html [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
`;

export function localStorageDarkMode(): KvStorage {
  return localStorageArea();
}
