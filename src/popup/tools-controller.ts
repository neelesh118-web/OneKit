import {
  DEFAULT_PASSWORD_OPTIONS,
  estimateStrength,
  generatePassword,
  type PasswordOptions
} from "../core/password-gen";
import { mergePdfs, splitPdfRange } from "../core/pdf-tools";
import {
  dataUrlMime,
  describeChange,
  FORMAT_EXT,
  FORMAT_MIME,
  isSupportedImageMime,
  outputDimensions,
  type ImageFormat
} from "../core/image-tools";
import {
  analyzeBookmarks,
  removableCount,
  type BookmarkAnalysis
} from "../core/bookmark-cleaner";
import type { OneKitCapabilities } from "./capabilities";

function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else {
        reject(new Error("Could not read file"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode that image"));
    img.src = src;
  });
}

/**
 * Tools tab — QR generator, password generator, and page screenshot.
 * Everything here is computed locally (QR via a bundled encoder, passwords
 * via crypto, screenshot via the browser's own capture API).
 */
export function createToolsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* QR --------------------------------------------------------------- */
  const qrInput = $("qr-input") as HTMLInputElement;
  const qrBtn = $("qr-btn") as HTMLButtonElement;
  const qrOutput = $("qr-output");
  const qrStatus = $("qr-status");

  function makeQr(): void {
    const text = qrInput.value.trim();
    qrOutput.innerHTML = "";
    if (!text) {
      qrStatus.textContent = "Enter a URL or any text to encode.";
      return;
    }
    try {
      const { dataUrl, sizePx, modules } = caps.makeQr(text);
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "QR code";
      img.width = Math.min(sizePx, 220);
      img.height = Math.min(sizePx, 220);
      qrOutput.appendChild(img);
      qrStatus.textContent = `QR ready (${modules}×${modules} modules) — scan it with any phone camera.`;
    } catch (error) {
      qrStatus.textContent = error instanceof Error ? error.message : "Could not generate QR.";
    }
  }

  qrBtn.addEventListener("click", makeQr);
  qrInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") makeQr();
  });

  /* Password --------------------------------------------------------- */
  const pwLength = $("pw-length") as HTMLInputElement;
  const pwUpper = $("pw-upper") as HTMLInputElement;
  const pwLower = $("pw-lower") as HTMLInputElement;
  const pwDigits = $("pw-digits") as HTMLInputElement;
  const pwSymbols = $("pw-symbols") as HTMLInputElement;
  const pwAmbig = $("pw-ambig") as HTMLInputElement;
  const pwGenerate = $("pw-generate") as HTMLButtonElement;
  const pwOutput = $("pw-output") as HTMLInputElement;
  const pwStrength = $("pw-strength");
  const pwCopy = $("pw-copy") as HTMLButtonElement;

  function readOptions(): PasswordOptions {
    return {
      length: Math.max(4, Math.min(128, Number(pwLength.value) || DEFAULT_PASSWORD_OPTIONS.length)),
      upper: pwUpper.checked,
      lower: pwLower.checked,
      digits: pwDigits.checked,
      symbols: pwSymbols.checked,
      excludeAmbiguous: pwAmbig.checked
    };
  }

  function generate(): void {
    const password = generatePassword(readOptions());
    pwOutput.value = password;
    const strength = estimateStrength(password);
    pwStrength.textContent = `Strength: ${strength.label} (~${strength.entropyBits} bits entropy)`;
    pwStrength.className = `strength strength-${strength.score}`;
    pwCopy.disabled = false;
  }

  pwGenerate.addEventListener("click", generate);
  pwCopy.addEventListener("click", () => {
    void caps.copyText(pwOutput.value).then(() => {
      pwStrength.textContent = "Copied to clipboard ✓";
      window.setTimeout(() => void generate(), 1200);
    });
  });
  generate();

  /* Screenshot ------------------------------------------------------- */
  const screenshotBtn = $("screenshot-btn") as HTMLButtonElement;
  const screenshotStatus = $("screenshot-status");

  screenshotBtn.addEventListener("click", () => {
    void (async () => {
      screenshotStatus.textContent = "Capturing…";
      const dataUrl = await caps.captureVisibleTab();
      const filename = `onekit-screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      caps.downloadDataUrl(dataUrl, filename);
      screenshotStatus.textContent = `Saved ${filename}.`;
    })().catch(() => {
      screenshotStatus.textContent = "Could not capture — try again on a normal web page.";
    });
  });

  /* Full-page screenshot ----------------------------------------------- */
  const fullpageBtn = $("fullpage-btn") as HTMLButtonElement;

  fullpageBtn.addEventListener("click", () => {
    void (async () => {
      screenshotStatus.textContent = "Capturing full page — this scrolls the tab…";
      await caps.captureFullPage();
      screenshotStatus.textContent = "Full-page capture finished — check the toast in the tab.";
    })().catch(() => {
      screenshotStatus.textContent = "Could not capture — open a normal web page first.";
    });
  });

  /* PDF merge & split --------------------------------------------------- */
  const pdfMergeFiles = $("pdf-merge-files") as HTMLInputElement;
  const pdfMergeBtn = $("pdf-merge-btn") as HTMLButtonElement;
  const pdfSplitFile = $("pdf-split-file") as HTMLInputElement;
  const pdfSplitFrom = $("pdf-split-from") as HTMLInputElement;
  const pdfSplitTo = $("pdf-split-to") as HTMLInputElement;
  const pdfSplitBtn = $("pdf-split-btn") as HTMLButtonElement;
  const pdfStatus = $("pdf-status");

  pdfMergeBtn.addEventListener("click", () => {
    void (async () => {
      const files = [...(pdfMergeFiles.files ?? [])];
      if (files.length === 0) {
        pdfStatus.textContent = "Pick at least one PDF first.";
        return;
      }
      pdfStatus.textContent = "Merging…";
      const inputs = await Promise.all(files.map(readFileBytes));
      const merged = await mergePdfs(inputs);
      if (!merged) {
        pdfStatus.textContent = "Nothing to merge — those files don't look like PDFs.";
        return;
      }
      caps.downloadBytes(merged, `merged-${new Date().toISOString().slice(0, 10)}.pdf`);
      pdfStatus.textContent = `Merged ${files.length} PDF${files.length === 1 ? "" : "s"} — saved to your downloads.`;
      pdfMergeFiles.value = "";
    })().catch(() => {
      pdfStatus.textContent = "Could not merge — one of those PDFs may be encrypted or damaged.";
    });
  });

  pdfSplitBtn.addEventListener("click", () => {
    void (async () => {
      const file = pdfSplitFile.files?.[0];
      if (!file) {
        pdfStatus.textContent = "Pick a PDF first.";
        return;
      }
      const from = Number(pdfSplitFrom.value) || 1;
      const to = Number(pdfSplitTo.value) || 1;
      pdfStatus.textContent = "Extracting…";
      const bytes = await readFileBytes(file);
      const result = await splitPdfRange(bytes, from, to);
      if (!result) {
        pdfStatus.textContent = "That page range is empty — check the page numbers (1-based).";
        return;
      }
      caps.downloadBytes(result, `pages-${from}-${to}-${file.name}`);
      pdfStatus.textContent = `Extracted pages ${from}–${to} — saved to your downloads.`;
      pdfSplitFile.value = "";
    })().catch(() => {
      pdfStatus.textContent = "Could not extract — that PDF may be encrypted or damaged.";
    });
  });

  /* Image convert & resize ---------------------------------------------- */
  const imgFile = $("img-file") as HTMLInputElement;
  const imgFormat = $("img-format") as HTMLSelectElement;
  const imgMax = $("img-max") as HTMLInputElement;
  const imgConvertBtn = $("img-convert-btn") as HTMLButtonElement;
  const imgStatus = $("img-status");

  imgConvertBtn.addEventListener("click", () => {
    void (async () => {
      const file = imgFile.files?.[0];
      if (!file) {
        imgStatus.textContent = "Pick an image first.";
        return;
      }
      const dataUrl = await readFileDataUrl(file);
      const inputMime = dataUrlMime(dataUrl);
      if (!isSupportedImageMime(inputMime)) {
        imgStatus.textContent = "That file doesn't look like a PNG/JPEG/WebP image.";
        return;
      }
      const format = imgFormat.value as ImageFormat;
      const maxPx = Number(imgMax.value) || 0;
      imgStatus.textContent = "Converting…";
      const img = await loadImage(dataUrl);
      const dims = outputDimensions(img.naturalWidth, img.naturalHeight, maxPx);
      const canvas = document.createElement("canvas");
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        imgStatus.textContent = "Could not process the image here.";
        return;
      }
      ctx.drawImage(img, 0, 0, dims.width, dims.height);
      const out = canvas.toDataURL(FORMAT_MIME[format], 0.92);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      caps.downloadDataUrl(out, `${baseName}.${FORMAT_EXT[format]}`);
      const approxBytes = Math.round((out.length * 3) / 4);
      imgStatus.textContent = `Saved — ${describeChange(
        { width: img.naturalWidth, height: img.naturalHeight, bytes: file.size },
        dims,
        format
      )} → ${(approxBytes / 1024).toFixed(1)} KB output.`;
      imgFile.value = "";
    })().catch(() => {
      imgStatus.textContent = "Could not convert that image — try a PNG, JPEG or WebP.";
    });
  });

  /* Bookmark cleaner ---------------------------------------------------- */
  const bookmarksScan = $("bookmarks-scan") as HTMLButtonElement;
  const bookmarksRemove = $("bookmarks-remove") as HTMLButtonElement;
  const bookmarksResults = $("bookmarks-results");
  const bookmarksStatus = $("bookmarks-status");
  let analysis: BookmarkAnalysis | null = null;

  function renderBookmarkAnalysis(): void {
    if (!analysis) {
      bookmarksResults.innerHTML = "";
      return;
    }
    bookmarksResults.innerHTML = "";
    const removable = removableCount(analysis);
    bookmarksStatus.textContent =
      `${analysis.total} bookmarks scanned — ${removable} removable (${analysis.urlDuplicates.length} duplicate group${analysis.urlDuplicates.length === 1 ? "" : "s"}, ${analysis.invalid.length} broken URL${analysis.invalid.length === 1 ? "" : "s"}).`;
    bookmarksRemove.disabled = removable === 0;
    for (const group of analysis.urlDuplicates.slice(0, 20)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = `${group.title} (×${group.removeIds.length + 1})`;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = "saved more than once — the duplicates get removed";
      row.append(title, meta);
      bookmarksResults.appendChild(row);
    }
    for (const bad of analysis.invalid.slice(0, 10)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = bad.title || "(untitled)";
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `broken URL: ${bad.url ?? "(empty)"}`;
      row.append(title, meta);
      bookmarksResults.appendChild(row);
    }
  }

  bookmarksScan.addEventListener("click", () => {
    void (async () => {
      bookmarksStatus.textContent = "Scanning…";
      const tree = await caps.getBookmarks();
      // getTree() returns an array of roots — wrap in one root for analysis.
      analysis = analyzeBookmarks({ id: "root", children: tree });
      renderBookmarkAnalysis();
    })().catch(() => {
      bookmarksStatus.textContent = "Could not read bookmarks — check the bookmarks permission.";
    });
  });

  bookmarksRemove.addEventListener("click", () => {
    if (!analysis) return;
    void (async () => {
      const ids = new Set<string>();
      for (const d of [...analysis.urlDuplicates, ...analysis.titleDuplicates]) {
        for (const id of d.removeIds) ids.add(id);
      }
      for (const bad of analysis.invalid) ids.add(bad.id);
      const list = [...ids];
      if (list.length === 0) return;
      bookmarksStatus.textContent = `Removing ${list.length} bookmark${list.length === 1 ? "" : "s"}…`;
      await caps.removeBookmarks(list);
      analysis = null;
      renderBookmarkAnalysis();
      bookmarksRemove.disabled = true;
      bookmarksStatus.textContent = `Removed ${list.length} bookmark${list.length === 1 ? "" : "s"}. Scan again to check for more.`;
    })().catch(() => {
      bookmarksStatus.textContent = "Could not remove bookmarks — try again.";
    });
  });

  return () => {};
}
