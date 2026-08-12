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

## Remaining backlog (top gaps as of this batch, by rank)

Cross-referenced the full 6,553-row backlog against the current matrix.
The next dense gap cluster is **image → text via OCR** (`jpeg→txt`,
`png→txt`, `svg→txt`, etc. — ranks ~484–1490): this codebase already
ships a 100%-local OCR engine (`src/core/ocr.ts`, tesseract.js +
bundled WASM/traineddata, used elsewhere in the extension) — reusing it
for the Convert tab is the next batch. Also open: `image → markdown`,
`image → odt/rtf` (same embedding pattern as DOCX/PPTX, straightforward
follow-on), and further audio/video container gaps.

---

**Current total: 1,473 pairs across 113 source formats.** Backlog has
6,553 demand-ranked rows in this domain; the batch loop continues
top-down from the gap list above.
