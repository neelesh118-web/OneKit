import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
// Bundle the pdfjs worker as an asset so extraction runs off the popup's
// main thread in Chrome (Node/tests fall back to the main-thread handler).
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import { convertFile } from "../core/converter/convert";
import { detectFile, TYPE_LABELS, type FileType } from "../core/converter/detect";
import { TARGET_LABELS, targetsFor, type TargetFormat } from "../core/converter/matrix";
import { decodeAudioInBrowser } from "../core/converter/audio";
import { initWoff2 } from "../core/converter/fonts";
import { planBatch, type BatchFile } from "../core/converter/batch";
import { convertBatchToZip } from "../core/converter/batch-zip";
import { sanitizeFolder } from "../core/converter/output-folder";
import { imagesToAnimatedGif, splitGifToImages } from "../core/converter/gif";
import { filesToZip } from "../core/converter/archives";
import { formatSizeDelta } from "../core/converter/util";
import * as docs from "../core/converter/documents";
import type { OneKitCapabilities } from "./capabilities";
// Bundle the WOFF2 wasm as an asset and initialize it once.
import woff2WasmUrl from "../core/converter/woff2.wasm?url";
void initWoff2(woff2WasmUrl);

/**
 * Convert tab — pick or drop one or several files, choose an honest
 * target, and convert them 100% on-device. Nothing is uploaded; outputs
 * are saved to your downloads. Batch selection converts every file whose
 * detected format matches, and reports the ones it skipped and why.
 * Special modes pack whole batches into a single output: images → one
 * PDF, images → one animated GIF, PDF → all pages, GIF → all frames.
 */
