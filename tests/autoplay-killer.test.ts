import { describe, expect, it } from "vitest";
import { isMediaElement, shouldPauseMedia } from "../src/core/autoplay-killer";

describe("autoplay-killer", () => {
  it("recognizes video/audio elements", () => {
    const video = document.createElement("video");
    const audio = document.createElement("audio");
    const div = document.createElement("div");
    expect(isMediaElement(video)).toBe(true);
    expect(isMediaElement(audio)).toBe(true);
    expect(isMediaElement(div)).toBe(false);
    expect(isMediaElement(null)).toBe(false);
  });

  it("pauses playing media that started without a user gesture", () => {
    const video = document.createElement("video");
    // jsdom media elements report paused = true by default; simulate playing.
    Object.defineProperty(video, "paused", { value: false, configurable: true });
    Object.defineProperty(video, "ended", { value: false, configurable: true });
    expect(shouldPauseMedia(video, false)).toBe(true);
    expect(shouldPauseMedia(video, true)).toBe(false);
  });

  it("does not pause paused or ended media", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "paused", { value: false, configurable: true });
    Object.defineProperty(video, "ended", { value: true, configurable: true });
    expect(shouldPauseMedia(video, false)).toBe(false);
  });
});
