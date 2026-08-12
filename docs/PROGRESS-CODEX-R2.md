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
