/**
 * Full-page screenshot — scroll-capture math. The content script scrolls
 * the page viewport by viewport while the background captures each visible
 * shot (captureVisibleTab); this module plans the scroll stops and stitches
 * the captured frames into one canvas image.
 */

export interface CapturePlan {
  /** Scroll Y for each capture frame. */
  scrollY: number[];
  /** True when a sticky header is likely (we can't detect it reliably). */
  overlapFrames: boolean;
}

/**
 * Plans scroll positions for a full-page capture. viewportH is the visible
 * height; scrollH the total scrollable height. Overlap of a few pixels per
 * frame reduces seams but can duplicate sticky headers — callers may merge
 * or slice as they prefer.
 */
export function planCaptureFrames(
  scrollHeight: number,
  viewportHeight: number,
  overlapPx = 24
): CapturePlan {
  const vh = Math.max(1, Math.round(viewportHeight));
  const total = Math.max(0, Math.round(scrollHeight));
  const step = Math.max(1, vh - overlapPx);
  const scrollY: number[] = [];
  let y = 0;
  while (y < total) {
    scrollY.push(y);
    y += step;
  }
  if (scrollY.length === 0) scrollY.push(0);
  return { scrollY, overlapFrames: overlapPx > 0 };
}

/** Canvas height for the stitched result (drop the overlap rows). */
export function stitchedHeight(frames: number, viewportHeight: number, overlapPx: number): number {
  if (frames <= 0) return 0;
  return frames * Math.max(1, viewportHeight - overlapPx) + overlapPx;
}

/** Downloads a data URL via an anchor (popup/extension pages only). */
export function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
