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

## Batch 14

- Added 16 demand-ranked pairs: AZW, FB2, Markdown, ODP, ODS, ODT, RTF, and XLSM to JPG/PNG (backlog ranks 627-723).
- Pair total: 1,348.
- Formats: existing ebook, markup, OpenDocument, rich-text, and spreadsheet parsers now feed the shared bounded SVG raster pipeline and local PNG/JPEG encoders.
- Tests: focused real-file conversions validate matrix exposure, signatures/MIME/names, and corrupt or empty input rejection across every source family.

- Ranks 629-649 AZW3/CBR/CDR and CBZ/DXF document or single-image outputs remain skipped: KF8, RAR, and CorelDRAW parsers are unavailable, while multi-page CBZ/DXF flattening needs explicit page/output semantics rather than silently discarding content.
- Ranks 664-701 KEY/NUMBERS/PAGES and legacy binary Office targets remain skipped because complete local iWork and binary Office readers/writers are unavailable.

## Batch 15

- Added 4 demand-ranked pairs: AZW to MOBI (rank 746), PDF to RST/TeX (ranks 844/846), and image-backed EPUB to CBZ (rank 943).
- Pair total: 1,352.
- Formats: validated AZW1/MOBI container normalization, structured local PDF text extraction with RST/TeX escaping, and strict EPUB spine-image extraction into ordered CBZ pages.
- Tests: 13 focused cases cover real bytes and metadata, escaping and ordering, DRM/corrupt input rejection, and rejection of text or mixed-layout EPUBs.

- Ranks 747-843 remain skipped where they require AZW3/KF8, RAR, CorelDRAW/Illustrator, MOBI writing, iWork, legacy Office writers, or unsupported proprietary document encoders.
- PDF targets at ranks 836-849 other than RST/TeX remain skipped when they require proprietary/legacy containers; compression or extension relabeling is not treated as conversion.

## Batch 16

- Added 3 demand-ranked pairs: PDF to DOTX (rank 840), MOBI to AZW (rank 1037), and PPTX to ODP (rank 1105).
- Pair total: 1,355.
- Formats: editable PDF text is packaged as a standards-correct Word template, validated unencrypted MOBI containers normalize to AZW, and PPTX slide text/order is written into a complete ODF 1.3 presentation package.
- Tests: 11 focused cases validate OOXML content types/relationships, MOBI DRM/compression rejection, ODP package parts and round-trip slide order, metadata, and corrupt input rejection.

- Ranks 947-1104 remain skipped where they require ET/HWP/HWPX/LIT/LRF/LWP/PDB/iWork/legacy Office parsers or proprietary writers; MOBI to AZW3/CBR/CBZ is not equivalent to container relabeling.

## Batch 17

- Added 5 demand-ranked pairs: XLS/XLSX to macro-enabled XLSM (ranks 1190/1193) and AZW to GIF/SVG/WebP (ranks 1225/1229/1231).
- Pair total: 1,360.
- Formats: spreadsheet data is written into genuine macro-enabled OOXML workbooks without fabricating VBA, while validated unencrypted AZW text uses the shared SVG and GIF/WebP render pipeline.
- Tests: 9 focused cases validate XLSM package content types and cell round-trips, image signatures/MIME/names, and DRM/corrupt AZW rejection.

- Ranks 1115-1239 remain skipped where they require unsupported RocketBook/SNB/TCR/legacy StarOffice/iWork/KF8 or proprietary encoders; JPEG aliases already map to the existing image-jpeg target and are not double-counted.

## Batch 18

- Added 18 demand-ranked pairs: FB2, Markdown, ODP, ODS, ODT, and XLSM to GIF/SVG/WebP (ranks 1293-1520).
- Pair total: 1,378.
- Formats: validated ebook/markup/OpenDocument/spreadsheet content returns locally generated SVG directly or feeds the existing GIF/WebP encoders.
- Tests: focused real-file cases cover all 18 conversions and matrix exposure, signatures/MIME/names, plus blank, corrupt, and malformed source rejection.

- Interleaved KEY/NUMBERS/PAGES/HEIC/legacy DOC/PPT/MOBI-writer targets through rank 1520 remain skipped because their proprietary parsers, codecs, or writers are unavailable locally.

## Batch 19

- Added 8 demand-ranked pairs: PDF to POTX/PPSX/PPTM (ranks 1444/1447/1448), RTF to GIF/SVG/WebP (ranks 1474/1479/1480), and ABW to JPG/PNG (ranks 1537/1538).
- Pair total: 1,386.
- Formats: PDF text is packaged into genuine OOXML presentation template/show/macro-enabled variants with correct main content types and no fabricated VBA; RTF and AbiWord content uses the local text-to-SVG raster pipeline.
- Tests: 15 focused cases inspect OOXML package content types and text round-trips, verify image signatures/MIME/names, and cover corrupt or empty input rejection.

- Proprietary PDF targets and HEIC/legacy Office/iWork/MOBI-writer rows interleaved through rank 1538 remain skipped where no honest local codec or writer exists.

