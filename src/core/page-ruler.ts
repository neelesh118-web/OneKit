/**
 * Page ruler — measure any element on a page in pixels.
 *
 * A tiny overlay mode: click "Measure" and drag a box over the page; the
 * ruler shows width × height and the element under the cursor highlights.
 * The overlay itself lives in the content script; this module owns the
 * pure math (element lookup by point, dimension formatting) so it can be
 * tested without a DOM.
 */

export interface RulerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clamps a drag box to a viewport and normalizes negative drags. */
export function normalizeBox(raw: RulerBox, viewportWidth: number, viewportHeight: number): RulerBox {
  // Reverse drags (negative width/height) mean the user dragged up/left.
  const x1 = Math.max(0, Math.min(raw.x, viewportWidth));
  const y1 = Math.max(0, Math.min(raw.y, viewportHeight));
  const x2 = Math.max(0, Math.min(raw.x + raw.width, viewportWidth));
  const y2 = Math.max(0, Math.min(raw.y + raw.height, viewportHeight));
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, width: x2 - x1 < 0 ? x1 - x2 : x2 - x1, height: y2 - y1 < 0 ? y1 - y2 : y2 - y1 };
}

/** Formats a pixel dimension compactly (e.g. 1280 → "1,280px"). */
export function formatPx(value: number): string {
  return `${Math.round(value).toLocaleString()}px`;
}

/** Formats a box's size line: "960 × 540". */
export function sizeLabel(box: RulerBox): string {
  return `${formatPx(box.width)} × ${formatPx(box.height)}`;
}

/**
 * Finds the smallest element under a point that has a real bounding box.
 * Walked in reverse document order so the topmost (last-in-DOM) element
 * wins, which is what a user means by "the thing under my cursor".
 */
export function elementAtPoint(root: ParentNode, x: number, y: number): Element | null {
  const elements = Array.from(root.querySelectorAll<Element>("*"));
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return el;
  }
  return null;
}

export interface ElementMeasure {
  tag: string;
  /** Class + id hint, truncated — enough to identify the element. */
  label: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

/** Reads a measure for the element under a point (content-script side). */
export function measureElementAt(root: ParentNode, x: number, y: number): ElementMeasure | null {
  const el = elementAtPoint(root, x, y);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const id = el.id ? `#${el.id}` : "";
  const classes = typeof el.className === "string" ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : "";
  const label = `${el.tagName.toLowerCase()}${id}${classes}`.slice(0, 60);
  return { tag: el.tagName.toLowerCase(), label, width: rect.width, height: rect.height, x: rect.left, y: rect.top };
}
