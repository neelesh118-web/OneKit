# Converter Expansion Progress — Media Round (claude/converter-round)

Tracking the media (image/video/audio) converter expansion per
`CLAUDE-WORK-ORDER.md`. Baseline at start: **763 pairs**, 170 test files,
1,177 tests, `npx tsc --noEmit` clean.

## Batch 1 — 2026-08-12 — Camera RAW preview extraction (CR2/NEF/ARW/DNG/ORF/PEF/RW2/DCR/ERF/3FR/MOS/RAF)

**Added:** 12 new source formats — Canon CR2, Nikon NEF, Sony ARW, Adobe DNG,
Olympus ORF, Pentax PEF, Panasonic RW2, Kodak DCR, Epson ERF, Hasselblad 3FR,
Leaf MOS, Fujifilm RAF.

**Technique:** RAW sensor data needs a vendor demosaic algorithm to become a
picture — not feasible in pure TS. But every one of these formats embeds a
real, full (often near-full-resolution) JPEG preview for the camera's own
LCD and for software that can't decode the sensor data — the same preview
desktop RAW tools show before the real develop pass finishes. `raw-photo.ts`
scans the file for JPEG SOI/EOI marker pairs (format-agnostic — works
regardless of each vendor's IFD/SubIFD quirks) and keeps the largest valid
stream. That real JPEG then runs through the existing image pipeline
(`convertImage`) to reach every raster target, plus PDF.

- **Detection** (`detect.ts`): CR2/NEF/ARW/DNG/ORF/PEF/RW2/DCR/ERF/3FR/MOS
  share the TIFF/EP "II*\0"/"MM\0*" byte-order mark with plain TIFF, so a new
  `RAW_TIFF_TYPES` set trusts the file's own extension to disambiguate before
  the generic TIFF magic-byte check claims them — a bare `.tiff` still
  detects as `image-tiff`. RAF has its own distinct ASCII header
  (`FUJIFILMCCD-RAW`), detected independent of extension like the other
  content-sniffed formats.
- **Matrix**: all 12 new sources map to the same target list as any other
  photo (`IMAGE_AND_PDF` — PNG/JPEG/WebP/AVIF/GIF/ICO/BMP/TIFF/DDS/SVG/PDF/
  Base64/Hex).
- **Dispatch** (`convert.ts`): extracts the preview via
  `extractRawPreviewJpeg`, then reuses `convertImage`/`docs.imagesToPdf`
  exactly as any JPEG source would.
- **Bug caught by the PDF round-trip test**: `Uint8Array.subarray()` returns
  a view sharing the *original* file's `ArrayBuffer` at a nonzero byte
  offset. pdf-lib's `JpegEmbedder` reads `imageData.buffer` directly and
  ignores `byteOffset`, so the extracted preview appeared to start at byte 0
  of the whole RAW file instead of its real offset ("SOI not found in
  JPEG"). Fixed by returning `.slice()` (a real copy) from
  `extractRawPreviewJpeg` — worth remembering for any future byte-range
  extraction that hands data to a consumer outside this codebase.

**Tests:** `tests/converter-raw-photo.test.ts` (10 tests) — extension-vs-magic
disambiguation, RAF's own header, full target-list coverage, largest-stream
selection over a planted thumbnail, an honest error with no embedded preview,
a large-buffer non-hang check for an unterminated false-positive SOI, and two
end-to-end orchestrator round-trips (CR2 → PNG via fake canvas, RAF → PDF
with a real embeddable JPEG that pdf-lib actually decodes).

**Pairs:** 763 → **919** (12 sources × 13 targets = 156 new pairs).
**Tests:** 1,177 → **1,187** (170 → 171 files).
**tsc:** clean. **vitest:** all green.

**Honestly skipped (this batch):**
- **CRW (old Canon CIFF), MRW (Minolta), X3F (Sigma):** each uses a distinct
  non-TIFF container (CIFF, its own MRM structure, FOVb) rather than
  TIFF/EP — the SOI/EOI preview-scan approach would likely still work since
  these also embed JPEG thumbnails, but the container-specific detection
  logic wasn't built this batch. Candidate for a follow-up batch.
- Generic **"raw"** backlog row: not a concrete file extension/format, can't
  be built honestly as its own source.