## Batch 20

- Added 10 demand-ranked pairs: PDF to ICNS/PPM/TGA (ranks 1431/1445/1459), DOCM to JPG/PNG (ranks 1647/1648), DOCX to ODP (rank 1666), DOTX to JPG/PNG (ranks 1676/1677), and HTMLZ to JPG/PNG (ranks 1760/1761).
- Pair total: 1,396.
- Formats: PDF first-page rendering feeds native local ICNS/PPM/TGA encoders; modern OOXML and HTMLZ text feeds existing raster renderers; DOCX text and paragraph structure is packaged into a standards-shaped ODP.
- Tests: 17 focused cases validate native signatures/MIME/names, ODP ZIP content and slide round-trip, real DOCM/DOTX/HTMLZ outputs, and corrupt input rejection.

- Interleaved proprietary/raw/legacy targets through rank 1761 remain skipped where the source parser or target encoder is unavailable; JPEG aliases are not double-counted.

## Batch 21

- Added 19 demand-ranked pairs: POTX/PPSX/PPTM to JPG/PNG (ranks 1939/1940, 1947/1948, 1968/1969), PRC to JPG/PNG (ranks 1989/1990), TXT to ODP (rank 2074), and OEB/PML/RST/TeX/TXTZ to JPG/PNG (ranks 1912-2081).
- Pair total: 1,415.
- Formats: validated publishing, ebook, presentation, and Palm/MOBI-family text feeds the local SVG raster pipeline; plain text is packaged into a standards-shaped ODP with blank-input rejection.
- Tests: 29 focused cases validate all 19 pairs, matrix exposure, native signatures/MIME/names, ODP package content, and corrupt or blank input rejection. The complete suite passes 1,734 tests across 219 files.

- Interleaved proprietary legacy Office, raw-camera, and unsupported ebook writer targets through rank 2081 remain skipped where no honest local parser or encoder exists.

## Batch 22

- Added 7 demand-ranked pairs: XLS to AVIF/BMP (ranks 2144/2145), XLSX to AVIF/BMP (ranks 2162/2163), ZABW to JPG/PNG (ranks 2182/2183), and PRC to MOBI (rank 2357).
- Pair total: 1,422.
- Formats: spreadsheet tables feed the existing local AVIF/BMP encoders; gzip-compressed AbiWord text feeds the SVG raster pipeline; validated MOBI-book PRC containers normalize losslessly to MOBI only after full corruption, DRM, and compression checks.
- Tests: 15 focused cases validate all seven pairs, native signatures/MIME/names, exact PRC byte preservation, matrix exposure, empty spreadsheet rejection, and corrupt/DRM/HUFF-CDIC rejection. The complete repository suite passed with exit code 0.

- Interleaved VSD/WMF/WPD/WPS, camera-RAW outputs, EPS writing, legacy Office, and proprietary ebook targets through rank 2357 remain skipped because honest local parsers or encoders are unavailable.

## Batch 23

- Added 3 demand-ranked pairs: AZW to FB2 (rank 2514), ODS to XLSM (rank 2669), and ABW to GIF (rank 2798).
- Pair total: 1,425.
- Formats: validated AZW text renders to structured FictionBook XML; OpenDocument spreadsheet cells are written into genuine macro-enabled OOXML without fabricated VBA; AbiWord text feeds the local GIF raster encoder.
- Tests: 11 focused cases validate structured XML and escaping, XLSM package content and cell round-trip, GIF signature/MIME/name, matrix exposure, plus corrupt, DRM-protected, and malformed input rejection. The complete repository suite passed with exit code 0.

- Earlier RB/SNB/TCR and legacy Office/iWork sources, proprietary AI/CDR outputs, MOBI/KF8/RAR writers, and prose-to-comic targets through rank 2798 remain skipped where an honest local implementation is unavailable or semantically invalid.

## Batch 24

- Added 3 demand-ranked pairs: ABW to SVG/WebP (ranks 2803/2804) and DOCX to DOTX (rank 2933).
- Pair total: 1,428.
- Formats: validated AbiWord text returns local SVG directly or feeds the WebP raster encoder; DOCX content is extracted and packaged into a genuine Word template with the correct template main content type and no fabricated VBA.
- Tests: 13 focused cases validate SVG/WebP signatures and metadata, DOTX OOXML package parts and readable text, matrix exposure, and empty, malformed, or corrupt input rejection. The complete suite passed 1,777 tests across 227 files.

- HEIC encoding, legacy binary DOC/PPT output, MOBI writing, and proprietary AI/AZW4/CBC/CGM/CHM and related formats through rank 2933 remain skipped where local implementation is unavailable.

## Batch 25

