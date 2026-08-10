/**
 * Floating video (Picture-in-Picture) — picks the best video on a page and
 * opens it in Chrome's Document Picture-in-Picture window. The selection
 * logic is pure and testable; the browser glue lives in the content script.
 */

export interface VideoLike {
  videoWidth: number;
  videoHeight: number;
  paused: boolean;
  readyState: number;
  getBoundingClientRect(): { width: number; height: number };
}

/**
 * Chooses the video most worth floating: visible and playing wins, then
 * the largest. Requires the video to have actual frames (readyState ≥ 2).
 * Generic so callers get their concrete element type back.
 */
export function pickVideoForPip<T extends VideoLike>(videos: T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const video of videos) {
    if (video.readyState < 2) continue; // HAVE_CURRENT_DATA
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (!Number.isFinite(area) || area <= 0) continue;
    const playing = !video.paused;
    const score = (playing ? 1e9 : 0) + area;
    if (score > bestScore) {
      bestScore = score;
      best = video;
    }
  }
  return best;
}

export function canUseDocumentPip(win: { documentPictureInPicture?: unknown }): boolean {
  return typeof win.documentPictureInPicture !== "undefined";
}

export function canUseNativePip(video: { requestPictureInPicture?: () => unknown }): boolean {
  return typeof video.requestPictureInPicture === "function";
}

export interface PipResult {
  ok: boolean;
  reason?: "no-video" | "unsupported" | "rejected" | "closed";
}