export function createConvertController(caps: OneKitCapabilities): () => void {
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
  };

  const dropZone = $("convert-dropzone");
  const fileInput = $<HTMLInputElement>("convert-file");
  const targetSelect = $<HTMLSelectElement>("convert-target");
  const convertBtn = $<HTMLButtonElement>("convert-btn");
  const zipBtn = $<HTMLButtonElement>("convert-zip-btn");
  const sourceInfo = $("convert-source");
  const status = $("convert-status");
  const results = $("convert-results");
  const imageControls = $("convert-image-controls");
  const qualitySlider = $<HTMLInputElement>("convert-quality");
  const qualityLabel = $("convert-quality-label");
  const maxDimInput = $<HTMLInputElement>("convert-maxdim");
  const rotateSelect = $<HTMLSelectElement>("convert-rotate");
  const flipSelect = $<HTMLSelectElement>("convert-flip");
  const gifDelayInput = $<HTMLInputElement>("convert-gif-delay");
  const folderInput = $<HTMLInputElement>("convert-folder");

  let currentFiles: BatchFile[] = [];
  let currentSource: ReturnType<typeof detectFile>["type"] | null = null;
  let currentTarget: string | null = null;

  const fmt = (bytes: number): string =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const setStatus = (text: string, isError = false): void => {
    status.textContent = text;
    status.classList.toggle("error", isError);
  };

  const IMAGE_SOURCES = new Set<FileType>([
    "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif", "image-svg"
  ]);

  const isImageSource = (t: FileType): boolean => IMAGE_SOURCES.has(t);

  const outputFolder = (): string => sanitizeFolder(folderInput.value);

  const saveOutput = async (bytes: Uint8Array, name: string, mime: string): Promise<void> => {
    const folder = outputFolder();
    if (folder) await caps.saveFileTo(bytes, name, folder, mime);
    else caps.saveFile(bytes, name, mime);
  };

  /**
   * Modes where the whole batch becomes ONE output (or one ZIP), so the
   * per-file loop and the Convert & ZIP button don't apply.
   */
  const specialMode = (
    target: string | null,
    source: FileType | null,
    fileCount: number
  ): "images-pdf" | "gif-maker" | "pdf-pages" | "gif-frames" | null => {
    if (!target || !source) return null;
    if (isImageSource(source) && target === "pdf") return "images-pdf";
    if (isImageSource(source) && target === "image-gif" && fileCount > 1) return "gif-maker";
    if (source === "pdf" && (target === "image-png" || target === "image-jpeg")) return "pdf-pages";
    if (source === "image-gif" && (target === "image-png" || target === "image-jpeg")) return "gif-frames";
    return null;
  };

  const buildImageSettings = (target: string): {
    quality?: number;
    maxDimension?: number;
    rotate?: 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
  } => {
    if (!currentSource || !isImageSource(currentSource)) return {};
    const settings: {
      quality?: number;
      maxDimension?: number;
      rotate?: 90 | 180 | 270;
      flipH?: boolean;
      flipV?: boolean;
    } = {};
    const quality = Number(qualitySlider.value);
    if ((target === "image-jpeg" || target === "image-webp") && Number.isFinite(quality)) {
      settings.quality = Math.min(1, Math.max(0.1, quality / 100));
    }
    const maxDim = Number(maxDimInput.value);
    if (Number.isFinite(maxDim) && maxDim > 0) settings.maxDimension = Math.round(maxDim);
    const rotate = Number(rotateSelect.value);
    if (rotate === 90 || rotate === 180 || rotate === 270) settings.rotate = rotate;
    const flip = flipSelect.value;
    if (flip === "h") settings.flipH = true;
    if (flip === "v") settings.flipV = true;
    if (flip === "hv") {
      settings.flipH = true;
      settings.flipV = true;
    }
    return settings;
  };

  const updateImageControls = (sourceType: FileType | null, target: string | null): void => {
    const isImage = sourceType !== null && isImageSource(sourceType);
    imageControls.hidden = !isImage;
    if (!isImage) return;
    // Quality only affects lossy encoders.
    const lossy = target === "image-jpeg" || target === "image-webp";
    qualitySlider.disabled = !lossy;
    qualityLabel.classList.toggle("muted", !lossy);
    // The GIF delay matters for the animated GIF maker (multi-image batch).
    const gifDelayRow = $("convert-gif-delay-row");
    gifDelayRow.hidden = target !== "image-gif";
  };

  qualitySlider.addEventListener("input", () => {
    qualityLabel.textContent = `${qualitySlider.value}%`;
  });

  const resetSelect = (): void => {
    targetSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— choose a target —";
    targetSelect.appendChild(placeholder);
    currentTarget = null;
    convertBtn.disabled = true;
    zipBtn.disabled = true;
  };

  const showResults = (items: { ok: boolean; label: string }[]): void => {
    results.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = item.ok ? "batch-ok" : "batch-skip";
      row.textContent = `${item.ok ? "✓" : "—"} ${item.label}`;
      results.appendChild(row);
    }
  };

  /** Shared by the file picker and drag-and-drop. */
  const processFiles = async (picked: File[]): Promise<void> => {
    resetSelect();
    results.innerHTML = "";
    if (picked.length === 0) {
      sourceInfo.textContent = "";
      currentFiles = [];
      currentSource = null;
      return;
    }
    const batch: BatchFile[] = [];
    const unreadable: string[] = [];
    for (const file of picked) {
      try {
        const entry: BatchFile = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
        if (file.type) entry.mime = file.type;
        batch.push(entry);
      } catch {
        // Dropped folders or locked files can't be read — report, don't crash.
        unreadable.push(file.name);
      }
    }
    if (unreadable.length > 0) {
      sourceInfo.textContent = `${unreadable.length} file${unreadable.length === 1 ? "" : "s"} couldn't be read (${unreadable.slice(0, 5).join(", ")}${unreadable.length > 5 ? "…" : ""}).`;
    }
    if (batch.length === 0) {
      setStatus("None of the selected files could be read.", true);
      return;
    }
    const plan = planBatch(batch);
    currentFiles = plan.convert;
    currentSource = plan.sourceType;
    updateImageControls(plan.sourceType, null);

    const totalSize = batch.reduce((n, f) => n + f.bytes.length, 0);
    if (plan.sourceType === "unknown") {
      sourceInfo.textContent = `${batch.length} file${batch.length === 1 ? "" : "s"} (${fmt(totalSize)}) — couldn't detect any format.`;
      setStatus("Rename with the right extension (e.g. .pdf, .png) and try again.", true);
      return;
    }
    const skipNote = plan.skipped.length > 0 ? ` · ${plan.skipped.length} skipped` : "";
    sourceInfo.textContent = `${batch.length} file${batch.length === 1 ? "" : "s"} (${fmt(totalSize)}) — ${TYPE_LABELS[plan.sourceType]}${skipNote}`;
    if (plan.skipped.length > 0) {
      showResults(plan.skipped.map((s) => ({ ok: false, label: `${s.file.name} — skipped (${s.reason})` })));
    }

    const targets = targetsFor(plan.sourceType);
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
    setStatus(plan.allSame ? "Pick a target, then convert. Everything happens on this device." : "Pick a target to convert the matching files. Skipped files are listed above.");
  };

  fileInput.addEventListener("change", () => {
    void processFiles(Array.from(fileInput.files ?? [])).catch((err) => {
      setStatus(err instanceof Error ? err.message : String(err), true);
    });
  });

  // Click anywhere on the drop zone (except the input itself) opens the picker.
  dropZone.addEventListener("click", (e) => {
    if (e.target !== fileInput) fileInput.click();
  });

  let dragDepth = 0;
  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  dropZone.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      void processFiles(files).catch((err) => {
        setStatus(err instanceof Error ? err.message : String(err), true);
      });
    }
  });

  const refreshButtons = (): void => {
    const mode = specialMode(currentTarget, currentSource, currentFiles.length);
    convertBtn.disabled = !currentTarget;
    zipBtn.disabled = !currentTarget || mode !== null;
  };

  targetSelect.addEventListener("change", () => {
    currentTarget = targetSelect.value || null;
    refreshButtons();
    updateImageControls(currentSource, currentTarget);
  });

  const singleName = (): string => {
    const base = (currentFiles[0]?.name ?? "file").replace(/\.[^./\\]+$/, "");
    return base || "converted";
  };

  convertBtn.addEventListener("click", () => {
    void (async () => {
      if (currentFiles.length === 0 || !currentTarget || !currentSource) return;
      const target = currentTarget as TargetFormat;
      const label = TARGET_LABELS[target];
      const mode = specialMode(target, currentSource, currentFiles.length);
      setStatus(`Converting ${currentFiles.length} file${currentFiles.length === 1 ? "" : "s"} to ${label}…`);
      convertBtn.disabled = true;
      try {
        if (mode === "images-pdf") {
          const pdf = await docs.imagesToPdf(currentFiles.map((f) => ({ bytes: f.bytes, name: f.name })));
          const name = `${singleName()}-images.pdf`;
          await saveOutput(pdf, name, "application/pdf");
          const totalIn = currentFiles.reduce((n, f) => n + f.bytes.length, 0);
          showResults([{ ok: true, label: `${currentFiles.length} image${currentFiles.length === 1 ? "" : "s"} → ${name} (${formatSizeDelta(totalIn, pdf.length)})` }]);
          setStatus(`Saved ${currentFiles.length} image${currentFiles.length === 1 ? "" : "s"} as one PDF (${name}).`);
          return;
        }
        if (mode === "gif-maker") {
          const delayMs = Number(gifDelayInput.value) || 250;
          const gif = await imagesToAnimatedGif(
            currentFiles.map((f) => ({ bytes: f.bytes, name: f.name })),
            { delayMs }
          );
          const name = `${singleName()}-animation.gif`;
          await saveOutput(gif, name, "image/gif");
          const totalIn = currentFiles.reduce((n, f) => n + f.bytes.length, 0);
          showResults([{ ok: true, label: `${currentFiles.length} image${currentFiles.length === 1 ? "" : "s"} → ${name} (${formatSizeDelta(totalIn, gif.length)}, ${delayMs}ms per frame)` }]);
          setStatus(`Saved an animated GIF with ${currentFiles.length} frame${currentFiles.length === 1 ? "" : "s"} (${name}).`);
          return;
        }
        if (mode === "pdf-pages") {
          const pages = await docs.pdfToImages(currentFiles[0]!.bytes, target === "image-png" ? "png" : "jpeg");
          const mime = target === "image-png" ? "image/png" : "image/jpeg";
          const totalOut = pages.reduce((n, p) => n + p.bytes.length, 0);
          if (pages.length === 1) {
            await saveOutput(pages[0]!.bytes, pages[0]!.name, mime);
            setStatus(`Saved page 1 as ${pages[0]!.name} (${formatSizeDelta(currentFiles[0]!.bytes.length, pages[0]!.bytes.length)}).`);
          } else {
            const zip = await filesToZip(Object.fromEntries(pages.map((p) => [p.name, p.bytes])));
            const zipName = `${singleName()}-pages.zip`;
            await saveOutput(zip, zipName, "application/zip");
            showResults(pages.map((p) => ({ ok: true, label: p.name })));
            setStatus(`Saved ${pages.length} pages as ${zipName} (${formatSizeDelta(currentFiles[0]!.bytes.length, totalOut)}).`);
          }
          return;
        }
        if (mode === "gif-frames") {
          const frames = await splitGifToImages(currentFiles[0]!.bytes, target === "image-png" ? "png" : "jpeg");
          const mime = target === "image-png" ? "image/png" : "image/jpeg";
          const totalOut = frames.reduce((n, f) => n + f.bytes.length, 0);
          if (frames.length === 1) {
            await saveOutput(frames[0]!.bytes, frames[0]!.name, mime);
            setStatus(`This GIF has a single frame — saved as ${frames[0]!.name} (${formatSizeDelta(currentFiles[0]!.bytes.length, frames[0]!.bytes.length)}).`);
          } else {
            const zip = await filesToZip(Object.fromEntries(frames.map((f) => [f.name, f.bytes])));
            const zipName = `${singleName()}-frames.zip`;
            await saveOutput(zip, zipName, "application/zip");
            showResults(frames.map((f) => ({ ok: true, label: f.name })));
            setStatus(`Split ${frames.length} GIF frames into ${zipName} (${formatSizeDelta(currentFiles[0]!.bytes.length, totalOut)}).`);
          }
          return;
        }
        const imageSettings = buildImageSettings(target);
        const done: { ok: boolean; label: string }[] = [];
        let converted = 0;
        let failed = 0;
        for (const file of currentFiles) {
          try {
            const result = await convertFile(
              { bytes: file.bytes, name: file.name, ...(file.mime ? { mime: file.mime } : {}) },
              target,
              { audioDecoder: decodeAudioInBrowser, image: imageSettings }
            );
            const folder = outputFolder();
            if (folder) {
              await caps.saveFileTo(result.bytes, result.name, folder, result.mime);
            } else {
              caps.saveFile(result.bytes, result.name, result.mime);
            }
            done.push({ ok: true, label: `${file.name} → ${folder ? `${folder}/` : ""}${result.name} (${formatSizeDelta(file.bytes.length, result.bytes.length)})` });
            converted++;
          } catch (err) {
            done.push({ ok: false, label: `${file.name} — ${err instanceof Error ? err.message : String(err)}` });
            failed++;
          }
        }
        showResults(done);
        const folder = outputFolder();
        const where = folder ? ` inside ${folder}/` : "";
        if (failed === 0) {
          setStatus(`Saved ${converted} file${converted === 1 ? "" : "s"} as ${label}${where}.`);
        } else if (converted === 0) {
          setStatus(`None of the ${currentFiles.length} files could be converted. See the list above.`, true);
        } else {
          setStatus(`Saved ${converted} file${converted === 1 ? "" : "s"} as ${label}${where}; ${failed} failed. See the list above.`);
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err), true);
      } finally {
        refreshButtons();
      }
    })().catch((err) => {
      setStatus(err instanceof Error ? err.message : String(err), true);
    });
  });

  zipBtn.addEventListener("click", () => {
    void (async () => {
      if (currentFiles.length === 0 || !currentTarget || !currentSource) return;
      const target = currentTarget as Parameters<typeof convertFile>[1];
      const label = TARGET_LABELS[target];
      const imageSettings = buildImageSettings(target);
      setStatus(`Converting ${currentFiles.length} file${currentFiles.length === 1 ? "" : "s"} to ${label} and zipping…`);
      zipBtn.disabled = true;
      try {
        const outcome = await convertBatchToZip(currentFiles, target, {
          audioDecoder: decodeAudioInBrowser,
          image: imageSettings
        });
        const zipName = `converted-${outcome.converted.length}-files.zip`;
        const folder = outputFolder();
        if (folder) {
          await caps.saveFileTo(outcome.zip, zipName, folder, "application/zip");
        } else {
          caps.saveFile(outcome.zip, zipName, "application/zip");
        }
        showResults([
          ...outcome.converted.map((c) => ({ ok: true, label: `${c.source} → ${c.output} (${formatSizeDelta(c.originalSize, c.size)})` })),
          ...outcome.failed.map((f) => ({ ok: false, label: `${f.source} — ${f.error}` }))
        ]);
        const failedNote = outcome.failed.length > 0 ? `; ${outcome.failed.length} failed` : "";
        const where = folder ? ` inside ${folder}/` : "";
        setStatus(`Saved ${outcome.converted.length} file${outcome.converted.length === 1 ? "" : "s"} as ${label} inside ${zipName}${where}${failedNote}.`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err), true);
      } finally {
        refreshButtons();
      }
    })().catch((err) => {
      setStatus(err instanceof Error ? err.message : String(err), true);
    });
  });

  return () => {};
}
