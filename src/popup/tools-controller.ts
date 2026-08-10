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
import { hexToRgb, rgbCssString, rgbToHex, rgbToHsl } from "../core/color-utils";
import { formatCitation, siteNameFromUrl, type CitationStyle } from "../core/citation";
import {
  addPaletteColor,
  clearPalette,
  listPalette
} from "../core/palette";
import {
  addDays,
  convertUnit,
  dateDiffDays,
  formatConverted,
  formatInTimeZone,
  unitCategories,
  unitsFor,
  type UnitCategory
} from "../core/unit-convert";
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

  /* Screenshot annotate -------------------------------------------------- */
  const annotateCapture = $("annotate-capture") as HTMLButtonElement;
  const annotateStatus = $("annotate-status");

  annotateCapture.addEventListener("click", () => {
    void (async () => {
      annotateStatus.textContent = "Capturing…";
      const dataUrl = await caps.captureVisibleTab();
      await openAnnotator(dataUrl, caps);
      annotateStatus.textContent = "Annotator opened — draw, then save.";
    })().catch(() => {
      annotateStatus.textContent = "Could not capture — try again on a normal web page.";
    });
  });

/**
 * A small in-popup canvas editor for annotating a captured screenshot.
 * Tools: pen, arrow, rect, text. Saves at the image's full resolution — the
 * canvas is the natural size, only the CSS display is scaled down to fit.
 */
