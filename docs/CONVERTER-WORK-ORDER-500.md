# OneKit Converter Expansion — Claude Code Work Order (500 pairs)

**Project folder (work here):** `C:\Users\neele\D-Workspace\OneKit`
**Target list:** `C:\Users\neele\Desktop\OneKit-Converter-500\top-500-pairs.csv` (demand-ranked, from the 2026 report)
**Context report:** `C:\Users\neele\Desktop\FILE-CONVERSION-PAIRS-REPORT-2026.md`

---

## ⚠️ Paste this exact prompt into Claude Code

```
You are the OneKit converter expansion engineer. OneKit is a 100% local Chrome extension (WXT/MV3) whose Convert tab currently supports ~130 conversion pairs across 36 source formats. Your job: expand it to 500+ honest conversion pairs, in demand-priority order, WITHOUT breaking anything that exists.

## Read first (in this order)
1. C:\Users\neele\Desktop\OneKit-Converter-500\top-500-pairs.csv — the demand-ranked target list (rank 1 = most searched). This is your priority order.
2. C:\Users\neele\Desktop\FILE-CONVERSION-PAIRS-REPORT-2026.md — context on why demand is top-heavy and how pairs were ranked.
3. C:\Users\neele\D-Workspace\OneKit\src\core\converter\ — the converter core: detect.ts (FileType, TYPE_LABELS, EXTENSIONS, magic-byte detection), matrix.ts (TargetFormat, TARGET_LABELS, MATRIX, targetExtension), convert.ts (MIME_BY_TARGET, runConversion switch), and the family modules images.ts, documents.ts, audio.ts, video.ts, fonts.ts, flac.ts, crc.ts, archives.ts, text.ts, gif.ts, util.ts, batch.ts, batch-zip.ts, output-folder.ts, tar.ts.
4. C:\Users\neele\D-Workspace\OneKit\tests\converter-new.test.ts and the other tests\converter-*.test.ts — the test patterns.
5. C:\Users\neele\D-Workspace\OneKit\src\popup\convert-controller.ts — the Convert tab UI wiring (only touch if a new family NEEDS a new special mode).

## Goal
Implement as many of the top-500 pairs as are HONESTLY FEASIBLE 100% locally, working down the ranked list. Realistically target 500+ pairs by adding new format families that share the existing pipelines. Every pair you add must actually work end-to-end.

## The rules (non-negotiable)
1. 100% local. No cloud, no network calls, no servers, no APIs. Nothing ever leaves the device.
2. Honesty is sacred: a matrix entry must mean the conversion REALLY works. If a format or pair cannot be implemented locally, do NOT add it to the matrix, and never return the input bytes unchanged pretending it converted. An honest "not supported" error is correct.
3. Follow the existing architecture exactly: extend detect.ts (FileType union, TYPE_LABELS, EXTENSIONS, detectFromBytes magic bytes), matrix.ts (TargetFormat, TARGET_LABELS, MATRIX, targetExtension), convert.ts (MIME_BY_TARGET, runConversion), and put the actual logic in the matching family module.
4. Share implementations — never duplicate logic. A new source format should route into an existing family pipeline (new image formats → the canvas pipeline in images.ts; new document formats → the text/HTML pipeline in documents.ts; new audio → decodeAudioInBrowser + encode; etc.).
5. Keep TARGET_LABELS, targetExtension, MIME_BY_TARGET and MATRIX in perfect sync. The UI renders targets automatically from the matrix, so a missing label or extension breaks the UI.
6. New format families, in this priority order (all must stay 100% local):
   a. Presentations: PPTX, PPT, ODP, ODT → PDF / HTML / Text / Images. PPTX/ODP are OOXML/zip — parse slide text via fflate + fast-xml-parser and render honestly (text content preserved, exact layout not promised).
   b. Documents: RTF → HTML/Text/PDF (RTF parsing is well-understood), ODT → text/HTML, DOC (old binary — attempt only if you find a clean local parser; otherwise leave it out honestly).
   c. Images: ICO as a SOURCE (decode the PNG payload inside .ico → PNG/JPEG — easy, do this), HEIC/HEIF → JPEG/PNG (only with a maintained, license-clean wasm lib; if adding it means 1MB+ bundle pain, skip and record why), TIFF (hard — leave out honestly unless a clean decoder exists).
   d. E-books: FB2 → EPUB/HTML/Text (XML-based, feasible), MOBI/AZW3 (hard — attempt or leave out honestly).
   e. Audio: AIFF → WAV/MP3 (AIFF is big-endian PCM — parse it like WAV, feasible), OGG ENCODE (hard — leave out unless a clean encoder exists), OPUS → WAV (needs decoder — only if clean lib).
   f. Data: TSV ↔ CSV/JSON/XLSX (tab-separated, trivial), INI/TOML/LOG → text/JSON where it parses cleanly.
   g. Vector: EMF → PNG (hard — leave out honestly).
7. Existing behavior must not change: all 1025 existing tests must keep passing. Never edit existing test expectations. The Convert tab special modes (images→PDF, images→animated GIF, PDF→pages, GIF→frames) must keep working.
8. Only touch: src/core/converter/*, tests/converter-*.test.ts, and src/popup/convert-controller.ts (only if a new special mode is genuinely required). Nothing else in OneKit — no wxt.config, no manifest, no other features.
9. Every new source format gets a test file tests/converter-<family>.test.ts covering: detection (magic bytes + extension), at least one end-to-end conversion through convertFile, and an honest-error test for an unsupported pair. Run the family tests as you go.
10. Keep the codebase clean: no @ts-ignore, no as any, no console.log leftovers, follow the existing naming and comment style.

## Definition of done
- `npx tsc --noEmit` passes.
- `npx vitest run` passes (all existing + new tests).
- `npm run build` passes.
- The matrix grew to 500+ pairs (sources × targets), each pair genuinely working.
- Write docs/CONVERTER-EXPANSION-PROGRESS.md (create if missing): list every new pair/format family you added, the files changed, and the final source/pair count.
- Commit: git add the changed files, git commit with a clear message like "Add converter expansion round: <families>". Then git pull --rebase and git push to origin main. If a pull conflicts, stop and report — do not force-push, do not overwrite another agent's work.
- Report back: final pair count, what you implemented, what you deliberately left out and why.
```

---

## How to run it

1. Open the project folder: `C:\Users\neele\D-Workspace\OneKit`
2. Run Claude Code there (it must run from the OneKit folder).
3. Paste the prompt above in full, press Enter.
4. When Claude Code asks for permission to read/write files, accept (Shift+Tab to auto-accept or type `yes`).
5. Let it run — it works family by family and tests as it goes.

## What NOT to worry about
- The other ~500 pairs are being built in parallel by another agent in the same repo — that's expected. Pull before you push (the prompt already says so). If you hit a conflict, stop and ask instead of force-pushing.

## Honest expectation
The report's own conclusion: demand is extremely top-heavy (PDF↔Word, image→PDF are the ground floor; the long tail is mostly noise). So priority #1 is nailing the top 50 (PDF/docx/image/audio/video families) — breadth beyond that is coverage, not demand. Don't sacrifice quality of the top pairs to chase exotic formats.
