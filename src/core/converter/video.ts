/**
 * Video → GIF. The core takes any list of frames (injectable for tests
 * and alternate hosts); the browser glue decodes MP4/WebM/MOV with the
 * <video> element and captures frames at a fixed rate onto a canvas.
 * Everything stays on-device.
 */
import { encodeAnimatedGif, type PixelSource } from "./gif";
import { samplesToWav, wavToMp3 } from "./audio";

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

/* Video → MP3 (audio extraction) ------------------------------------- */

export interface VideoAudioDeps {
  /** Injectable OfflineAudioContext (defaults to the global one). */
  OfflineAudioContextCtor?: typeof OfflineAudioContext;
}

/**
 * Extracts a video's audio track as PCM. The video plays (with sound —
 * the Convert click is a user gesture, so autoplay is allowed) while an
 * OfflineAudioContext captures the audio. Everything stays on-device.
 */
async function captureVideoAudio(bytes: Uint8Array, deps: VideoAudioDeps): Promise<{
  sampleRate: number;
  channels: number;
  samples: Float32Array;
}> {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.createElement) {
    throw new Error("Video audio extraction needs a browser <video> element — not available here.");
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const video = doc.createElement("video");
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This browser couldn't decode the video."));
    });
    if (!(video.duration > 0)) throw new Error("The video has no playable duration.");
    const OfflineCtx =
      deps.OfflineAudioContextCtor ??
      (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    if (!OfflineCtx) throw new Error("Audio extraction isn't available in this browser.");
    const sampleRate = 44100;
    const ctx = new OfflineCtx(2, Math.max(1, Math.ceil(video.duration * sampleRate)), sampleRate);
    const source = (
      ctx as unknown as {
        createMediaElementSource(n: HTMLMediaElement): { connect(d: unknown): void };
      }
    ).createMediaElementSource(video);
    source.connect(ctx.destination);
    const ended = new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("Playback failed."));
    });
    await video.play();
    await ended;
    const buffer = await ctx.startRendering();
    const channels = buffer.numberOfChannels;
    const samples = new Float32Array(buffer.length * channels);
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < channels; c++) {
        samples[i * channels + c] = buffer.getChannelData(c)[i]!;
      }
    }
    return { sampleRate: buffer.sampleRate, channels, samples };
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
    video.load?.();
  }
}

/** Extracts a video's audio track and encodes it as MP3 (128 kbps). */
export async function videoToMp3(bytes: Uint8Array, deps: VideoAudioDeps = {}): Promise<Uint8Array> {
  const audio = await captureVideoAudio(bytes, deps);
  const wav = samplesToWav(audio.sampleRate, audio.channels, audio.samples);
  const mp3 = wavToMp3(wav);
  if (!mp3.ok) throw new Error(mp3.error);
  return mp3.value;
}

/** Extracts a video's audio track as a 16-bit WAV. */
export async function videoToWav(bytes: Uint8Array, deps: VideoAudioDeps = {}): Promise<Uint8Array> {
  const audio = await captureVideoAudio(bytes, deps);
  return samplesToWav(audio.sampleRate, audio.channels, audio.samples);
}

/* Video → image (frame grab) ----------------------------------------- */

/**
 * Grabs the first frame of a decodable video as a PNG or JPEG. Reuses the
 * browser frame extractor, then draws the captured pixels to a canvas.
 */
export async function videoToImage(
  bytes: Uint8Array,
  format: "png" | "jpeg",
  extract?: VideoFrameExtractor
): Promise<Uint8Array> {
  const frames = await (extract ?? extractFramesInBrowser)(bytes, { fps: 1, maxFrames: 1 });
  if (frames.length === 0) {
    throw new Error("Couldn't capture a frame from this video.");
  }
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.createElement) {
    throw new Error("Video frames need a browser canvas — not available here.");
  }
  const frame = frames[0]!;
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, frame.width);
  canvas.height = Math.max(1, frame.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas drawing isn't available in this browser.");
  const imageData = ctx.createImageData(frame.width, frame.height);
  imageData.data.set(frame.data);
  ctx.putImageData(imageData, 0, 0);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mime, 0.92);
  });
  if (!blob) throw new Error("This browser couldn't encode the video frame.");
  return new Uint8Array(await blob.arrayBuffer());
}

/* Video → WebM / MP4 (transcoding) ----------------------------------- */

export type VideoTarget = "video-webm" | "video-mp4";

export interface VideoToVideoDeps {
  /** Injectable captureStream (defaults to the <video>.captureStream()). */
  captureStream?: (video: HTMLVideoElement) => MediaStream;
  /** Injectable MediaRecorder constructor (defaults to the global one). */
  MediaRecorderCtor?: typeof MediaRecorder;
}

/**
 * Picks a MediaRecorder MIME type the browser can actually record to, or
 * null when the target container isn't supported on this platform. MP4
 * (H.264) recording is available on Chrome desktop.
 */
export function pickVideoMime(target: VideoTarget): string | null {
  const candidates =
    target === "video-mp4"
      ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=h264,aac", "video/mp4"]
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const MR = (globalThis as { MediaRecorder?: { isTypeSupported?(m: string): boolean } }).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") {
    return target === "video-webm" ? "video/webm" : null;
  }
  for (const c of candidates) {
    if (MR.isTypeSupported(c)) return c;
  }
  return null;
}

/**
 * Re-encodes a decodable video into WebM or MP4 by playing it through the
 * <video> element and recording its stream with MediaRecorder. Everything
 * stays on-device. Audio is carried when the source has an audio track.
 */
export async function videoToVideo(
  bytes: Uint8Array,
  target: VideoTarget,
  deps: VideoToVideoDeps = {}
): Promise<Uint8Array> {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.createElement) {
    throw new Error("Video transcoding needs a browser <video> element — not available here.");
  }
  const mime = pickVideoMime(target);
  if (!mime) {
    throw new Error(
      `This browser can't record ${target === "video-mp4" ? "MP4" : "WebM"} video right now — try a different target.`
    );
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const video = doc.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This browser couldn't decode the video."));
    });
    if (!(video.duration > 0)) throw new Error("The video has no playable duration.");

    const videoWithCapture = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    const capture =
      deps.captureStream ??
      (() => {
        if (typeof videoWithCapture.captureStream !== "function") {
          throw new Error("Video capture isn't supported in this browser.");
        }
        return videoWithCapture.captureStream();
      });
    const stream = capture(video);
    const RCtor = deps.MediaRecorderCtor ?? (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (!RCtor) throw new Error("MediaRecorder isn't available in this browser.");

    const recorder = new RCtor(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Recording failed."));
    });
    recorder.start(500);

    await new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("Playback failed."));
      void video.play().catch(reject);
    });
    recorder.stop();
    await stopped;

    if (chunks.length === 0) throw new Error("No video was recorded — the source may be empty.");
    return new Uint8Array(await new Blob(chunks, { type: recorder.mimeType || mime }).arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
    video.load?.();
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
