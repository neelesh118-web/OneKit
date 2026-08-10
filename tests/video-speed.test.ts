// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applySpeedToVideo,
  clampSpeed,
  clearSiteSpeed,
  DEFAULT_SPEED,
  getSiteSpeed,
  MAX_SPEED,
  MIN_SPEED,
  nextSpeed,
  normalizeHost,
  setSiteSpeed,
  speedLabel,
  SPEED_STEPS,
  VIDEO_SPEED_STORAGE_KEY
} from "../src/core/video-speed";
import { createMemoryStorage } from "../src/core/storage-utils";

describe("clampSpeed", () => {
  it("clamps to the allowed range", () => {
    expect(clampSpeed(0.01)).toBe(MIN_SPEED);
    expect(clampSpeed(100)).toBe(MAX_SPEED);
    expect(clampSpeed(1.5)).toBe(1.5);
  });
  it("falls back to 1× for garbage input", () => {
    expect(clampSpeed(NaN)).toBe(DEFAULT_SPEED);
    expect(clampSpeed(Infinity)).toBe(DEFAULT_SPEED);
    expect(clampSpeed(-5)).toBe(MIN_SPEED);
  });
});

describe("normalizeHost", () => {
  it("strips protocol and www", () => {
    expect(normalizeHost("https://www.youtube.com/watch?v=x")).toBe("youtube.com");
    expect(normalizeHost("http://sub.example.co.uk/")).toBe("sub.example.co.uk");
  });
  it("returns empty for garbage", () => {
    expect(normalizeHost("not a url")).toBe("");
  });
});

describe("nextSpeed", () => {
  it("cycles forward through the steps", () => {
    expect(nextSpeed(1, 1)).toBe(1.25);
    expect(nextSpeed(1.5, 1)).toBe(1.75);
  });
  it("cycles backward", () => {
    expect(nextSpeed(1, -1)).toBe(0.75);
    expect(nextSpeed(0.5, -1)).toBe(0.25);
  });
  it("wraps at the ends", () => {
    expect(nextSpeed(4, 1)).toBe(4);
    expect(nextSpeed(0.25, -1)).toBe(0.25);
  });
  it("snaps custom rates to the next step", () => {
    expect(nextSpeed(1.3, 1)).toBe(1.5);
    expect(nextSpeed(1.3, -1)).toBe(1.25);
  });
});

describe("applySpeedToVideo", () => {
  it("sets playbackRate on a duck-typed video", () => {
    const video = { playbackRate: 1 };
    expect(applySpeedToVideo(video, 2)).toBe(2);
    expect(video.playbackRate).toBe(2);
  });
  it("clamps impossible rates", () => {
    const video = { playbackRate: 1 };
    applySpeedToVideo(video, 50);
    expect(video.playbackRate).toBe(MAX_SPEED);
  });
});

describe("speed store", () => {
  it("defaults to 1× when nothing is stored", async () => {
    const store = createMemoryStorage();
    expect(await getSiteSpeed(store, "youtube.com")).toBe(DEFAULT_SPEED);
    expect(await getSiteSpeed(store, "")).toBe(DEFAULT_SPEED);
  });

  it("stores, reads and clears per-site speeds", async () => {
    const store = createMemoryStorage();
    expect(await setSiteSpeed(store, "youtube.com", 1.75)).toBe(1.75);
    expect(await getSiteSpeed(store, "youtube.com")).toBe(1.75);
    // Other sites unaffected
    expect(await getSiteSpeed(store, "twitch.tv")).toBe(DEFAULT_SPEED);
    await clearSiteSpeed(store, "youtube.com");
    expect(await getSiteSpeed(store, "youtube.com")).toBe(DEFAULT_SPEED);
  });

  it("ignores corrupt stored entries", async () => {
    const store = createMemoryStorage({ [VIDEO_SPEED_STORAGE_KEY]: { "youtube.com": "fast", "vimeo.com": 2 } });
    expect(await getSiteSpeed(store, "youtube.com")).toBe(DEFAULT_SPEED);
    expect(await getSiteSpeed(store, "vimeo.com")).toBe(2);
  });
});

describe("speedLabel", () => {
  it("renders clean labels", () => {
    expect(speedLabel(1)).toBe("1×");
    expect(speedLabel(1.5)).toBe("1.50×");
    expect(speedLabel(2)).toBe("2×");
    expect(speedLabel(0.25)).toBe("0.25×");
  });
});

describe("SPEED_STEPS sanity", () => {
  it("starts at the minimum and ends at a sane max", () => {
    expect(SPEED_STEPS[0]).toBe(0.25);
    expect(SPEED_STEPS[SPEED_STEPS.length - 1]).toBe(4);
    expect(SPEED_STEPS).toContain(1);
  });
});
