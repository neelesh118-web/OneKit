import { describe, expect, it } from "vitest";
import {
  presetById,
  presetContaining,
  VIEWPORT_PRESETS,
  windowSizeForPreset
} from "../src/core/window-resizer";

describe("window resizer", () => {
  it("has all device categories in presets", () => {
    const devices = new Set(VIEWPORT_PRESETS.map((p) => p.device));
    expect(devices.has("desktop")).toBe(true);
    expect(devices.has("tablet")).toBe(true);
    expect(devices.has("phone")).toBe(true);
  });

  it("resolves presets by id", () => {
    expect(presetById("ipad")?.label).toBe("iPad");
    expect(presetById("nope")).toBeUndefined();
  });

  it("adds window chrome to preset sizes", () => {
    const req = windowSizeForPreset(presetById("mobile-m")!);
    expect(req.width).toBeGreaterThan(390);
    expect(req.height).toBeGreaterThan(844);
    expect(req.presetId).toBe("mobile-m");
  });

  it("finds the smallest preset containing a viewport", () => {
    expect(presetContaining(1280, 720)?.id).toBe("small-laptop");
    expect(presetContaining(400, 900)?.id).toBe("mobile-l");
    expect(presetContaining(99999, 99999)).toBeNull();
  });
});
