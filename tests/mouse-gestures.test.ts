import { describe, expect, it } from "vitest";
import {
  directionBetween,
  directionSequence,
  pathLength,
  recognizeGesture,
  type Point
} from "../src/core/mouse-gestures";

const p = (x: number, y: number): Point => ({ x, y });

/** Builds a point path for a gesture: e.g. "down" then "right". */
function path(...segments: Array<[number, number]>): Point[] {
  const pts: Point[] = [{ x: 100, y: 100 }];
  for (const [dx, dy] of segments) {
    pts.push({ x: pts[pts.length - 1]!.x + dx, y: pts[pts.length - 1]!.y + dy });
  }
  return pts;
}

describe("directionBetween", () => {
  it("returns null below the threshold and cardinals above it", () => {
    expect(directionBetween(p(0, 0), p(5, 5))).toBeNull();
    expect(directionBetween(p(0, 0), p(50, 0))).toBe("right");
    expect(directionBetween(p(0, 0), p(-50, 0))).toBe("left");
    expect(directionBetween(p(0, 0), p(0, 50))).toBe("down");
    expect(directionBetween(p(0, 0), p(0, -50))).toBe("up");
  });
});

describe("directionSequence", () => {
  it("collapses repeated directions and jitter", () => {
    // Down 50, down 30, then right 40 → [down, right]
    const seq = directionSequence([
      p(0, 0),
      p(0, 50),
      p(3, 80),
      p(40, 82)
    ]);
    expect(seq).toEqual(["down", "right"]);
  });
});

describe("recognizeGesture", () => {
  it("recognizes the four cardinals", () => {
    expect(recognizeGesture(path([0, 60]))).toBe("down");
    expect(recognizeGesture(path([0, -60]))).toBe("up");
    expect(recognizeGesture(path([60, 0]))).toBe("right");
    expect(recognizeGesture(path([-60, 0]))).toBe("left");
  });

  it("recognizes L (close tab) and U (reload) shapes", () => {
    expect(recognizeGesture(path([0, 60], [50, 0]))).toBe("L");
    expect(recognizeGesture(path([60, 0], [0, 60]))).toBe("L");
    expect(recognizeGesture(path([0, 60], [0, -60]))).toBe("U");
  });

  it("returns none for no movement, wiggles, and complex paths", () => {
    expect(recognizeGesture([p(0, 0)])).toBe("none");
    expect(recognizeGesture(path([8, 8]))).toBe("none");
    // A zigzag with three directions is too messy to trust.
    expect(recognizeGesture(path([0, 60], [60, 0], [0, -60]))).toBe("none");
  });

  it("pathLength measures total distance", () => {
    expect(pathLength([p(0, 0), p(30, 40)])).toBeCloseTo(50);
    expect(pathLength([p(0, 0)])).toBe(0);
  });
});
