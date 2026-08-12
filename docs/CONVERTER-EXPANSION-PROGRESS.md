# OneKit Converter Expansion — Progress

Status tracker for the autonomous converter-expansion rounds. Every claimed
pair runs through `convertFile` — no stubs, no fake matrix entries.

## Live status

| | Count |
|---|---|
| Source formats | **107** |
| Working pairs | **1,275** |
| Pairs added this campaign (from 763) | **+512** |

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
