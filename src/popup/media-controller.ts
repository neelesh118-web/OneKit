import { recorderMimeType, recordingFileName, secondsLabel, TabRecorder, type MediaRecorderLike } from "../core/recorder";
import { speedLabel } from "../core/video-speed";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Tools tab — the media tools: video speed controller (per-site),
 * tab recorder (tabCapture + MediaRecorder → WebM), floating video (PiP),
 * and OCR (image / screenshot → text, fully offline).
 */
export function createMediaController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* Video speed ------------------------------------------------------- */
  const vsHost = $("vs-host");
  const vsSlider = $("vs-slider") as HTMLInputElement;
  const vsValue = $("vs-value");
  const vsApply = $("vs-apply") as HTMLButtonElement;
  const vsReset = $("vs-reset") as HTMLButtonElement;

  async function refreshVideoSpeed(): Promise<void> {
    const res = await caps.videoSpeedGet();
    vsHost.textContent = res.host || "this page";
    vsSlider.value = String(res.speed);
    vsValue.textContent = speedLabel(res.speed);
  }

  vsSlider.addEventListener("input", () => {
    vsValue.textContent = speedLabel(Number(vsSlider.value));
  });
  vsApply.addEventListener("click", () => {
    void (async () => {
      const applied = await caps.videoSpeedSet(Number(vsSlider.value));
      vsValue.textContent = speedLabel(applied);
    })();
  });
  vsReset.addEventListener("click", () => {
    void (async () => {
      const speed = await caps.videoSpeedReset();
      vsSlider.value = String(speed);
      vsValue.textContent = speedLabel(speed);
    })();
  });
  void refreshVideoSpeed();

  /* Tab recorder ------------------------------------------------------ */
  const recBtn = $("rec-toggle") as HTMLButtonElement;
  const recStatus = $("rec-status");
  let recorder: TabRecorder | null = null;
  let recTimer: number | undefined;

  function updateRecUi(): void {
    if (recorder?.recording) {
      recBtn.textContent = "⏹ Stop recording";
      recBtn.classList.add("danger");
      recStatus.textContent = `● REC ${secondsLabel(recorder.elapsedSeconds * 1000)} — keep the popup open`;
    } else {
      recBtn.textContent = "⏺ Record this tab";
      recBtn.classList.remove("danger");
    }
  }

  async function stopAndSave(): Promise<void> {
    if (!recorder) return;
    const rec = recorder;
    const error = rec.errorMessage;
    const blob = await rec.stop();
    recorder = null;
    if (recTimer !== undefined) window.clearInterval(recTimer);
    recTimer = undefined;
    if (blob.size > 0) {
      caps.saveBlob(blob, recordingFileName(caps.now()));
      recStatus.textContent = "Saved to Downloads.";
    } else {
      recStatus.textContent = error ?? "Nothing was captured — the tab may not allow recording.";
    }
    updateRecUi();
  }

  async function onRecToggle(): Promise<void> {
    if (recorder?.recording) {
      await stopAndSave();
      return;
    }
    try {
      const stream = await caps.captureTabStream();
      const mime =
        typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
          ? recorderMimeType(
              ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"].filter(
                (m) => MediaRecorder.isTypeSupported(m)
              )
            )
          : "video/webm";
      recorder = new TabRecorder({
        // The real MediaRecorder is structurally compatible; the cast only
        // bridges lib.dom's BlobEvent typing to the core's minimal shape.
        createRecorder: (s, m) => new MediaRecorder(s as MediaStream, { mimeType: m }) as unknown as MediaRecorderLike,
        now: caps.now
      });
      recorder.start(stream, mime);
      recTimer = window.setInterval(updateRecUi, 1000);
      recStatus.textContent = "Starting…";
      updateRecUi();
    } catch (err) {
      recStatus.textContent =
        err instanceof Error ? `Could not start recording: ${err.message}` : "Could not start recording.";
    }
  }

  recBtn.addEventListener("click", () => void onRecToggle());
  // Closing the popup mid-recording saves what was captured so far.
  window.addEventListener("pagehide", () => {
    if (recorder?.recording) {
      void recorder.stop().then((blob) => {
        if (blob.size > 0) caps.saveBlob(blob, recordingFileName(caps.now()));
      });
    }
  });

  /* Floating video (PiP) ---------------------------------------------- */
  const pipBtn = $("pip-btn") as HTMLButtonElement;
  const pipStatus = $("pip-status");
  pipBtn.addEventListener("click", () => {
    void (async () => {
      const result = await caps.openVideoPip();
      if (result.ok) {
        pipStatus.textContent = "Video floated — close the small window to bring it back.";
      } else if (result.reason === "no-video") {
        pipStatus.textContent = "No playable video on this page.";
      } else if (result.reason === "unsupported") {
        pipStatus.textContent = "This browser doesn't support floating video.";
      } else {
        pipStatus.textContent = "Floating was cancelled or blocked.";
      }
    })();
  });

  /* OCR --------------------------------------------------------------- */
  const ocrFile = $("ocr-file") as HTMLInputElement;
  const ocrTab = $("ocr-tab") as HTMLButtonElement;
  const ocrStatus = $("ocr-status");
  const ocrOutput = $("ocr-output") as HTMLTextAreaElement;
  const ocrCopy = $("ocr-copy") as HTMLButtonElement;
  const ocrSave = $("ocr-save") as HTMLButtonElement;
  let ocrResult = "";

  async function runOcr(dataUrl: string): Promise<void> {
    ocrStatus.textContent = "Reading text… (the first run loads the offline engine)";
    try {
      ocrResult = await caps.ocrImage(dataUrl);
      ocrOutput.value = ocrResult;
      ocrStatus.textContent = ocrResult
        ? `Done — ${ocrResult.length.toLocaleString()} characters.`
        : "No text found — try a clearer image.";
    } catch (err) {
      ocrStatus.textContent = err instanceof Error ? err.message : "OCR failed.";
    }
  }

  ocrFile.addEventListener("change", () => {
    void (async () => {
      const file = ocrFile.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await caps.fileToDataUrl(file);
        await runOcr(dataUrl);
      } catch (err) {
        ocrStatus.textContent = err instanceof Error ? err.message : "Could not read that image.";
      }
    })();
  });
  ocrTab.addEventListener("click", () => {
    void (async () => {
      const shot = await caps.captureVisibleTab();
      if (!shot) {
        ocrStatus.textContent = "Could not capture the tab.";
        return;
      }
      await runOcr(shot);
    })();
  });
  ocrCopy.addEventListener("click", () => {
    void caps.copyText(ocrOutput.value).then(() => {
      ocrStatus.textContent = "Copied.";
    });
  });
  ocrSave.addEventListener("click", () => {
    if (ocrResult) caps.downloadText(ocrResult, "onekit-ocr.txt");
  });

  return () => {
    if (recTimer !== undefined) window.clearInterval(recTimer);
  };
}
