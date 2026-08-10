/**
 * Reading-line overlay — a horizontal line that follows your cursor while
 * you read, so your eye never loses its place. Pure style helpers; the
 * overlay itself lives in the content script.
 */

export interface ReadingLineOptions {
  /** Line thickness in px (1–8). */
  thickness?: number;
  /** Accent color (CSS). */
  color?: string;
}

export function normalizeThickness(raw: number): number {
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.min(8, Math.round(raw)));
}

/** CSS for the overlay element. */
export function readingLineCss(options: ReadingLineOptions = {}): string {
  const thickness = normalizeThickness(options.thickness ?? 2);
  const color = options.color ?? "#f59e0b";
  return [
    "position:fixed",
    "left:0",
    "right:0",
    "height:" + thickness + "px",
    "background:" + color,
    "opacity:.65",
    "pointer-events:none",
    "z-index:2147483645",
    "transition:transform .05s linear"
  ].join(";");
}
