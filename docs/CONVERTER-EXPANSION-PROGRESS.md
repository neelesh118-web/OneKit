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

## Batch 2 — 2026-08-12 — TGA and PPM raster codecs (read + write)

**Added:** Targa (`.tga`) and Netpbm PPM (`.ppm`) as both a source *and* a
write target — unlike the RAW formats, these are plain, fully-specified
raster formats with no proprietary codec involved, so both directions are
genuine, full-fidelity conversions (not previews).

- **`raster.ts`**: `encodeTga`/`decodeTga` (uncompressed and RLE-compressed
  24/32-bit true-color, top-left-origin write, honest rejection of
  palette/greyscale TGA and truncated data) and `encodePpm`/`decodePpm`
  (binary P6 write; P3 ASCII and P6 binary read, `#`-comment header
  handling per the Netpbm spec, honest rejection of a bad header or an
  unsupported >8-bit maxval).
- **Detection** (`detect.ts`): PPM has a genuine magic ("P6"/"P3"). TGA has
  none for old-style files — an optional TGA 2.0 footer
  (`TRUEVISION-XFILE.`) is trusted when present, otherwise the `.tga`
  extension is trusted, matching the RAW-format pattern from batch 1.
- **Every existing raster source/target gained TGA and PPM automatically**
  (they join `IMAGE_TARGETS`, which every image pipeline list is built
  from) — this is the multiplier that makes format-family batches count
  fast.
- **Real bug found and fixed**: an uncompressed-truecolor TGA with no
  ID/colour-map field starts with bytes `[0, 0, 2, 0, ...]` — which is
  *exactly* the ICO/CUR magic-byte signature (`[0,0,1,0]`/`[0,0,2,0]`) this
  codebase already checked for, unconditionally, earlier in
  `detectFromBytes`. Any such TGA (a very common, unremarkable shape —
  simplest possible uncompressed TGA) was silently misdetected as a broken
  cursor file. Fixed by having the ICO/CUR magic check defer to the `.tga`
  extension when they collide. This also exposed a second issue:
  `convertImage()` re-detected the source format from raw bytes alone
  (fallback `"unknown"`, no extension available), so even after fixing
  `detectFromBytes`, a TGA routed through the shared image pipeline would
  still misdetect internally. Fixed by threading the already-known source
  type through as an optional `knownSource` parameter instead of
  re-sniffing blind — `convert.ts` now passes it at every call site where
  the source is already known (plain image sources, SVG, and the RAW
  preview path with `"image-jpeg"`).

**Tests:** `tests/converter-tga-ppm.test.ts` (12 tests) — encode/decode
round-trips, RLE decoding, ASCII P3 decoding, honest rejections, the
extension-vs-ICO collision fix (regression test), and two orchestrator
round-trips (TGA → PNG through the fake canvas, PNG → TGA/PPM through the
fake canvas encode path).

**Pairs:** 919 → **991** (2 new targets × 22 existing image sources = 44,
plus 2 new sources × 14 targets each = 28).
**Tests:** 1,187 → **1,199** (171 → 172 files).
**tsc:** clean. **vitest:** all green.

## Batch 3 — 2026-08-12 — Photoshop PSD (read + write, flattened composite)

**Added:** `.psd` as both a source and a write target — genuinely, not a
preview substitute.

**Technique:** A PSD's Layer and Mask Information section (the individual
editable layers) isn't something pure TS should try to reconstruct. But
every PSD also carries a separate, final **Image Data** section at the very
end of the file: one already-flattened/merged picture, the same pixels a
"flatten image" export would produce — Photoshop keeps it there for
thumbnails and for apps that don't understand layers. `psd.ts` walks past
(without decoding) the Color Mode Data, Image Resources and Layer/Mask
sections using their length prefixes, then decodes that final composite:
raw or PackBits(RLE)-compressed 8-bit RGB or Grayscale, with or without an
alpha channel. RLE reuses `unpackBits` (now exported from `raster.ts`) —
it's the identical PackBits algorithm TIFF already used. Writing produces a
minimal, spec-valid PSD: RGB, 8-bit, uncompressed, empty layer section
(a shape real PSD readers — Photoshop included — read as "flat,
composite-only").

**Honestly out of scope, by design:** 16/32-bit depth, ZIP-compressed image
data, and non-RGB/Grayscale colour modes (CMYK, Indexed, Lab, Multichannel,
Bitmap, Duotone) — all real PSD shapes this reader doesn't reach into, and
all rejected with a clear error rather than silently misreading them.

**Tests:** `tests/converter-psd.test.ts` (10 tests) — encode/decode
round-trip, header-shape assertions, hand-built raw RGB and Grayscale+alpha
decode, hand-built RLE decode, every honest-rejection path (bad signature,
PSB version, ZIP compression, CMYK, 16-bit), detection by magic bytes, and
two orchestrator round-trips (PSD → PNG via fake canvas, PNG → PSD that is
then independently re-decoded to prove it's a real file, not a stub).

**Pairs:** 991 → **1,030** (1 new target × 24 existing image sources = 24,
plus 1 new source × 15 targets = 15).
**Tests:** 1,199 → **1,209** (172 → 173 files).
**tsc:** clean. **vitest:** all green.

## Batch 4 — 2026-08-12 — Apple Icon Image (ICNS), read + write

**Added:** `.icns` as both a source and a write target.

**Technique:** Same shape as the ICO handling already in `raster.ts` —
modern ICNS files are a chunk container (4-byte type + 4-byte length,
repeated), and the sizeable entries (128px and the later @2x set) store a
plain PNG directly inside their chunk. `icns.ts` scans the chunk stream,
picks the largest PNG-encoded chunk (using a known type→nominal-size table,
falling back to payload length for unrecognized-but-PNG types), and hands
back real PNG bytes for the canvas pipeline. Writing wraps a PNG in a
single chunk, picking the standard chunk type (`icp4`…`ic10`) closest to
the image's actual size — real ICNS readers scale the embedded PNG anyway,
so this is cosmetic correctness, not a functional requirement.

**Honestly out of scope:** the legacy raw ARGB+mask chunk types
(`is32`/`il32`/`it32` + `s8mk`/`l8mk`/`t8mk`, pre-10.7 icon format) and
JPEG2000-encoded chunks — both real ICNS shapes, neither decoded here.
A file containing only those gets an honest rejection, not a wrong image.

**Tests:** `tests/converter-icns.test.ts` (9 tests) — wrap/unwrap round-trip,
chunk-type-by-size selection, largest-PNG-wins selection among several
sizes, skipping non-PNG legacy/JPEG2000 chunks to find the real PNG, honest
rejections (no PNG chunk, bad header), magic-byte detection, and two
orchestrator round-trips (ICNS → PNG unwrapped directly — no BMP
re-wrap needed, unlike TIFF/DDS/TGA/PPM/PSD — and PNG → ICNS that's then
independently re-decoded).

**Pairs:** 1,030 → **1,071** (1 new target × 25 existing image sources = 25,
plus 1 new source × 16 targets = 16).
**Tests:** 1,209 → **1,218** (173 → 174 files).
**tsc:** clean. **vitest:** all green (verified against the live matrix:
1,071 pairs across 90 sources).
