# Codex Round 2 Converter Progress

## Batch 1

- Added 3 demand-ranked pairs: PDF to GIF, SVG, and WebP (backlog ranks 68, 73, 74).
- Pair total: 1,278.
- Formats: no new source formats; three existing raster targets enabled for PDF.
- Tests: 5 cases covering matrix exposure, real-PDF conversion signatures/MIME/names, and corrupt-PDF rejection.

## Honest skip-list

- Rank 37 DOC to PDF; rank 55 PPT to PDF; rank 88 DOC to DOCX; rank 114 PPT to PPTX: legacy OLE Office binaries need a full binary Word/PowerPoint parser and layout engine; extension-only or text scraping would not be honest conversion. Modern DOCX/PPTX conversions remain supported.
- Rank 42 AI to PDF: Illustrator files are not one stable local format (native private data plus optional PDF compatibility payload); accepting only the optional payload as universal AI support would be dishonest.
- Rank 61 PDF to DOC and rank 72 PDF to PPT: writing legacy binary DOC/PPT is unsupported; editable PDF to DOCX/PPTX already exists.
- Rank 66 PAGES to PDF: Apple Pages packages require an iWork document/layout renderer not present locally.
- Rank 69 PDF to HEIC: browsers do not provide a dependable HEIC encoder and the project has no local codec.
- Rank 71 PDF to MOBI: the project can read unencrypted MOBI but has no honest PalmDB/MOBI writer.

## Batch 2

- Added 1 demand-ranked pair: CBZ to PDF (backlog rank 83).
- Pair total: 1,279.
- Formats: added Comic Book ZIP (CBZ) detection and natural page ordering.
- Tests: 4 cases covering detection/pair totals, a naturally named real two-page PDF conversion, empty-comic rejection, and corrupt-archive rejection.

- Rank 80 AZW3 to PDF: AZW3/KF8 content is structurally different from the legacy MOBI records handled by the local reader; relabeling it as AZW would misrepresent support.
- Rank 82 CBR to PDF: CBR uses RAR compression and the project has no local RAR decompressor.
- Rank 84 CDR to PDF: CorelDRAW is proprietary and no complete local parser/layout renderer is available.

## Batch 3

- Added 1 demand-ranked pair: ASCII DXF to PDF (backlog rank 89).
- Pair total: 1,280.
- Formats: added DXF detection and vector rendering for LINE, LWPOLYLINE, CIRCLE, ARC, TEXT, and MTEXT entities.
- Tests: parser coverage, real vector PDF output, matrix milestone, binary-DXF rejection, and empty/unsupported-drawing rejection.

## Batch 4

- Added 2 demand-ranked pairs: CSV to JPG and PNG (backlog ranks 136–137).
- Pair total: 1,282.
- Formats: table-aware SVG layout with header styling, alternating rows, XML escaping, and bounded canvas dimensions; existing raster encoders produce the final bytes.
- Tests: SVG layout/escaping, PNG/JPEG signatures and metadata through `convertFile`, pair milestone, and empty-table rejection.

- Rank 104 KEY to PDF: Apple Keynote packages require an iWork presentation/layout renderer not present locally.
- Rank 110 NUMBERS to PDF: Apple Numbers packages require an iWork spreadsheet/layout renderer not present locally.
- Ranks 129–131 AI to DOCX/JPG/PNG: native Illustrator parsing is not dependable locally; a PDF-compatible AI subset cannot honestly represent universal AI support.

## Batch 5

- Added 2 demand-ranked pairs: DOCX to JPG and PNG (backlog ranks 143–144).
- Pair total: 1,284.
- Formats: DOCX content extraction feeds a word-wrapped, XML-safe, bounded SVG page and the existing JPEG/PNG encoders.
- Tests: readable SVG layout/escaping, real DOCX-to-raster signatures and metadata, pair milestone, and text-free-document rejection.

## Batch 6

- Added 2 demand-ranked pairs: EPUB to JPG and PNG (backlog ranks 147–148).
- Pair total: 1,286.
- Formats: EPUB spine content extraction feeds the bounded text-to-SVG renderer and existing JPEG/PNG encoders.
- Tests: real EPUB package conversion to both raster signatures, output metadata, pair milestone, and corrupt-package rejection.

## Batch 7

