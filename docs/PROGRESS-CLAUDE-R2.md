# Round-2 Claude progress

Domain: **image · video · audio**. Backlog: `docs/converter-backlog.csv`
(6,553 demand-ranked pairs). Baseline at the start of round 2: **107 source
formats, 1,275 pairs**.

## Batch log

### Batch 1 — image → real embedded DOCX/PPTX/HTML, four new RAW formats, EPS/PS preview extraction

**Pairs: 1,275 → 1,473 (+198). Sources: 107 → 113 (+6).**

1. **Image → DOCX/PPTX (real embedded pictures, not text placeholders).**
   Added `imagesToDocx` (`documents.ts`) and `imagesToPptx` (`pptx.ts`):
   real OOXML packages with a genuine `<w:drawing>`/`<p:pic>` blip
   embedding the actual picture bytes (`word/media/imageN.png`,
   `ppt/media/imageN.png`), scaled to fit the page/slide without
   upscaling. Reuses the existing canvas rasterizer
   (`defaultImageRasterizer`, factored out of `imagesToPdf` into
   `images.ts` and shared) so PNG/JPEG pass through untouched and every
   other raster format re-encodes through the same pipeline as
   image→PDF. Added `pngSize`/`jpegSize` (`raster.ts`) to read real
   pixel dimensions for layout, and `fitEmu` for scale-to-fit math.
   Wired to `docx`/`pptx` targets for every raster image source (PNG,
   JPEG, WebP, GIF, BMP, AVIF, SVG, TIFF, ICO, DDS, TGA, PPM, PSD, ICNS,
   all 12 RAW preview sources) — 26 sources × 2 targets = 52 pairs.

2. **Image → HTML (real embedded picture, self-contained page).**
   Added `imageToHtml`/`wrapImageAsHtml` (`documents.ts`): wraps the
   real picture as a `data:` URI `<img>` in a minimal standalone HTML
   page. SVG sources embed their original vector bytes directly
   (`image/svg+xml`) instead of rasterizing — no quality loss, the
   browser renders it natively. Wired to the same 26 sources as above,
   +1 target each.

3. **Four more camera RAW formats** (reusing the existing
   `extractRawPreviewJpeg` scanner, which is format-agnostic — it just
   finds the largest embedded JPEG SOI…EOI stream, so no new extraction
   logic was needed): **CR3** (Canon, ISO-BMFF `ftypcrx ` brand), **CRW**
   (Canon CIFF, `HEAPCCDR` header), **MRW** (Minolta, `\0MRM` header),
   **X3F** (Sigma, `FOVb` header). Each gets the full RAW target list
   (14 image formats + PDF/DOCX/PPTX/HTML/base64/hex = 20 pairs), all
   new: 4 × 20 = 80 pairs.

4. **EPS/PS → image/PDF/DOCX/PPTX/HTML via embedded TIFF preview.**
   New module `eps.ts`: the "DOS EPS" binary wrapper some exporters
   (Illustrator, CorelDraw) write (signature `C5 D0 D3 C6`) embeds a
   real low-res TIFF preview alongside the PostScript — the same shape
   as a camera RAW's embedded JPEG preview. `extractEpsPreviewTiff`
   slices out that TIFF section and feeds it into the existing
   `decodeTiff` → canvas pipeline. Plain ASCII PostScript (no binary
   wrapper, the common case for non-Adobe/CorelDraw tools) throws an
   honest "no embedded preview" error — full PostScript rasterization
   needs a PS interpreter, which is out of scope. `.eps` and `.ps` share
   detection (same `%!PS-Adobe` / binary header); the extension breaks
   the tie. 2 new sources × 20 pairs = 40 pairs.

**Tests added:** `tests/converter-image-office.test.ts` (imagesToDocx,
imagesToPptx, imageToHtml/wrapImageAsHtml, matrix wiring, end-to-end
`convertFile` dispatch — 20 tests), `tests/converter-eps.test.ts`
(detection, `extractEpsPreviewTiff`, end-to-end EPS/PS→PDF/DOCX/PNG with
a real decodable TIFF fixture — 11 tests), extended
`tests/converter-raw-photo.test.ts` (CR3/CRW/MRW/X3F detection +
end-to-end CR3→PDF — 15 tests total), extended
`tests/converter-raster.test.ts` (pngSize/jpegSize/fitEmu — 8 new
tests). All real bytes, real signatures, honest rejections — no stubs.

**Gate:** `npx tsc --noEmit` clean; `npx vitest run --pool=threads` —
183 test files, 1,503 tests, all green.

## Honest skip-list (backlog rows deliberately not implemented)

- **HEIC/HEIF** (source or target, any pair) — needs a HEVC/wasm image
  decoder/encoder; no pure-TS path.
- **AVI/WMV/MKV/FLV/3GP as a source** — no reliable local demuxer; the
  video pipeline decodes via the browser's native `<video>` element,
  which doesn't reliably support these containers cross-platform.
