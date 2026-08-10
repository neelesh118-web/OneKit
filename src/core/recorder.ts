/**
 * Tab recorder — records the current tab (video + audio) to a WebM blob
 * entirely on-device. The state machine is pure and testable; the popup
 * supplies a chrome.tabCapture stream and a MediaRecorder factory.
 */

export type RecorderPhase = "idle" | "starting" | "recording" | "stopping" | "done" | "error";

export interface MediaRecorderLike {
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror?: ((event: unknown) => void) | null;
  state: string;
}

export interface RecorderDeps {
  createRecorder(stream: MediaStreamLike, mime: string): MediaRecorderLike;
  now(): number;
}

export type MediaStreamLike = object;

/** Picks the best supported WebM codec string, defaulting to a safe fallback. */
export function recorderMimeType(supported: readonly string[]): string {
  const preferred = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of preferred) {
    if (supported.includes(mime)) return mime;
  }
  return "video/webm";
}

export function secondsLabel(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** onekit-recording-2026-08-10_23-45-12.webm */
export function recordingFileName(now: number): string {
  const d = new Date(now);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `onekit-recording-${date}_${time}.webm`;
}

export class TabRecorder {
  private deps: RecorderDeps;
  private recorder: MediaRecorderLike | null = null;
  private chunks: Blob[] = [];
  private startedAt: number | null = null;
  private phase: RecorderPhase = "idle";
  private stopResolve: ((blob: Blob) => void) | null = null;
  private lastError: string | null = null;

  constructor(deps: RecorderDeps) {
    this.deps = deps;
  }

  get currentPhase(): RecorderPhase {
    return this.phase;
  }

  get errorMessage(): string | null {
    return this.lastError;
  }

  get elapsedSeconds(): number {
    if (this.startedAt === null) return 0;
    return Math.floor((this.deps.now() - this.startedAt) / 1000);
  }

  get recording(): boolean {
    return this.phase === "recording" || this.phase === "starting";
  }

  /** Begins recording from a stream. Throws if already recording. */
  start(stream: MediaStreamLike, mime: string): void {
    if (this.recording) throw new Error("Already recording.");
    this.phase = "starting";
    this.chunks = [];
    this.lastError = null;
    this.recorder = this.deps.createRecorder(stream, mime);
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onerror = () => {
      this.lastError = "Recording failed — the tab stream ended.";
      this.phase = "error";
      this.stopResolve?.({ type: "video/webm", size: 0 } as Blob);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mime });
      this.phase = "done";
      this.stopResolve?.(blob);
    };
    this.startedAt = this.deps.now();
    this.recorder.start(1000);
    this.phase = "recording";
  }

  /** Stops and returns the captured blob (what was recorded so far). */
  stop(): Promise<Blob> {
    if (this.phase === "done") return Promise.resolve(new Blob(this.chunks));
    if (this.phase !== "recording" && this.phase !== "starting") {
      return Promise.resolve(new Blob([], { type: "video/webm" }));
    }
    this.phase = "stopping";
    return new Promise<Blob>((resolve) => {
      this.stopResolve = resolve;
      this.recorder?.stop();
    });
  }

  reset(): void {
    this.phase = "idle";
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.lastError = null;
  }
}