- Added 4 demand-ranked pairs: HTML to JPG/PNG (backlog ranks 155–156) and MOBI to JPG/PNG (ranks 167–168).
- Pair total: 1,290.
- Formats: existing HTML cleanup and unencrypted PalmDOC/MOBI extraction now feed the bounded text-to-SVG raster path.
- Tests: real HTML and MOBI inputs to both raster signatures, output metadata, pair milestone, empty-HTML rejection, and corrupt-MOBI rejection.

## Batch 8

- Added 4 demand-ranked pairs: PPTX to JPG/PNG (backlog ranks 182–183) and TXT to JPG/PNG (ranks 187–188).
- Pair total: 1,294.
- Formats: OOXML slide text extraction and plain text now feed the shared word-wrapped SVG/raster path.
- Tests: real PPTX and TXT inputs to both raster signatures, output metadata, pair milestone, empty-text rejection, and corrupt-PPTX rejection.

- Ranks 178–180 PPT to DOCX/JPG/PNG: legacy binary PowerPoint needs an OLE presentation parser and renderer; modern PPTX remains supported.

## Batch 9

- Added 4 demand-ranked pairs: XLS to JPG/PNG (backlog ranks 197–198) and XLSX to JPG/PNG (ranks 200–201).
- Pair total: 1,298.
- Formats: BIFF8 XLS and OOXML XLSX first-sheet parsing feed the styled table SVG and existing raster encoders.
- Tests: real XLS/XLSX workbooks to both raster signatures, output metadata, pair milestone, empty-sheet rejection, and corrupt-workbook rejection.

## Batch 10

- Added 1 demand-ranked pair: CBZ to EPUB (backlog rank 312).
- Pair total: 1,299.
- Formats: naturally ordered comic images are embedded as real EPUB assets with one XHTML spine item and navigation point per page.
- Tests: package MIME/signature, image manifest/assets, natural page ordering, spine/navigation counts, pair milestone, and corrupt/empty archive rejection.

- Ranks 203–218 DJVU/DOT/HWP/HWPX/LWP/SDW/WPD/WPS/PAGES to/from PDF: these require unsupported legacy or proprietary document/layout parsers and writers.
- Ranks 227–282 legacy DOC/PPT targets and EPUB to MOBI: binary Office writers and a PalmDB/MOBI writer are unavailable locally.
- Ranks 306–311 AZW3/AZW4/CBC/CBR conversions: KF8/AZW4 parsing, comic collection semantics, and RAR decompression are unavailable locally.

## Batch 11

- Added 5 demand-ranked pairs: PDF to AVIF, BMP, ICO, PSD, and TIFF (backlog ranks 363, 366, 374, 379, 381/382; TIF and TIFF share one target).
- Pair total: 1,304.
- Formats: PDF page rendering feeds the existing AVIF browser encoder and local BMP/ICO/PSD/TIFF encoders.
- Tests: real PDF input to all five format signatures/MIME/names, matrix milestone, and corrupt-PDF rejection for a newly exposed target.

- Ranks 361–419 proprietary/legacy ebook, raw-photo, Office, and vector targets remain skipped where no honest parser or encoder exists; PDF to camera RAW and proprietary document containers cannot be synthesized locally.

## Batch 12

- Added 4 demand-ranked pairs: XLSM to XLSX (backlog rank 423) and CSV to GIF/SVG/WebP (ranks 447, 451, 453).
- Pair total: 1,308.
- Formats: macro-enabled OOXML sheets are rewritten as standard macro-free XLSX; styled CSV table SVG is returned directly or passed through existing GIF/WebP encoders.
- Tests: real XLSM-to-XLSX package/data verification, all three CSV image signatures/MIME/names, matrix milestone, empty-CSV rejection, and corrupt-XLSM rejection.

## Batch 13

- Added 24 demand-ranked pairs: DOCX and EPUB to GIF/SVG/WebP (ranks 461-475); HTML, MOBI, and TXT to GIF/SVG/WebP (ranks 490-582); and PPTX, XLS, and XLSX to GIF/SVG/WebP (ranks 564-616).
- Pair total: 1,332.
- Formats: document, ebook, presentation, text, and spreadsheet renderers now return their locally generated SVG directly or feed it through the existing GIF/WebP encoders.
- Tests: 28 focused cases cover all 24 matrix entries and conversions, real signatures/MIME/names, and honest empty/corrupt input rejection.

- Interleaved legacy PPT/DOC targets through rank 616 remain skipped because the project has no honest binary Office writer; raster and modern OOXML outputs remain supported.

- Ranks 429–436 Illustrator targets and legacy DOC targets at 446/454–460 remain skipped because complete native AI and binary DOC parsing/writing is unavailable locally.
