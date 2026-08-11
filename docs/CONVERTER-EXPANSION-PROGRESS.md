# Converter expansion progress

The Convert tab renders straight from `MATRIX` in
`src/core/converter/matrix.ts`, so every entry in it is a promise that the
conversion really runs, locally, on the user's machine. This file records what
each expansion round added and — just as importantly — what was left out and
why.

## Where the matrix stands

| | Count |
|---|---|
| Source formats | **77** |
| Target formats | **49** |
| Working pairs | **801** |

The original 763-pair matrix was swept end-to-end through `convertFile` before this expansion began:
490 run to completion under Node, 143 need a real browser (canvas,
`<video>`, or `decodeAudioData`) and fail honestly outside one, and the rest
return an honest error for a fixture that genuinely lacks the needed content
(a `.docx` with no table, a `.gz` that isn't a gzipped archive). **No pair in
the matrix is without a code path.**

## Batch 1 - 2026-08-12 02:36 IST - OOXML variants

- Added sources: `docm`, `dotx`, `xlsm`.
- Added 38 working pairs, taking the matrix from **763 to 801 pairs**.
- DOCM and DOTX use the existing OOXML Word reader and expose 11 document/raw-encoding targets each. They deliberately do not advertise CSV/XLSX because an arbitrary Word file need not contain a table.
- XLSM uses the existing OOXML spreadsheet reader and exposes 16 table/document/raw-encoding targets; malformed non-ZIP input is rejected before parsing.
- Added 42 parameterized tests covering every new pair, source detection, output signatures/containers, retained content, and corrupt input. Focused verification: 42/42 tests passing; TypeScript clean.
- Dependencies added: none.

## This round: raster, Office, e-book and AIFF families

### New format families

| Family | Sources added | What backs it |
|---|---|---|
| Raster containers | `image-tiff`, `image-ico`, `image-dds` | `raster.ts`, `dds.ts` — decode to pixels, then re-wrap as BMP so the existing canvas pipeline in `images.ts` handles them like any other image |
| Presentations | `pptx`, `odp` | `pptx.ts`, `odf.ts` — slide text in reading order, via `xml-text.ts` |
| Documents | `rtf`, `odt` | `rtf.ts` (control-word parser), `odf.ts` (content.xml reader) |
| Spreadsheets | `xls`, `ods` | The vendored SheetJS build already reads BIFF8 and OpenDocument — routed into the existing `xlsxToCsv` pipeline |
| E-books | `fb2`, `mobi` | `ebooks.ts` — FictionBook XML, and PalmDOC LZ77 decompression for MOBI |
| Audio | `audio-aiff`, `audio-aac` | `aiff.ts` (big-endian PCM, incl. AIFF-C `sowt`/`fl32`); AAC via the browser decoder |

### New targets

`image-bmp`, `image-tiff`, `image-dds`, `image-svg`, `rtf`, `odt`, `pptx`,
`tsv`, `xls`, `ods`, `audio-aiff`.

These are wired to *every* source that can honestly reach them, not just the
new ones — two shared renderers in `convert.ts` do the work:

- **`renderDocument`** — every prose source funnels through HTML, so PDF, DOCX,
  EPUB, RTF, ODT and PPTX output is one implementation shared by `pdf`, `docx`,
  `epub`, `html`, `markdown`, `text`, `rtf`, `odt`, `odp`, `pptx`, `fb2` and
  `mobi`.
- **`renderTable`** — every tabular source funnels through CSV, so CSV/TSV/
  JSON/YAML/XML/XLSX/XLS/ODS and the document renderings of a table are one
  implementation shared by `csv`, `tsv`, `json`, `yaml`, `xlsx`, `xls`, `ods`
  and every record-shaped source (`vcf`, `ics`, `gpx`, `kml`, …).

### Files changed

New: `src/core/converter/{raster,dds,rtf,pptx,odf,aiff,ebooks,xml-text}.ts`
and `tests/converter-{raster,dds,rtf,office,aiff,ebooks}.test.ts` (74 tests).

Extended: `detect.ts` (13 source types, magic bytes, ZIP/OLE2 probes),
`matrix.ts` (targets, labels, extensions, rows), `convert.ts` (MIME map,
dispatch, the two shared renderers), `images.ts` (decode TIFF/ICO/DDS in,
encode BMP/TIFF/DDS/SVG out), `documents.ts` (RTF/ODT/PPTX and TSV/XLS/ODS
writers).

## Honest caveats

These are real conversions, but they are not magic. Stated plainly:

- **PPTX / ODT / RTF / EPUB output preserves text and structure, not layout.**
  Fonts, positioning, images and styling are not carried across.
- **`image-svg` is an embedded raster, not a vector trace.** The output is a
  valid SVG that displays the picture, with the original pixels inside it. The
  target is labelled "SVG (embedded image)" so it can't be mistaken for
  vectorisation.
- **DDS output is uncompressed BGRA**, not DXT-compressed. Reading covers
  DXT1/DXT3/DXT5 and uncompressed surfaces.
- **MOBI reading covers unencrypted PalmDOC.** DRM-protected and HUFF/CDIC
  books raise an honest error rather than producing garbage.
- **TIFF reading covers baseline TIFF** (uncompressed, PackBits, LZW, Deflate,
  8-bit samples). JPEG-in-TIFF, 16-bit samples, tiled and planar layouts raise
  an honest error.
- **PDF → anything textual is text extraction.** Scanned PDFs with no text
  layer produce no text (the OCR tool is a separate feature).

## Deliberately left out

| Format | Why |
|---|---|
| HEIC / HEIF | Needs a wasm decoder — a new npm dependency, outside this round's file scope, and a 1 MB+ bundle cost for the extension |
| OPUS decode, library-backed TIFF | Same reason: a new dependency |
| AVI, WMV, MKV | Depend on demuxers Chrome doesn't reliably provide; the matrix would promise conversions that fail on most files |
| EMF, AI, PSD, CDR | No honest local implementation at a sane size |
| `png → svg` as real vectorisation | Tracing is a different problem from container conversion; the embedded-image SVG above is offered instead, and labelled as such |
| Old binary `.doc` / `.ppt` | Detected as OLE2 compound files, but only the workbook stream is readable — they resolve to "unknown" rather than claiming support |
| MIDI → MP3 | Needs a synthesiser and a soundfont |

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 169 files, 1152 tests passing
- `npm run build` — succeeds (21.18 MB output)
- Full pair sweep — 695/695 pairs reach a real implementation, 0 unimplemented

Worth doing by hand before a store release: open a generated `.pptx` and
`.odt` in real Office, and exercise the Convert tab's four special modes
(images→PDF, images→animated GIF, PDF→pages, GIF→frames) in the browser, since
those paths need a canvas the test suite can't provide.
