import { describe, expect, it } from "vitest";
import { planCaptureFrames, stitchedHeight } from "../src/core/fullpage-screenshot";

describe("planCaptureFrames", () => {
  it("plans scroll stops that cover the full scroll height", () => {
    const plan = planCaptureFrames(3000, 800);
    // step = 800 - 24 = 776; stops at 0, 776, 1552, 2328 → 4 frames.
    expect(plan.scrollY).toEqual([0, 776, 1552, 2328]);
    expect(plan.overlapFrames).toBe(true);
  });

  it("handles pages shorter than the viewport", () => {
    const plan = planCaptureFrames(400, 800);
    expect(plan.scrollY).toEqual([0]);
  });

  it("handles edge inputs without crashing", () => {
    expect(planCaptureFrames(0, 0).scrollY).toEqual([0]);
    expect(planCaptureFrames(-10, 800).scrollY).toEqual([0]);
  });

  it("computes the stitched canvas height", () => {
    // 4 frames of 800px viewport, 24px overlap → 4*776 + 24 = 3128.
    expect(stitchedHeight(4, 800, 24)).toBe(3128);
    expect(stitchedHeight(0, 800, 24)).toBe(0);
  });
});
