import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
// Bundle the pdfjs worker as an asset so extraction runs off the popup's
// main thread in Chrome (Node/tests fall back to the main-thread handler).
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import { convertFile } from "../core/converter/convert";
import { detectFile, TYPE_LABELS } from "../core/converter/detect";
import { TARGET_LABELS, targetsFor } from "../core/converter/matrix";
import { decodeAudioInBrowser } from "../core/converter/audio";
import { initWoff2 } from "../core/converter/fonts";
import type { OneKitCapabilities } from "./capabilities";
// Bundle the WOFF2 wasm as an asset and initialize it once.
import woff2WasmUrl from "../core/converter/woff2.wasm?url";
void initWoff2(woff2WasmUrl);

/**
 * Convert tab — pick a file, choose an honest target, and convert it
 * 100% on-device. Nothing is uploaded; the output is saved to your
 * downloads.
 */
export function createConvertController(caps: OneKitCapabilities): () => void {
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
  };

  const fileInput = $<HTMLInputElement>("convert-file");
  const targetSelect = $<HTMLSelectElement>("convert-target");
  const convertBtn = $<HTMLButtonElement>("convert-btn");
  const sourceInfo = $("convert-source");
  const status = $("convert-status");

  let currentBytes: Uint8Array | null = null;
  let currentName = "";
  let currentMime = "";
  let currentTarget: string | null = null;

  const fmt = (bytes: number): string =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const setStatus = (text: string, isError = false): void => {
    status.textContent = text;
    status.classList.toggle("error", isError);
  };

  const resetSelect = (): void => {
    targetSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— choose a target —";
    targetSelect.appendChild(placeholder);
    currentTarget = null;
    convertBtn.disabled = true;
  };

  fileInput.addEventListener("change", () => {
    void (async () => {
      const file = fileInput.files?.[0];
      resetSelect();
      if (!file) {
        sourceInfo.textContent = "";
        currentBytes = null;
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      currentBytes = bytes;
      currentName = file.name;
      currentMime = file.type || "";
      const detected = detectFile(bytes, file.name, file.type);
      sourceInfo.textContent =
        detected.type === "unknown"
          ? `“${file.name}” — couldn't detect the format (${fmt(bytes.length)}).`
          : `“${file.name}” — ${TYPE_LABELS[detected.type]} (${fmt(bytes.length)})`;
      const targets = targetsFor(detected.type);
      if (targets.length === 0) {
        setStatus("This format can't be converted to anything else locally.");
        return;
      }
      for (const target of targets) {
        const option = document.createElement("option");
        option.value = target;
        option.textContent = TARGET_LABELS[target];
        targetSelect.appendChild(option);
      }
      setStatus("Pick a target, then convert. Everything happens on this device.");
    })().catch((err) => {
      setStatus(err instanceof Error ? err.message : String(err), true);
    });
  });

  targetSelect.addEventListener("change", () => {
    currentTarget = targetSelect.value || null;
    convertBtn.disabled = !currentTarget;
  });

  convertBtn.addEventListener("click", () => {
    void (async () => {
      if (!currentBytes || !currentTarget) return;
      const target = currentTarget as Parameters<typeof convertFile>[1];
      setStatus("Converting…");
      convertBtn.disabled = true;
      try {
        const result = await convertFile(
          { bytes: currentBytes, name: currentName, mime: currentMime },
          target,
          { audioDecoder: decodeAudioInBrowser }
        );
        caps.saveFile(result.bytes, result.name, result.mime);
        setStatus(`Saved ${result.name} (${fmt(result.bytes.length)}) to your downloads.`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err), true);
      } finally {
        convertBtn.disabled = !targetSelect.value;
      }
    })().catch((err) => {
      setStatus(err instanceof Error ? err.message : String(err), true);
    });
  });

  return () => {};
}
