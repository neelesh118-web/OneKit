# OneKit Converter Expansion — Round 2 Work Order (Codex)

You are starting a **24-hour autonomous job**. Read this file and follow it
exactly. Work continuously, never ask questions, never wait for anyone, and
commit + push after every batch. You are the **only engineer** on this tree —
no other agent touches it.

## Your domain (EXCLUSIVE — build only these)

**document · presentation · spreadsheet · ebook · vector**

Your backlog: `docs/converter-backlog.csv` (5,924 demand-ranked pairs in your
domain, header: `rank,from,to,pair,tier,evidence,monthly_search_volume,region,
category_from,category_to,conversion_kind,source_url`). Rows are ordered by
rank (search demand). Build from the top down.

Skip anything outside this domain — the media agent (image/video/audio) owns
those, on a separate branch.

## Current state (READ FIRST)

OneKit's converter was just merged from two agent branches. Baseline:
**107 source formats, 1,275 working pairs.** The matrix, detection, and
dispatch live in:

- `src/core/converter/detect.ts` — FileType definitions, EXTENSIONS map,
  magic-byte sniffing, filename-extension detection
- `src/core/converter/matrix.ts` — MATRIX: FileType → TargetFormat[] rows
- `src/core/converter/convert.ts` — MIME map and dispatch into per-format
  modules
- `src/core/converter/*.ts` — one module per format family (documents,
  images, audio, ebooks, raster, midi, ogg, mp4, psd, icns, raw-photo, …)

`docs/CONVERTER-EXPANSION-PROGRESS.md` summarises the campaign so far —
read the "Honest caveats" section: many formats are deliberately skipped
(HEIC, AVI/WMV/MKV, OPUS decode, real vectorisation, old binary .doc/.ppt).
The round-1 agent batches already added: DOCM/DOTX/XLSM/PPTM/POTX/PPSX,
RST/TeX, HTMLZ/TXTZ, ABW/OEB/PML, AZW/PRC/ZABW, FB2 target, plus ODT/ODP/
RTF/PPTX/EPUB and table-family sources. **Do not re-add what exists** —
verify against `matrix.ts` before implementing anything.

## First steps

1. `npm install` (node_modules may not exist in this fresh worktree).
2. Verify the baseline: `npx tsc --noEmit` clean, and run one quick test
   (`npx vitest run tests/converter-batch-1.test.ts --pool=threads`).
3. Commit the backlog and push:
   `git add docs/converter-backlog.csv && git commit -m "Add round-2 converter backlog (your-domain rows)" && git push origin codex/converter-round2`
4. Then start the batch loop below.

## The batch loop (repeat until the 24h is up)

1. Pick the **highest-rank remaining pairs** from your backlog that are
   honestly implementable 100% locally (read `matrix.ts` first so you never
   duplicate an existing pair).
2. Implement in the existing architecture: add FileType(s) + magic to
   `detect.ts`, target(s) + labels to `matrix.ts`, MIME + dispatch in
   `convert.ts`, and the actual conversion logic in the right family module.
   Reuse existing helpers (`raster.ts` canvas pipeline, `documents.ts`
   renderers, table targets, archive utils, `crc.ts`, `util.ts`) instead of
   duplicating them.
3. Write tests for every new pair (follow the style of
   `tests/converter-batch-*.test.ts` — real bytes, signatures, round-trips,
   honest rejections). Use `--pool=threads` when running vitest.
4. Gate must be green before committing:
   - `npx tsc --noEmit` — clean
   - `npx vitest run --pool=threads` — all pass (never break an existing test)
5. **Commit + push every batch** to `origin/codex/converter-round2`. A
   machine restart must lose nothing — push early and often.
6. Append a short batch log to `docs/PROGRESS-CODEX-R2.md` (batch number,
   pairs added, pair total, formats, tests added). Keep this file
   domain-scoped — do not edit `docs/CONVERTER-EXPANSION-PROGRESS.md`.

## Hard constraints (non-negotiable)

- **100% local.** No network calls, no cloud APIs, no remote code. Everything
  runs in the browser/Node on user-selected files.
- **Honesty Rule (the #1 rule): zero stubs, zero fake matrix entries.** Every
  pair you add to the matrix must actually convert real bytes through
  `convertFile`. If a format can't be done honestly and locally (HEIC, PSD
  layers, old binary .doc/.ppt, DRM ebooks, proprietary codecs), **do not
  add it** — record it in your skip-list in `docs/PROGRESS-CODEX-R2.md` with
  the reason. An honest skip is correct behaviour, not failure.
- **No new npm dependencies** unless there is literally no pure-TS path and
  the package is MIT/Apache/BSD with no known advisories. Prefer writing
  your own parser/encoder.
- **Never touch the popup, UI, manifest, or version number.** The Convert tab
  renders from `matrix.ts` automatically.
- **Never break an existing pair** — run the full suite before every push.
- **No permission prompts, no questions.** Decide, build, test, push.

## Priority

Backlog order is demand-ranked — build top-down. Within your domain, the
biggest demand clusters to expect: PDF → office/spreadsheet targets, office
→ PDF variants, e-book → office/PDF, vector ↔ raster where honest. When you
hit a dense rank of impossible formats (e.g. HEIC), skip-list them and keep
moving down.

## Definition of done (for the 24h run)

- Every batch pushed to `codex/converter-round2`.
- `docs/PROGRESS-CODEX-R2.md` records batches, pair totals, and the honest
  skip-list.
- Final line in the progress doc: your total pair count and how many pairs
  your domain's backlog still has.

Good luck — you're the only engineer on this tree. Work fast, push often.
