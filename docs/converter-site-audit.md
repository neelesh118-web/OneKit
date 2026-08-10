# Converter site audit — what they offer vs. what OneKit does

Date: 2026-08-10. Sources reviewed live: smallpdf.com, ezgif.com, freeconvert.com, pdfresizer.com.
OneKit's converter is 100% local — anything below marked **built** runs entirely on-device; things marked
**honest no** are features these sites sell that can't be done locally without a heavyweight engine (OCR,
AI, proprietary codecs), so OneKit refuses them honestly instead of faking them.

## smallpdf.com (30+ PDF tools)

| Tool | OneKit converter | Notes |
|---|---|---|
| Compress PDF | — | PDF-tab candidate (re-render at lower DPI); not in the converter |
| Merge PDF | ✅ PDF tab | merge exists in the PDF tab |
| Split PDF | ✅ PDF tab | extract-range exists in the PDF tab |
| Rotate / Delete / Extract / Organize pages | — | PDF-tab candidates, not conversions |
| PDF → Word | — | text/Markdown/HTML built; a real .docx writer is a future item |
| PDF → Excel / PPT | honest no | can't honestly rebuild tables/slides locally |
| **PDF → JPG** | ✅ **built (PDF → PNG/JPG pages)** | renders every page; multi-page zips |
| **JPG/PNG/BMP/GIF → PDF** | ✅ **built (images → PDF)** | one PDF from a batch |
| **TXT / CSV → PDF** | ✅ **built** | CSV renders as rows |
| **HTML → PDF** | ✅ built | was already there |
| **DOCX → PDF** | ✅ **built** | via mammoth → HTML → PDF |
| **EPUB → PDF** | ✅ **built** | |
| **Markdown → PDF** | ✅ **built** | |
| ODT/ODP/ODS/HWP/Pages → PDF | honest no | proprietary office formats |
| PDF OCR / AI PDF / Chat / Summarize | honest no | needs an OCR/AI engine, not local |
| Unlock / Protect / Flatten / Sign | — | PDF-tab candidates (pdf-lib supports protect/flatten) |
| Number pages / Crop / Watermark | — | PDF-tab candidates |
| RTF → PDF | — | possible, low demand |
| ZIP → PDF (images in a zip) | — | future (extract → images → PDF) |

## ezgif.com (animated image + video tools)

| Tool | OneKit converter | Notes |
|---|---|---|
| **GIF maker (images → animated GIF)** | ✅ **built** | batch images → one animated GIF, per-frame delay control |
| **Video → GIF (MP4/WebM/MOV)** | ✅ **built** | browser <video> decode, capped frame count, honest limits |
| **GIF → frames (split)** | ✅ **built** | PNG/JPEG frames, zipped when >1 |
| WebP/APNG/AVIF/JXL → GIF | partial | static WebP/GIF/AVIF ✓ (canvas); animated APNG/WebP/JXL decode is a future item |
| Animated resize / crop / rotate / reverse / speed / optimize | — | future — our GIF decoder is built, so reverse/speed/resize can follow |
| **Image rotate / flip** | ✅ **built** | Convert-tab controls, applies to every image target |
| EXIF / metadata remover | — | future; privacy fit (strips JPEG APPn, PNG tEXt) |
| Background removal / effects / captions | honest no | needs CV/image processing |
| Video resize / cut / filters / screenshot | — | future (video element + canvas is in place) |
| FLAC → MP3, OGG → M4A, audio compress/fade/waveform | partial | **FLAC → WAV/MP3 built**; OGG→M4A/compress/fade future |
| GIF ↔ ANI cursor | honest no | obscure format |

## freeconvert.com (1500+ conversions)

| Tool | OneKit converter | Notes |
|---|---|---|
| **JFIF → PNG** | ✅ **built** | JFIF is JPEG — now detected as JPEG, so it converts to PNG/JPG/WebP |
| HEIC → JPG/PNG | honest no | needs a HEIC decoder engine |
| **PNG/JPEG/WebP/GIF/BMP/AVIF → PNG/JPEG/WebP/AVIF/GIF** | ✅ built | was already there |
| **WEBP → JPG/PNG** | ✅ built | |
| PNG → SVG | honest no | vectorization is a heavy engine |
| **MP4/WebM/MOV → GIF** | ✅ **built** | ezgif's flagship, now here too |
| GIF → MP4/WebM | — | WebM via MediaRecorder is possible; MP4 encode is not honest |
| MP4 → MP3 (extract audio) | — | future (audio-track extraction) |
| RAR → ZIP | honest no | needs unrar engine |
| EPUB → MOBI | honest no | MOBI writer is complex |
| Image compress / JPEG compressor | partial | quality slider built (JPEG/WebP); PNG/GIF optimization future |
| Image enlarger | honest no | AI upscaling |
| PDF: compress / resize / rotate / crop / organize / page remover / extract images | — | PDF-tab candidates (merge/split already there) |
| **PDF → JPG** | ✅ **built** | |
| **JPG → PDF** | ✅ **built** | |
| Unit / time converters | — | not file conversion |

## pdfresizer.com (PDF tools)

| Tool | OneKit converter | Notes |
|---|---|---|
| **PDF → Images (PNG/JPG)** | ✅ **built** | |
| **Images → PDF (multi → one)** | ✅ **built** | |
| **PDF → Text** | ✅ built | plus Markdown/HTML |
| **PDF → HTML** | ✅ built | |
| **DOCX → PDF** | ✅ **built** | |
| EPUB → PDF | ✅ **built** | |
| EPUB → MOBI / AZW3 / CBR/CBZ → PDF | honest no | ebook engines |
| PDF → DOCX / Excel / PowerPoint | —/honest no | text-based DOCX possible later; Excel/PPT not honest |
| Resize / Crop / Rotate / Compress PDF | — | PDF-tab candidates (re-render based, all feasible) |
| Reorder / Delete pages | partial | split exists; full reorder is a PDF-tab candidate |
| Add page numbers / N-up printing | — | PDF-tab candidates, feasible |
| Password protect / remove | partial | protect feasible (pdf-lib); removal only for owner-level restrictions |
| Extract images from PDF | — | feasible via pdfjs operator list |
| Grayscale / invert colors PDF | — | feasible via re-render |
| Repair PDF / fill forms | honest no | best-effort/unreliable |

## What this round added (2026-08-10)

- **PDF → PNG/JPG** (every page; multi-page zips as `name-pages.zip`)
- **Images → PDF** (any raster batch → one PDF, fitted to A4, never upscaled)
- **TXT / CSV / Markdown / EPUB / DOCX → PDF**
- **GIF maker**: several images → one animated GIF (per-frame delay control)
- **GIF splitter**: animated GIF → PNG/JPG frames (zipped)
- **Video → GIF** for MP4/WebM/MOV the browser can decode
- **FLAC → WAV/MP3** (any browser-decodable audio → MP3)
- **JFIF** detected as JPEG (freeconvert's JFIF → PNG)
- **Rotate (90/180/270) + flip (H/V/both)** controls on image conversions
- New types: `audio-flac`, `video-mp4`, `video-webm`, `video-mov`
- Hand-written GIF89a decoder (round-trips against gifenc; enables future GIF edit tools)

## Honest boundaries (why some things aren't offered)

HEIC, RAW photos, Pages/DWG/CAD, OCR, e-signing, AI summarization, PNG→SVG vectorization,
EPUB→MOBI, RAR→ZIP, and MP4 encoding all need heavyweight engines or cloud calls — OneKit is
100% local and free, so those are refused with a clear message rather than silently degraded.
