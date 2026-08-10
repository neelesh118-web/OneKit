import { describe, expect, it } from "vitest";
import {
  formatPx,
  normalizeBox,
  sizeLabel
} from "../src/core/page-ruler";

describe("page ruler", () => {
  it("normalizes drag boxes to the viewport", () => {
    const box = normalizeBox({ x: -10, y: 5, width: 2000, height: 100 }, 1280, 800);
    expect(box.x).toBe(0);
    expect(box.width).toBe(1280);
    expect(box.y).toBe(5);
    expect(box.height).toBe(100);
  });

  it("handles reverse drags (negative width)", () => {
    const box = normalizeBox({ x: 500, y: 100, width: -200, height: -50 }, 1280, 800);
    expect(box.width).toBe(200);
    expect(box.height).toBe(50);
  });

  it("formats pixels and size labels", () => {
    expect(formatPx(960)).toBe("960px");
    expect(formatPx(1234.4)).toBe("1,234px");
    expect(sizeLabel({ x: 0, y: 0, width: 960, height: 540 })).toBe("960px × 540px");
  });
});