- Added 7 demand-ranked pairs: DOCX to RST/TeX (ranks 2937/2939), DOTX to GIF/SVG/WebP (ranks 2950/2955/2956), and HTML to RST/TeX (ranks 3084/3086).
- Pair total: 1,435.
- Formats: validated Word content emits readable reStructuredText and standalone escaped TeX; Word templates use the existing direct-SVG and GIF/WebP raster pipeline; semantic HTML text feeds reusable escaped RST and TeX writers.
- Tests: 14 focused cases validate structured text, reserved-character escaping, real image signatures/MIME/names, matrix exposure, and blank, malformed, or corrupt input rejection. The complete repository suite passed with exit code 0.

- Proprietary HWP/HWPX/LWP/SDW/WPD/WPS writers, legacy DOT/DPS/POT/PPS/PPT, HEIC, MOBI writing, and related unsupported formats through rank 3086 remain honest skips.

## Batch 26

- Added 9 demand-ranked pairs: HTMLZ to GIF/SVG/WebP (ranks 3091/3095/3097), POTX to GIF/SVG/WebP (ranks 3397/3401/3403), and PPSX to GIF/SVG/WebP (ranks 3418/3422/3424).
- Pair total: 1,444.
- Formats: validated HTMLZ and genuine OOXML presentation template/slideshow packages feed the existing direct-SVG and local GIF/WebP raster pipeline.
- Tests: 19 focused cases plus legacy matrix-loop coverage validate all nine outputs, signatures/MIME/names, OOXML variant packages, and corrupt, HTML-free, or unreadable archive rejection. TypeScript and the complete repository suite passed with exit code 0.

- Proprietary WPD/WPS/ZABW writers, legacy DOC/POT/PPS/PPT, HEIC encoding, and HWP/HWPX/LWP readers through rank 3424 remain honest skips.

## Batch 27

- Added 7 demand-ranked pairs: PPTM to GIF/SVG/WebP (ranks 3433/3437/3439), PPTX to PPTM (rank 3445), and PRC to GIF/SVG/WebP (ranks 3448/3452/3454).
- Pair total: 1,451.
- Formats: validated macro-enabled presentations and Palm/MOBI-book PRC content use the local SVG and GIF/WebP render pipeline; PPTX slide text is packaged as genuine macro-enabled presentation OOXML without fabricating VBA.
- Tests: 14 focused cases validate image signatures/MIME/names, PPTM content type and slide-text round-trip, matrix exposure, and corrupt or DRM-protected rejection. TypeScript and the complete repository suite passed with exit code 0.

- Legacy PPT/DOC, proprietary SDA/SDC/SDW/WPD/WPS/ZABW/iWork targets, HEIC, and nonsensical camera-RAW document outputs through rank 3454 remain honest skips.

## Batch 28

- Added 6 demand-ranked pairs: RST to GIF/SVG/WebP (ranks 3501/3506/3507) and TeX to GIF/SVG/WebP (ranks 3615/3620/3621).
- Pair total: 1,457.
- Formats: parsed reStructuredText and TeX content strips synthetic parser headings, returns SVG directly, and feeds local GIF/WebP encoders for raster output.
- Tests: 20 focused cases plus the legacy matrix suite validate all six outputs, signatures/MIME/names, matrix exposure, and blank-input rejection. TypeScript and the complete repository suite passed with exit code 0.

- RocketBook and proprietary SDA/SDC/SDW/WPD/WPS/iWork formats, HEIC, legacy PPT, MOBI writing, and dishonest RAW targets through rank 3621 remain honest skips.

## Batch 29

- Added 6 demand-ranked pairs: TXT to DOTX/RST/TeX (ranks 3631/3635/3637) and TXTZ to GIF/SVG/WebP (ranks 3642/3646/3648).
- Pair total: 1,463.
- Formats: plain text is packaged as genuine Word template OOXML or written as escaped structured RST/standalone TeX; multi-chapter text archives return SVG directly or feed local GIF/WebP encoders.
- Tests: 15 focused cases validate DOTX package content, text escaping/structure, image signatures/MIME/names, matrix exposure, and blank, corrupt, or text-free archive rejection. TypeScript and the complete repository suite passed with exit code 0.

- ABW/DjVu/DOCM/HWP/HWPX/LWP and other proprietary or legacy writers, HEIC, and unsupported document/ebook targets through rank 3648 remain honest skips.

## Batch 30

- Added 8 demand-ranked pairs: ZABW to GIF/SVG/WebP (ranks 3771/3776/3777), AZW to AVIF/BMP (ranks 3829/3830), Markdown to ODP (rank 4084), ODP to ODT (rank 4166), and RTF to ODP (rank 4286).
- Pair total: 1,471.
- Formats: compressed AbiWord and validated AZW content feed local modern raster encoders; Markdown and RTF text are packaged as genuine ODF presentations; ODP text is written into a standards-shaped ODT package.
- Tests: 16 focused cases validate native image signatures/MIME/names, ODF MIME and content parts, matrix exposure, and corrupt, DRM-protected, blank, or unreadable input rejection. TypeScript and the complete repository suite passed with exit code 0.

- Proprietary VSD/WMF/WPD/WPS and spreadsheet targets, camera-RAW output, legacy Office writers, and unsupported ebook/document formats through rank 4286 remain honest skips.