- **AAC as an output target** (`flac→aac`, `mp3→aac`, `wav→aac`,
  `m4a→aac`) — no real AAC encoder available without a new dependency;
  writing fake AAC bytes would violate the Honesty Rule. (`→m4a` for
  these same sources already works — the existing `audio-mp4` target
  muxes a real MP3 stream into an MP4/M4A container.)
  <br>Note: **cross-container transcodes** (`mp4→avi/mkv/mov`,
  `mkv→mp4`, `webm→avi`, etc.) are also skipped for the same
  no-reliable-demuxer/no-reliable-encoder reason on the container side.
- **`raw` as a generic source extension** — too ambiguous (which vendor
  RAW?) to detect or extract honestly; every specific RAW extension
  (CR2/NEF/ARW/DNG/ORF/PEF/RW2/DCR/ERF/3FR/MOS/RAF/CR3/CRW/MRW/X3F) is
  covered instead.
- **EPS/PS with no embedded binary preview** (plain ASCII PostScript,
  the common case outside Adobe/CorelDraw exports) — throws an honest
  per-file error rather than a matrix-level skip, since the *format*
  can honestly convert when the preview is present.
- **"ai" as a target format** — real Illustrator (.ai) files are
  PDF-compatible internally, but writing a bare PDF and calling it
  ".ai" would be a stretch of the Honesty Rule (a plain PDF doesn't
  carry the AI-specific private data Illustrator's own writer embeds);
  not implemented this round.
- **Audio → WebM** (`mp3/wav/flac/m4a/aac/aiff/ogg → webm`) — WebM
  strictly expects Opus/Vorbis audio, and this codebase has neither
  encoder (only MP3/FLAC/AIFF/WAV). Muxing MP3 into a `.webm` the way
  `audio-mp4` already muxes MP3 into MP4 would risk failing strict WebM
  readers rather than just "working in most players" the way the M4A
  case does; not implemented this round.

## Remaining backlog (top gaps as of this batch, by rank)

Cross-referenced the full 6,553-row backlog against the current matrix.
The next dense gap cluster is **image → text via OCR** (`jpeg→txt`,
`png→txt`, `svg→txt`, etc. — ranks ~484–1490): this codebase already
ships a 100%-local OCR engine (`src/core/ocr.ts`, tesseract.js +
bundled WASM/traineddata, used elsewhere in the extension) — reusing it
for the Convert tab is the next batch. Also open: `image → markdown`,
`image → odt/rtf` (same embedding pattern as DOCX/PPTX, straightforward
follow-on), and further audio/video container gaps.

### Batch 2 — image → text via the bundled offline OCR engine

**Pairs: 1,473 → 1,504 (+31). Sources: 113 (unchanged).**

The extension already ships a 100%-local OCR engine
(`src/core/ocr.ts` — tesseract.js + bundled WASM core and English
traineddata, no network, used by the standalone "Read text from image"
tool) — reusing it for the Convert tab's `image → text` pairs is a
genuine conversion, not a stub. Added `runOcr` (`convert.ts`): builds a
`data:` URL from the (rasterized-if-needed) image bytes via a new
shared helper `imageBytesToDataUrl` (`images.ts`), then calls
`ocr.ocrImageDataUrl`, resolving the extension's asset-URL resolver
(`browser.runtime.getURL`/`chrome.runtime.getURL`) from `globalThis` —
no new import of `wxt/browser` into the host-agnostic converter core,
same defensive-global pattern the rest of `convert.ts` already uses
for canvas/video/audio. Outside the extension runtime (Node, tests,
other hosts) it throws an honest "OCR needs the extension runtime…"
error instead of a fake empty result — same shape as the existing
video/audio browser-only capabilities. Injectable via
`opts.ocr.recognize` for testing, same pattern as
`opts.canvas`/`opts.audioDecoder`.

Wired to `text` for every OCR-capable raster source (PNG, JPEG, WebP,
GIF, BMP, AVIF, TIFF, ICO, DDS, TGA, PPM, PSD, ICNS, all 16 RAW preview
sources, EPS, PS) — **not** SVG, whose `text` target already means
"the SVG's own markup" (existing, unrelated behaviour, left untouched).
PNG/JPEG/WebP/GIF/BMP/AVIF and RAW previews (already JPEG) need no
canvas — OCR runs straight off the original bytes; TIFF/ICO/DDS/TGA/
PPM/PSD/ICNS/EPS/PS rasterize through the existing canvas pipeline
first, same as their DOCX/PPTX/HTML siblings.

**Tests added:** extended `tests/converter-image-office.test.ts` (+5:
PNG and RAW→text with an injected OCR engine, the honest
no-runtime-available rejection, SVG's unchanged markup-text behaviour,
matrix membership) and `tests/converter-eps.test.ts` (+1: EPS's TIFF
preview rasterized then OCR'd, with the existing fake-canvas fixture).

**Gate:** `npx tsc --noEmit` clean; `npx vitest run --pool=threads` —
183 test files, 1,509 tests, all green.

### Batch 3 — image → Markdown/ODT/RTF (real embedded pictures)

**Pairs: 1,504 → 1,600 (+96). Sources: 113 (unchanged).**

Rounded out the image-embedding cluster started in batch 1 with the
three remaining document formats the matrix was missing:

- **Markdown** — `wrapImageAsMarkdown`/`imageToMarkdown` (`documents.ts`):
  `![name](data:mime;base64,...)`, a real self-contained embed (renders
  in any Markdown viewer that resolves data URIs — VS Code and most
  desktop renderers do).
- **RTF** — `imageToRtf`/`imageToRtfDocument` (`rtf.ts`, previously
  text-only): a genuine embedded `\pict` picture
  (`\pngblip`/`\jpegblip`, hex-encoded — RTF 1.9+, every major reader
  accepts it), not a placeholder. `rtf.ts` now also depends on
  `images.ts` for the shared rasterizer.
- **ODT** — `imagesToOdt` (`odf.ts`, previously text-only `buildOdt`):
  a real `draw:frame`/`draw:image` per picture, `Pictures/imageN.*`
  declared in `META-INF/manifest.xml` with its own media-type entry —
  the way LibreOffice/OpenOffice actually store a picture.

All three follow the established shape: PNG/JPEG pass through
untouched, everything else rasterizes through the same canvas pipeline
as the DOCX/PPTX/HTML/OCR embedders, and SVG sources embed their
original vector bytes directly instead of rasterizing. Wired to all 26
sources from batch 1 (14 direct-canvas raster types + 12 RAW preview
types) plus EPS/PS via their TIFF-preview path — same 28-source
coverage as `docx`/`pptx`/`html`/`text`.

**Tests added:** extended `tests/converter-image-office.test.ts` (+13:
Markdown/ODT/RTF unit tests, matrix membership, end-to-end
`convertFile` dispatch) and confirmed no regressions in
`tests/converter-rtf.test.ts` (existing RTF reader/text-writer tests).

**Gate:** `npx tsc --noEmit` clean; `npx vitest run --pool=threads` —
183 test files, 1,521 tests, all green.

### Batch 4 — video → any raster image target (not just GIF/PNG/JPEG)

**Pairs: 1,600 → 1,633 (+33). Sources: 113 (unchanged).**

MP4/WebM/MOV could already grab a still frame as PNG/JPEG
(`videoToImage`) or an animated GIF (`videoToGif`), but nothing else —
the backlog wants `mov/mp4/webm → svg/webp/avif/bmp/ico/tiff/dds/tga/
ppm/psd/icns` too. Rather than build 11 new frame-capture paths, the
dispatch now grabs one frame as a PNG (the existing, already-honest
`videoToImage` call) and runs it through `convertImage` — the exact
same canvas pipeline every still-image source already uses to reach
those 11 formats. No new video code, no new image code; just
connecting two pipelines that were already honest on their own.
Exported `IMAGE_TARGETS` from `matrix.ts` so the video target lists
spread it directly instead of hand-duplicating the format list.

**Tests added:** extended `tests/converter-video.test.ts` (+2: matrix
membership for all three video sources across all 11 new formats, and
an honest-rejection dispatch test proving the new branch is actually
reached in Node rather than silently falling through to GIF).

**Gate:** `npx tsc --noEmit` clean; `npx vitest run --pool=threads` —
183 test files, 1,523 tests, all green.

### Batch 5 — TIFF→TIFF and AIFF→AIFF (real re-encodes, not no-ops)

**Pairs: 1,633 → 1,635 (+2). Sources: 113 (unchanged).**

The backlog explicitly wants `tif↔tiff` and `aif↔aiff` — which, since
`.tif`/`.tiff` and `.aif`/`.aiff` already detect as the exact same
`FileType`, means "convert the format to itself." That's not a no-op
here: `image-png`/`-jpeg`/`-webp`/`-gif`/`-bmp`/`-avif` and
`audio-wav` already include themselves as targets because
re-encoding through the canvas/PCM pipeline is a genuine operation
(recompression, and for WAV, `normalizeWav`'s canonical-form pass).
TIFF and AIFF just hadn't been given the same treatment yet:
`image-tiff`'s target list was a filtered copy of `IMAGE_AND_PDF`
excluding itself for no real reason (simplified to just
`IMAGE_AND_PDF`, matching PNG/JPEG/etc. exactly), and `audio-aiff`
now includes `audio-aiff` with an explicit `encodeAiff(parsed)`
branch in `convert.ts` (previously the fallthrough would have
silently returned WAV bytes labelled `.aiff` — a real bug this closes
before it could ship as a matrix entry).

**Tests added:** `tests/converter-aiff.test.ts` (+2: matrix
membership, real `convertFile` round-trip verifying sample
rate/channels/samples survive); `tests/converter-image-office.test.ts`
(+1: matrix membership for TIFF→TIFF).

**Gate:** `npx tsc --noEmit` clean; `npx vitest run --pool=threads` —
183 test files, 1,526 tests, all green.

---

**Current total: 1,635 pairs across 113 source formats.** Backlog has
6,553 demand-ranked rows in this domain; the batch loop continues
top-down from the gap list above.
