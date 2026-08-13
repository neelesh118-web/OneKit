# OneKit Converter Expansion — Progress

Status tracker for the autonomous converter-expansion rounds. Every claimed
pair runs through `convertFile` — no stubs, no fake matrix entries.

## Live status

| | Count |
|---|---|
| Source formats | **205** |
| Working pairs | **11,181** |

## Batch 2026-08-13 — MKV / MPEG-TS sources (web-decodable containers)

11,109 → **11,182 pairs** (205 sources). 72 new pairs, 1 self-target restored:

- **+36 (video-mkv):** mkv → every IMAGE_TARGETS raster target (frame grab),
  video-webm, video-mp4, the full audio extraction reach (mp3/wav/flac/
  aiff/ogg/oga/m4a/m4b/au), txt-base64, txt-hex
- **+36 (video-ts):** ts/m2ts/mts/mod share one MPEG-TS source row with the
  same reach as MKV (minus the MP4-only MOV remux)
- **+1 (audio-m4b):** restored the `audio-m4b → audio-m4b` self-target the
  previous batch removed — it is a real decode+re-encode (through
  `anyToMp4`), like `audio-mp4 → audio-mp4`, and the round-17 reach test
  expects it. Added `audio-m4b` to the re-encode whitelist in the
  no-self-targets consistency tests.
- **AMR: detected but NOT in the matrix** — verified empirically on the
  phone: Chromium's Android ffmpeg build has no AMR decoder, so
  `decodeAudioData` can't decode AMR (the `<audio>` element could via
  MediaPlayer, but the converter pipeline can't). The file is detected so
  the app can say "AMR — no local conversion yet"; advertising targets
  would be dishonest. AMR conversion needs the native Media3/FFmpeg layer.

Why these sources: they are the ones Android's own media stack can actually
decode inside the WebView — Chromium demuxes Matroska and MPEG-TS. MKV → MP4
verified end-to-end on the Moto (21 MB H.264 MKV → 15.9 MB MP4,
`ftypisom`). The remaining blocked backlog rows (avi, wmv, flv, rm, rmvb,
mxf, mpeg, vob, wma, ac3, amr, caf, dss, xcf, raw…) need the native
Media3/FFmpeg decoder layer — those stay `blocked`, not `done`.
Detection: MKV via the EBML magic (with the .mkv extension breaking the
WebM tie), MPEG-TS via the 0x47 sync-byte pattern. Covered by
`tests/converter-batch-mkv-ts-amr.test.ts`. Backlog CSV rows for the
covered pairs marked `done`.

## Batch 2026-08-13 — SVG / SVGZ → Office document variants + TEX

11,098 → **11,109 pairs** (202 sources). 12 pairs added, 1 bogus pair removed:

- **+6 (svg):** svg → docm, dotx, potx, ppsx, pptm, tex
- **+6 (svgz):** svgz → docm, dotx, potx, ppsx, pptm, tex (SVGZ shares the
  SVG_TARGETS list, so the six came free)
- **−1 (audio-m4b):** removed the `audio-m4b → audio-m4b` self-target that
  the round-17 expansion introduced (a self-conversion is not a real pair;
  fixed the matrix-consistency tests) — *reverted in the next batch: it is
  a real decode+re-encode, see above*

All 12 run through real pipelines in `convertFile` (DOCM/DOTX via the DOCX
writer, POTX/PPSX/PPTM via the PPTX writer, TEX from the SVG's own text — no
OCR). Covered by `tests/converter-batch-svg-docvariants.test.ts`. Backlog CSV
rows marked `done` in the new `status` column.

## Campaign so far

### Codex round 1 — documents / office / ebooks (branch `codex/converter-round`)

Base 763 → **967 pairs** across 7 batches:

- **Batch 1 — DOCM, DOTX, XLSM** (801 pairs): Office macro/legacy variants
  wired through the existing DOCX/XLSX pipelines with container probing.
- **Batch 2 — PPTM, POTX, PPSX** (837 pairs): PowerPoint macro/template/
  slideshow variants.
- **Batch 3 — RST, TeX** (859 pairs): reStructuredText and TeX as sources
  and targets.
- **Batch 4 — HTMLZ, TXTZ** (881 pairs): zipped HTML/text bundles.
- **Batch 5 — ABW, OEB, PML** (914 pairs): AbiWord, Open eBook, and Palm
  Markup Language (with real Palm database record handling).
- **Batch 6 — AZW, PRC, ZABW** (947 pairs): Kindle/Mobipocket wrappers and
  compressed AbiWord.
- **Batch 7 — FB2 target** (967 pairs): standards-shaped FictionBook 2 XML
  output with metadata, XML escaping and paragraph preservation.

### Claude Code round 1 — image / video / audio (branch `claude/converter-round`)

Base 763 → **1,071 pairs** across 4 batches:

- **Batch 1 — Camera RAW preview extraction** (919 pairs): CR2/NEF/ARW/DNG/
  ORF/PEF/RW2/DCR/ERF/3FR/MOS/RAF embedded-preview readers.
- **Batch 2 — TGA + PPM raster codecs** (991 pairs): read and write for both
  formats.
- **Batch 3 — Photoshop PSD** (1,030 pairs): flattened-composite decode/
  encode (raw + PackBits RLE, RGB/gray, alpha).
- **Batch 4 — Apple ICNS** (1,071 pairs): chunk-container read/write via
  embedded PNG.

## Merge

Both branches merged into `main` with a clean matrix union (the domain split
was disjoint — 763 + 204 + 308 = 1,275, zero overlap). The combined backlog
lives in `docs/converter-backlog.csv` (12,986 demand-ranked rows).

## Honest caveats (carried from both agents)

- Real conversions, not magic: PPTX/ODT/RTF/EPUB output preserves text and
  structure, not layout; SVG targets embed the raster (labelled); MOBI is
  unencrypted PalmDOC only; TIFF is baseline (uncompressed/PackBits/LZW/
  Deflate, 8-bit); PSD is flattened composite only; RAW is embedded preview
  extraction; HEIC/HEVC/OPUS/AVI/WMV/MKV and real vectorisation are
  deliberately out of scope and rejected with honest errors.

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run --pool=threads` — full suite green
- `npm run build` — succeeds
