/**
 * OCR — image/screenshot → text, 100% local via tesseract.js (WASM core +
 * bundled English traineddata, no network). The heavy engine is imported
 * lazily; the pure helpers below are unit-tested.
 */

export function sanitizeOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && i < arr.length - 1))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeOcrLines(text: string): string[] {
  return sanitizeOcrText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function ocrErrorText(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (/worker|wasm|traineddata|network/i.test(msg)) {
      return "OCR couldn't start — the offline engine files are missing from this install.";
    }
    return `OCR failed: ${msg}`;
  }
  return "OCR failed — try a clearer image.";
}

/** Reads a picked file as a data URL (browser glue, used by the controller). */
export function imageDataUrlFromFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read that image file."));
    reader.readAsDataURL(file);
  });
}

/** Downscales an image data URL to at most maxDim on its longest side (browser glue). */
export async function downscaleImageDataUrl(dataUrl: string, maxDim = 1600): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("That image could not be decoded."));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available here.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

/**
 * Runs OCR on an image data URL using the bundled tesseract.js engine.
 * workerPath / corePath / langPath resolve to files copied into public/ by
 * scripts/copy-ocr-assets.mjs, so nothing touches the network.
 */
export async function ocrImageDataUrl(dataUrl: string, getUrl: (path: string) => string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: getUrl("tesseract/worker.min.js"),
    corePath: getUrl("tesseract/tesseract-core-lstm.wasm.js"),
    langPath: getUrl("tesseract/"),
    workerBlobURL: false,
    logger: () => {
      /* progress is silent in v1 */
    }
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return sanitizeOcrText(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}
