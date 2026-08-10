// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canUseDocumentPip, canUseNativePip, pickVideoForPip } from "../src/core/video-pip";

function fakeVideo(over: Partial<{
  videoWidth: number;
  videoHeight: number;
  paused: boolean;
  readyState: number;
  width: number;
  height: number;
}> = {}) {
  return {
    videoWidth: over.videoWidth ?? 1280,
    videoHeight: over.videoHeight ?? 720,
    paused: over.paused ?? true,
    readyState: over.readyState ?? 4,
    getBoundingClientRect: () => ({ width: over.width ?? 800, height: over.height ?? 450 })
  };
}

describe("pickVideoForPip", () => {
  it("returns null when there are no playable videos", () => {
    expect(pickVideoForPip([])).toBeNull();
    expect(pickVideoForPip([fakeVideo({ readyState: 0 }), fakeVideo({ width: 0, height: 0 })])).toBeNull();
  });

  it("prefers a playing video over a paused larger one", () => {
    const pausedBig = fakeVideo({ paused: true, width: 1200, height: 700 });
    const playingSmall = fakeVideo({ paused: false, width: 300, height: 200 });
    expect(pickVideoForPip([pausedBig, playingSmall])).toBe(playingSmall);
  });

  it("picks the largest among equally-paused videos", () => {
    const small = fakeVideo({ width: 200, height: 100 });
    const big = fakeVideo({ width: 1000, height: 600 });
    expect(pickVideoForPip([small, big])).toBe(big);
  });

  it("ignores videos without frames", () => {
    const noFrames = fakeVideo({ readyState: 1, width: 1000, height: 600 });
    const ready = fakeVideo({ width: 100, height: 100 });
    expect(pickVideoForPip([noFrames, ready])).toBe(ready);
  });
});

describe("capability probes", () => {
  it("detects Document PiP and native PiP", () => {
    expect(canUseDocumentPip({ documentPictureInPicture: {} })).toBe(true);
    expect(canUseDocumentPip({})).toBe(false);
    expect(canUseNativePip({ requestPictureInPicture: () => undefined })).toBe(true);
    expect(canUseNativePip({})).toBe(false);
  });
});
