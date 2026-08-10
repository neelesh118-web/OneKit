// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recorderMimeType, recordingFileName, secondsLabel, TabRecorder } from "../src/core/recorder";

function fakeMediaRecorder() {
  const events: string[] = [];
  let started = false;
  return {
    events,
    recorder: {
      state: "inactive",
      start() {
        started = true;
        events.push("start");
      },
      stop() {
        events.push("stop");
        this.onstop?.();
      },
      emitData(data: Blob) {
        this.ondataavailable?.({ data });
      },
      ondataavailable: null as ((e: { data: Blob }) => void) | null,
      onstop: null as (() => void) | null,
      onerror: null as ((e: unknown) => void) | null
    }
  };
}

function deps() {
  const created: Array<ReturnType<typeof fakeMediaRecorder>> = [];
  let clock = 1_000_000;
  return {
    created,
    deps: {
      now: () => clock,
      advance(ms: number) {
        clock += ms;
      },
      createRecorder(_stream: object, mime: string) {
        const f = fakeMediaRecorder();
        (f.recorder as { mime?: string }).mime = mime;
        created.push(f);
        return f.recorder;
      }
    }
  };
}

describe("recorderMimeType", () => {
  it("prefers vp9+opus then falls back", () => {
    expect(recorderMimeType(["video/webm;codecs=vp9,opus", "video/webm"])).toBe("video/webm;codecs=vp9,opus");
    expect(recorderMimeType(["video/webm;codecs=vp8"])).toBe("video/webm;codecs=vp8");
    expect(recorderMimeType([])).toBe("video/webm");
  });
});

describe("secondsLabel", () => {
  it("formats mm:ss", () => {
    expect(secondsLabel(0)).toBe("00:00");
    expect(secondsLabel(59_999)).toBe("00:59");
    expect(secondsLabel(61_000)).toBe("01:01");
    expect(secondsLabel(3_661_000)).toBe("61:01");
    expect(secondsLabel(-5)).toBe("00:00");
  });
});

describe("recordingFileName", () => {
  it("is dated and webm", () => {
    const name = recordingFileName(new Date(2026, 7, 10, 23, 45, 12).getTime());
    expect(name).toBe("onekit-recording-2026-08-10_23-45-12.webm");
  });
});

describe("TabRecorder", () => {
  it("records chunks into a blob and stops cleanly", async () => {
    const { deps: d, created } = deps();
    const rec = new TabRecorder(d);
    rec.start({}, "video/webm");
    expect(rec.currentPhase).toBe("recording");
    expect(rec.recording).toBe(true);

    created[0]!.recorder.emitData(new Blob(["part1"], { type: "video/webm" }));
    d.advance(2000);
    created[0]!.recorder.emitData(new Blob(["part2"], { type: "video/webm" }));
    expect(rec.elapsedSeconds).toBe(2);

    const blob = await rec.stop();
    expect(rec.currentPhase).toBe("done");
    expect(created[0]!.events).toContain("stop");
    const text = await blob.text();
    expect(text).toBe("part1part2");
    expect(blob.type).toBe("video/webm");
  });

  it("rejects a second start while recording", () => {
    const { deps: d } = deps();
    const rec = new TabRecorder(d);
    rec.start({}, "video/webm");
    expect(() => rec.start({}, "video/webm")).toThrow(/Already recording/);
  });

  it("stop before start resolves an empty blob", async () => {
    const { deps: d } = deps();
    const rec = new TabRecorder(d);
    const blob = await rec.stop();
    expect(blob.size).toBe(0);
    expect(rec.currentPhase).toBe("idle");
  });

  it("survives an error event and reports it", async () => {
    const { deps: d, created } = deps();
    const rec = new TabRecorder(d);
    rec.start({}, "video/webm");
    const stopPromise = rec.stop();
    created[0]!.recorder.onerror?.({});
    const blob = await stopPromise;
    expect(rec.currentPhase).toBe("error");
    expect(rec.errorMessage).toContain("Recording failed");
    expect(blob.size).toBe(0);
  });

  it("reset returns to idle", () => {
    const { deps: d } = deps();
    const rec = new TabRecorder(d);
    rec.start({}, "video/webm");
    rec.reset();
    expect(rec.currentPhase).toBe("idle");
    expect(rec.recording).toBe(false);
    expect(rec.elapsedSeconds).toBe(0);
  });
});
