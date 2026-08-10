import type { KvStorage } from "./storage-utils";

/**
 * Video speed controller — per-site playback speeds stored locally.
 * The content script applies the saved speed to every video on a site and
 * reacts to [ ] \ keyboard shortcuts; the popup shows a slider for the
 * current site.
 */

export const VIDEO_SPEED_STORAGE_KEY = "ok.videoSpeeds";
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 16;
export const DEFAULT_SPEED = 1;

/** Common rates the keyboard shortcuts cycle through. */
export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/** Normalizes a URL to a bare hostname (www. stripped) for per-site keys. */
export function normalizeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function readSiteSpeeds(storage: KvStorage): Promise<Record<string, number>> {
  const raw = await storage.get(VIDEO_SPEED_STORAGE_KEY);
  const value = raw[VIDEO_SPEED_STORAGE_KEY];
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [host, speed] of Object.entries(value as Record<string, unknown>)) {
    if (typeof speed === "number" && Number.isFinite(speed) && speed > 0) out[host] = speed;
  }
  return out;
}

export async function getSiteSpeed(storage: KvStorage, host: string): Promise<number> {
  if (!host) return DEFAULT_SPEED;
  const speeds = await readSiteSpeeds(storage);
  const speed = speeds[host];
  return typeof speed === "number" ? clampSpeed(speed) : DEFAULT_SPEED;
}

export async function setSiteSpeed(storage: KvStorage, host: string, speed: number): Promise<number> {
  if (!host) return DEFAULT_SPEED;
  const speeds = await readSiteSpeeds(storage);
  const clamped = clampSpeed(speed);
  speeds[host] = clamped;
  await storage.set({ [VIDEO_SPEED_STORAGE_KEY]: speeds });
  return clamped;
}

export async function clearSiteSpeed(storage: KvStorage, host: string): Promise<void> {
  const speeds = await readSiteSpeeds(storage);
  delete speeds[host];
  await storage.set({ [VIDEO_SPEED_STORAGE_KEY]: speeds });
}

/** Applies a speed to a video element (accepts a duck-typed video for tests). */
export function applySpeedToVideo(video: { playbackRate: number }, speed: number): number {
  const clamped = clampSpeed(speed);
  video.playbackRate = clamped;
  return clamped;
}

/**
 * Next rate in SPEED_STEPS from the current one, in the given direction.
 * Exact steps move one step; custom rates snap to the nearest step in the
 * direction: 1.3× + → 1.5×, 1.3× − → 1.25×.
 */
export function nextSpeed(current: number, direction: 1 | -1): number {
  const exact = SPEED_STEPS.indexOf(current);
  if (exact !== -1) {
    const next = SPEED_STEPS[exact + direction];
    if (next !== undefined) return next;
    return direction === 1 ? SPEED_STEPS[SPEED_STEPS.length - 1]! : SPEED_STEPS[0]!;
  }
  if (direction === 1) {
    for (const s of SPEED_STEPS) if (s > current) return s;
    return SPEED_STEPS[SPEED_STEPS.length - 1]!;
  }
  for (let i = SPEED_STEPS.length - 1; i >= 0; i--) {
    const s = SPEED_STEPS[i];
    if (s !== undefined && s < current) return s;
  }
  return SPEED_STEPS[0]!;
}

export function speedLabel(speed: number): string {
  const clamped = clampSpeed(speed);
  return Number.isInteger(clamped) ? `${clamped}×` : `${clamped.toFixed(2)}×`;
}
