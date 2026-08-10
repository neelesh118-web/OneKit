/**
 * Mouse gestures — pure gesture recognition from a pointer path. The content
 * script tracks the path while the right mouse button is held and dragged;
 * this module classifies it into a small, conservative set of shapes. The
 * mapping from shape to action lives in the content script, so the module
 * stays browser-free and testable.
 */

export interface Point {
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

/**
 * Gestures we can recognize. "L" and "U" are the two-shape gestures (close
 * tab / reload); the four cardinals cover navigation and scrolling.
 */
export type GestureId = "none" | "up" | "down" | "left" | "right" | "L" | "U";

/** Minimum pixel movement before a segment counts as a direction. */
export const MIN_SEGMENT_PX = 12;

/** The primary direction between two points, or null below the threshold. */
export function directionBetween(a: Point, b: Point): Direction | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SEGMENT_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/**
 * Compresses a point path into a sequence of direction changes (jitter and
 * repeated same-direction movement collapse into one segment).
 */
export function directionSequence(points: Point[]): Direction[] {
  const out: Direction[] = [];
  let prev: Direction | null = null;
  for (let i = 1; i < points.length; i++) {
    const d = directionBetween(points[i - 1]!, points[i]!);
    if (!d) continue;
    if (d !== prev) {
      out.push(d);
      prev = d;
    }
  }
  return out;
}

/** Classifies a pointer path into a gesture id. */
export function recognizeGesture(points: Point[]): GestureId {
  const seq = directionSequence(points);
  if (seq.length === 0) return "none";
  if (seq.length === 1) return seq[0]!;
  if (seq.length === 2) {
    const [a, b] = seq as [Direction, Direction];
    // U shape (down then up) — reload.
    if (a === "down" && b === "up") return "U";
    // L shape (down then right) — close tab.
    if ((a === "down" && b === "right") || (a === "right" && b === "down")) return "L";
  }
  // Anything more complex is treated as no gesture — never risk a
  // mis-triggered action from a messy drag.
  return "none";
}

/** Total path length in px (used to ignore accidental clicks that wiggle). */
export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}
