/**
 * Video → GIF. The core takes any list of frames (injectable for tests
 * and alternate hosts); the browser glue decodes MP4/WebM/MOV with the
 * <video> element and captures frames at a fixed rate onto a canvas.
 * Everything stays on-device.
 */
import { encodeAnimatedGif, type PixelSource } from "./gif";

export interface VideoFrame extends PixelSource {
  /** How long this frame stays on screen, in milliseconds. */
  delayMs: number;
}

export type VideoFrameExtractor = (bytes: Uint8Array) => Promise<VideoFrame[]>;

/** Converts any decodable video to an animated GIF. */
export async function videoToGif(
  bytes: Uint8Array,
  extract?: VideoFrameExtractor
): Promise<Uint8Array> {
  const frames = await (extract ?? extractFramesInBrowser)(bytes);
  if (frames.length === 0) {
    throw new Error("Couldn't capture any frames from this video.");
  }
  return encodeAnimatedGif(frames.map((f) => ({ pixels: f, delayMs: f.delayMs })));
}

/** Playback length (ms) a GIF would show for `frames` at their delays. */
export function gifPlaybackMs(frames: VideoFrame[]): number {
  return frames.reduce((n, f) => n + f.delayMs, 0);
}

/**
 * Browser frame extractor: plays the video through the <video> element
 * and captures frames at `fps`. Long videos are capped at `maxFrames`
 * so the GIF stays reasonable; the honest result keeps the first
 * `maxFrames` seconds of motion.
 */
export async function extractFramesInBrowser(
  bytes: Uint8Array,
  opts: { fps?: number; maxFrames?: number } = {}
): Promise<VideoFrame[]> {
  const fps = Math.min(30, Math.max(1, opts.fps ?? 10));
  const maxFrames = Math.min(300, Math.max(1, opts.maxFrames ?? 240));
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.createElement) {
    throw new Error("Video decoding needs a browser <video> element — not available here.");
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const video = doc.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This browser couldn't decode the video."));
    });
    await loaded;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) throw new Error("The video has no playable duration.");
    const interval = 1000 / fps;
    const count = Math.min(maxFrames, Math.max(1, Math.ceil((duration * 1000) / interval)));
    const step = duration / count;
    const frames: VideoFrame[] = [];
    const canvas = doc.createElement("canvas");
    for (let i = 0; i < count; i++) {
      const t = Math.min(duration - 0.001, i * step);
      await seekTo(video, t);
      canvas.width = Math.max(1, Math.round(video.videoWidth / 2));
      canvas.height = Math.max(1, Math.round(video.videoHeight / 2));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas drawing isn't available in this browser.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        width: canvas.width,
        height: canvas.height,
        delayMs: Math.round(interval),
        data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
      });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
  }
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out seeking the video.")), 10_000);
    const onSeeked = (): void => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = time;
    } catch {
      clearTimeout(timer);
      reject(new Error("Couldn't seek the video."));
    }
  });
}