async function openAnnotator(dataUrl: string, caps: OneKitCapabilities): Promise<void> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);

  let tool: "pen" | "arrow" | "rect" | "text" = "pen";
  let drawing = false;
  let originX = 0;
  let originY = 0;
  let lastX = 0;
  let lastY = 0;
  const history: ImageData[] = [];
  const MAX_HISTORY = 10;

  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:rgba(15,23,42,.92)",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "padding:14px",
    "overflow:auto"
  ].join(";");

  const toolbar = document.createElement("div");
  toolbar.style.cssText = [
    "display:flex",
    "gap:6px",
    "flex-wrap:wrap",
    "margin-bottom:10px",
    "align-items:center"
  ].join(";");

  const makeBtn = (label: string, active = false): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = [
      "padding:6px 10px",
      "border-radius:7px",
      "border:1px solid #64748b",
      "background:#1e293b",
      "color:#e2e8f0",
      "cursor:pointer",
      "font:600 12px/1 system-ui,sans-serif"
    ].join(";");
    if (active) btn.style.borderColor = "#4f46e5";
    return btn;
  };

  const penBtn = makeBtn("✏️ Pen", true);
  const arrowBtn = makeBtn("➡️ Arrow");
  const rectBtn = makeBtn("▭ Box");
  const textBtn = makeBtn("🔤 Text");
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Text to place…";
  textInput.style.cssText = "padding:6px 8px;border-radius:7px;border:1px solid #64748b;background:#0f172a;color:#e2e8f0;width:150px";
  const undoBtn = makeBtn("↩ Undo");
  const clearBtn = makeBtn("🗑 Clear");
  const saveBtn = makeBtn("💾 Save");
  const closeBtn = makeBtn("✕ Close");

  const selectTool = (next: "pen" | "arrow" | "rect" | "text"): void => {
    tool = next;
    for (const [btn, t] of [[penBtn, "pen"], [arrowBtn, "arrow"], [rectBtn, "rect"], [textBtn, "text"]] as const) {
      btn.style.borderColor = t === tool ? "#4f46e5" : "#64748b";
    }
  };

  penBtn.addEventListener("click", () => selectTool("pen"));
  arrowBtn.addEventListener("click", () => selectTool("arrow"));
  rectBtn.addEventListener("click", () => selectTool("rect"));
  textBtn.addEventListener("click", () => selectTool("text"));

  const snapshot = (): void => {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.push(data);
    if (history.length > MAX_HISTORY) history.shift();
  };

  undoBtn.addEventListener("click", () => {
    const previous = history.pop();
    if (previous) ctx.putImageData(previous, 0, 0);
  });

  clearBtn.addEventListener("click", () => {
    snapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  });

  saveBtn.addEventListener("click", () => {
    const filename = `onekit-annotated-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    caps.downloadDataUrl(canvas.toDataURL("image/png"), filename);
    overlay.remove();
  });

  closeBtn.addEventListener("click", () => overlay.remove());

  toolbar.append(penBtn, arrowBtn, rectBtn, textBtn, textInput, undoBtn, clearBtn, saveBtn, closeBtn);

  canvas.style.cssText = [
    "max-width:100%",
    "max-height:62vh",
    "border-radius:8px",
    "box-shadow:0 12px 40px rgba(0,0,0,.5)",
    "background:#0f172a",
    "cursor:crosshair"
  ].join(";");

  // Map CSS-displayed coordinates back to canvas (device) pixels.
  const toCanvas = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  canvas.addEventListener("pointerdown", (e) => {
    const p = toCanvas(e);
    drawing = true;
    originX = p.x;
    originY = p.y;
    lastX = p.x;
    lastY = p.y;
    if (tool === "text") {
      const text = textInput.value.trim();
      if (!text) {
        drawing = false;
        return;
      }
      snapshot();
      ctx.font = `${Math.max(14, Math.round(canvas.width / 60))}px system-ui, sans-serif`;
      ctx.fillStyle = "#ef4444";
      ctx.fillText(text, p.x, p.y);
      drawing = false;
    } else if (tool === "arrow" || tool === "rect") {
      // One snapshot per shape — undo restores the pre-shape state.
      snapshot();
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = toCanvas(e);
    if (tool === "pen") {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 400));
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (tool === "arrow" || tool === "rect") {
      // Live preview: restore the pre-shape snapshot, then redraw.
      const previous = history[history.length - 1];
      if (previous) ctx.putImageData(previous, 0, 0);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 400));
      if (tool === "rect") {
        ctx.strokeRect(originX, originY, p.x - originX, p.y - originY);
      } else {
        drawArrow(ctx, originX, originY, p.x, p.y);
      }
    }
    lastX = p.x;
    lastY = p.y;
  });

  const stopDrawing = (): void => {
    drawing = false;
  };
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);

  overlay.append(toolbar, canvas);
  document.body.appendChild(overlay);
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, Math.hypot(x2 - x1, y2 - y1) * 0.12);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = "#ef4444";
  ctx.fill();
}
  /* Color picker --------------------------------------------------------- */
  const colorPick = $("color-pick") as HTMLButtonElement;
  const colorCopy = $("color-copy") as HTMLButtonElement;
  const colorStatus = $("color-status");
  let pickedColor: string | null = null;

  colorPick.addEventListener("click", () => {
    void (async () => {
      colorStatus.textContent = "Pick a pixel on the page…";
      const result = await caps.pickColor();
      if (!result.color) {
        colorStatus.textContent =
          result.error === "cancelled" ? "Pick cancelled." : result.error ?? "Could not pick a color.";
        return;
      }
      pickedColor = result.color;
      colorCopy.disabled = false;
      // Every pick is remembered in the palette history.
      void addPaletteColor(result.color, caps.storage).then(() => void renderPalette());
      const rgb = hexToRgb(result.color);
      colorStatus.textContent = rgb
        ? `Picked ${result.color} · ${rgbCssString(rgb)} · HSL ${(() => {
            const h = rgbToHsl(rgb.r, rgb.g, rgb.b);
            return `${h.h}°, ${h.s}%, ${h.l}%`;
          })()}`
        : `Picked ${result.color}.`;
    })().catch(() => {
      colorStatus.textContent = "Could not open the picker — reload the page and try again.";
    });
  });

  colorCopy.addEventListener("click", () => {
    if (!pickedColor) return;
    void caps.copyText(pickedColor).then(() => {
      colorStatus.textContent = `${pickedColor} copied ✓`;
    });
  });

  /* Palette history ------------------------------------------------------- */
  const paletteSwatches = $("palette-swatches");
  const paletteClear = $("palette-clear") as HTMLButtonElement;
  const renderPalette = async (): Promise<void> => {
    const colors = await listPalette(caps.storage);
    paletteSwatches.innerHTML = "";
    paletteClear.hidden = colors.length === 0;
    for (const hex of colors) {
      const swatch = document.createElement("button");
      swatch.className = "palette-swatch";
      swatch.style.background = hex;
      swatch.title = `${hex} — click to copy`;
      swatch.addEventListener("click", () => {
        void caps.copyText(hex).then(() => {
          colorStatus.textContent = `${hex} copied ✓`;
        });
      });
      paletteSwatches.appendChild(swatch);
    }
  };
  paletteClear.addEventListener("click", () => {
    void clearPalette(caps.storage).then(() => void renderPalette());
  });
  void renderPalette();

  /* Citation generator ---------------------------------------------------- */
  const citeStatus = $("cite-status");
  const runCitation = async (style: CitationStyle): Promise<void> => {
    const tab = await caps.getActiveTab();
    const url = tab.url ?? "";
    if (!url.startsWith("http")) {
      citeStatus.textContent = "Open a normal web page first, then copy a citation.";
      return;
    }
    const site = siteNameFromUrl(url);
    const citation = formatCitation(
      {
        title: (tab.title ?? "").trim() || site,
        url,
        siteName: site,
        accessedDate: new Date().toISOString().slice(0, 10)
      },
      style
    );
    await caps.copyText(citation);
    citeStatus.textContent = `Copied ${style.toUpperCase()} citation for this page.`;
  };
  $("cite-apa").addEventListener("click", () => {
    void runCitation("apa").catch((err) => {
      citeStatus.textContent = err instanceof Error ? err.message : String(err);
    });
  });
  $("cite-mla").addEventListener("click", () => {
    void runCitation("mla").catch((err) => {
      citeStatus.textContent = err instanceof Error ? err.message : String(err);
    });
  });
  $("cite-chicago").addEventListener("click", () => {
    void runCitation("chicago").catch((err) => {
      citeStatus.textContent = err instanceof Error ? err.message : String(err);
    });
  });

  /* Download all images --------------------------------------------------- */
  const downloadImagesBtn = $("download-images") as HTMLButtonElement;
  const downloadImagesStatus = $("download-images-status");

  downloadImagesBtn.addEventListener("click", () => {
    void (async () => {
      downloadImagesStatus.textContent = "Collecting images…";
      const saved = await caps.downloadPageImages();
      downloadImagesStatus.textContent =
        saved > 0
          ? `Saved ${saved} image${saved === 1 ? "" : "s"} to your downloads.`
          : "No downloadable images found on this page (or the tab isn't a normal page).";
    })().catch(() => {
      downloadImagesStatus.textContent = "Could not collect images — open a normal page first.";
    });
  });

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

  /* Unit converter -------------------------------------------------------- */
  const unitCategory = $("unit-category") as HTMLSelectElement;
  const unitFrom = $("unit-from") as HTMLSelectElement;
  const unitTo = $("unit-to") as HTMLSelectElement;
  const unitValue = $("unit-value") as HTMLInputElement;
  const unitConvertBtn = $("unit-convert-btn") as HTMLButtonElement;
  const unitResult = $("unit-result");
  const unitStatus = $("unit-status");

  function fillUnitSelect(select: HTMLSelectElement, category: UnitCategory): void {
    select.innerHTML = "";
    for (const unit of unitsFor(category)) {
      const option = document.createElement("option");
      option.value = unit.symbol;
      option.textContent = `${unit.label} (${unit.symbol})`;
      select.appendChild(option);
    }
  }

  for (const category of unitCategories()) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    unitCategory.appendChild(option);
  }

  function renderUnitSelects(): void {
    const category = unitCategory.value as UnitCategory;
    fillUnitSelect(unitFrom, category);
    fillUnitSelect(unitTo, category);
    // Sensible defaults per category.
    const pairs: Partial<Record<UnitCategory, [string, string]>> = {
      length: ["km", "mi"],
      weight: ["kg", "lb"],
      temperature: ["c", "f"],
      data: ["gb", "gib"],
      volume: ["gal", "l"],
      time: ["h", "min"]
    };
    const pair = pairs[category];
    if (pair) {
      unitFrom.value = pair[0];
      unitTo.value = pair[1];
    }
  }

  unitCategory.addEventListener("change", renderUnitSelects);
  renderUnitSelects();

  unitConvertBtn.addEventListener("click", () => {
    const value = Number(unitValue.value);
    if (unitValue.value.trim() === "") {
      unitStatus.textContent = "Enter a value first.";
      unitResult.textContent = "";
      return;
    }
    try {
      const category = unitCategory.value as UnitCategory;
      const result = convertUnit(category, value, unitFrom.value, unitTo.value);
      unitResult.textContent = `${formatConverted(value)} ${unitFrom.value} = ${formatConverted(result)} ${unitTo.value}`;
      unitStatus.textContent = "Converted locally — pure math, no network.";
    } catch (err) {
      unitStatus.textContent = err instanceof Error ? err.message : "Could not convert.";
      unitResult.textContent = "";
    }
  });

  /* Date & time tools ------------------------------------------------------ */
  const dateA = $("date-a") as HTMLInputElement;
  const dateB = $("date-b") as HTMLInputElement;
  const dateDiffBtn = $("date-diff-btn") as HTMLButtonElement;
  const dateDiffResult = $("date-diff-result");
  const dateAddInput = $("date-add-input") as HTMLInputElement;
  const dateAddDays = $("date-add-days") as HTMLInputElement;
  const dateAddBtn = $("date-add-btn") as HTMLButtonElement;
  const dateAddResult = $("date-add-result");
  const dateTzIso = $("date-tz-iso") as HTMLInputElement;
  const dateTzName = $("date-tz-name") as HTMLInputElement;
  const dateTzBtn = $("date-tz-btn") as HTMLButtonElement;
  const dateTzResult = $("date-tz-result");

  dateDiffBtn.addEventListener("click", () => {
    try {
      const diff = dateDiffDays(dateA.value, dateB.value);
      dateDiffResult.textContent =
        diff === 0
          ? "Same day."
          : `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "between the two dates" : "(the first date is later)"}.`;
    } catch (err) {
      dateDiffResult.textContent = err instanceof Error ? err.message : "Check both dates.";
    }
  });

  dateAddBtn.addEventListener("click", () => {
    try {
      const days = Number(dateAddDays.value) || 0;
      const result = addDays(dateAddInput.value, days);
      dateAddResult.textContent =
        days === 0
          ? `That date is ${result}.`
          : `${formatConverted(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days > 0 ? "after" : "before"} ${dateAddInput.value} → ${result}.`;
    } catch (err) {
      dateAddResult.textContent = err instanceof Error ? err.message : "Enter a valid date.";
    }
  });

  dateTzBtn.addEventListener("click", () => {
    try {
      const iso = dateTzIso.value ? new Date(dateTzIso.value).toISOString() : new Date().toISOString();
      const result = formatInTimeZone(iso, dateTzName.value.trim() || "UTC");
      dateTzResult.textContent = `${result} (${dateTzName.value.trim() || "UTC"})`;
    } catch (err) {
      dateTzResult.textContent = err instanceof Error ? err.message : "Could not convert the time.";
    }
  });

  return () => {};
}
