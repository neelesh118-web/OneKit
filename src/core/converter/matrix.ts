import type { FileType } from "./detect";

/**
 * The conversion matrix — which target formats each source type can
 * become, and which conversion function handles it. This is the single
 * source of truth the Convert tab's UI renders from, and the honest
 * boundary of what's possible 100% locally.
 */

export type TargetFormat =
  | "image-png" | "image-jpeg" | "image-webp" | "image-avif" | "image-gif" | "image-ico"
  | "image-bmp" | "image-tiff" | "image-dds" | "image-svg" | "image-tga" | "image-ppm" | "image-psd"
  | "image-icns" | "image-pbm" | "image-pgm" | "image-pam" | "image-xbm"
  | "image-qoi" | "image-farbfeld" | "image-pcx" | "image-xpm" | "image-wbmp" | "image-psb"
  | "audio-m4b" | "audio-opus" | "audio-weba"
  | "video-3gp" | "video-3g2" | "video-ogv"
  | "ott" | "otp" | "ots" | "otg" | "fodt" | "fods" | "fodp" | "sxw" | "sxc" | "sxi"
  | "tcx" | "dbf" | "sla" | "fig" | "plt" | "wpl" | "xspf"
  | "apk" | "jar" | "war" | "ear" | "ipa"
  | "pdf" | "html" | "markdown" | "text" | "docx" | "docm" | "dotx" | "epub" | "htmlz" | "txtz" | "cbz" | "cbc"
  | "rtf" | "odt" | "odp" | "pptx" | "pptm" | "potx" | "ppsx" | "fb2" | "mobi" | "azw" | "prc" | "pdb" | "azw3" | "azw4" | "tex" | "rst" | "org" | "textile" | "mediawiki" | "asciidoc"
  | "mhtml" | "xhtml" | "ps" | "eps" | "odg" | "svgz" | "abw" | "zabw" | "geojson"
  | "csv" | "json" | "yaml" | "xml" | "xlsx" | "xlsm" | "xltx" | "xltm" | "tsv" | "xls" | "ods" | "toml" | "ini" | "sql" | "properties" | "opml"
  | "audio-aiff" | "audio-au" | "audio-voc"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2"
  | "audio-mp3" | "audio-wav" | "audio-flac" | "audio-ogg" | "audio-oga" | "audio-mp4" | "audio-m4b"
  | "video-webm" | "video-mp4" | "video-mov"
  | "srt" | "vtt" | "lrc" | "ass" | "sbv" | "ttml" | "kml" | "gpx" | "jsonl" | "vcf" | "ics"
  | "txt-base64" | "txt-hex" | "txt-url";

export const TARGET_LABELS: Record<TargetFormat, string> = {
  "image-png": "PNG", "image-jpeg": "JPEG", "image-webp": "WebP", "image-avif": "AVIF", "image-gif": "GIF", "image-ico": "ICO icon",
  "image-bmp": "BMP", "image-tiff": "TIFF", "image-dds": "DDS texture",
  "image-tga": "Targa (TGA)", "image-ppm": "PPM", "image-psd": "Photoshop (PSD)",
  "image-icns": "Apple icon (ICNS)",
  "image-pbm": "PBM bitmap", "image-pgm": "PGM grayscale", "image-pam": "PAM image", "image-xbm": "X11 XBM bitmap",
  "image-qoi": "QOI image", "image-farbfeld": "Farbfeld image", "image-pcx": "PCX image",
  "image-xpm": "XPM pixmap", "image-wbmp": "WBMP bitmap",
  // Not a trace: the SVG carries the picture as an embedded image.
  "image-svg": "SVG (embedded image)",
  pdf: "PDF", html: "HTML", markdown: "Markdown", text: "Plain text", docx: "Word (DOCX)",
  docm: "Word macro (DOCM)", dotx: "Word template (DOTX)",
  pptm: "PowerPoint macro (PPTM)", potx: "PowerPoint template (POTX)", ppsx: "PowerPoint show (PPSX)",
  xlsm: "Excel macro (XLSM)", xltx: "Excel template (XLTX)", xltm: "Excel macro template (XLTM)",
  epub: "EPUB ebook",
  htmlz: "HTMLZ ebook", txtz: "TXTZ ebook", cbz: "Comic Book ZIP (CBZ)", cbc: "Comic Book ZIP (CBC)",
  odp: "OpenDocument presentation",
  mobi: "Kindle MOBI ebook", azw: "Kindle AZW ebook", prc: "PalmDOC (PRC)", pdb: "Palm database (PDB)",
  azw3: "Kindle KF8 ebook (AZW3)", azw4: "Kindle AZW4 ebook",
  tex: "LaTeX (TEX)", rst: "reStructuredText (RST)",
  mhtml: "MHTML archive", xhtml: "XHTML page", ps: "PostScript (PS)",
  eps: "Encapsulated PostScript (EPS)", odg: "OpenDocument drawing (ODG)", svgz: "Compressed SVG (SVGZ)",
  abw: "AbiWord (ABW)", zabw: "Compressed AbiWord (ZABW)", geojson: "GeoJSON",
  org: "Org-mode", textile: "Textile", mediawiki: "MediaWiki", asciidoc: "AsciiDoc",
  rtf: "Rich Text (RTF)", odt: "OpenDocument text (ODT)", pptx: "PowerPoint (PPTX)", fb2: "FictionBook (FB2)",
  csv: "CSV", json: "JSON", yaml: "YAML", xml: "XML", xlsx: "Excel (XLSX)",
  tsv: "TSV", xls: "Excel 97–2003 (XLS)", ods: "OpenDocument sheet (ODS)", toml: "TOML config",
  "audio-aiff": "AIFF", "audio-au": "Sun AU audio", "audio-voc": "Creative Voice audio",
  zip: "ZIP", tar: "TAR", gzip: "GZIP",
  "font-ttf": "TTF", "font-woff": "WOFF", "font-woff2": "WOFF2",
  "audio-mp3": "MP3", "audio-wav": "WAV", "audio-flac": "FLAC",
  "audio-ogg": "OGG audio", "audio-oga": "OGG audio (OGA)", "audio-mp4": "MP4 audio (M4A)", "audio-m4b": "Audiobook (M4B)",
  "video-webm": "WebM video", "video-mp4": "MP4 video", "video-mov": "QuickTime MOV video",
  srt: "SRT subtitles", vtt: "VTT subtitles", lrc: "LRC lyrics", kml: "KML map data", gpx: "GPX GPS tracks",
  ass: "ASS subtitles", sbv: "YouTube SBV", ttml: "TTML subtitles",
  ini: "INI config", sql: "SQL", properties: "Java properties", opml: "OPML outline",
  jsonl: "JSONL (NDJSON)",
  vcf: "vCard contacts", ics: "iCalendar events",
  "txt-base64": "Base64 text", "txt-hex": "Hex text", "txt-url": "URL-encoded text",
  "image-psb": "Photoshop Large (PSB)",
  "audio-opus": "Opus audio", "audio-weba": "WebM audio (WEBA)",
  "video-3gp": "3GP video", "video-3g2": "3G2 video", "video-ogv": "Ogg video (OGV)",
  ott: "OpenDocument text template (OTT)", otp: "OpenDocument presentation template (OTP)",
  ots: "OpenDocument spreadsheet template (OTS)", otg: "OpenDocument drawing template (OTG)",
  fodt: "Flat ODF text (FODT)", fods: "Flat ODF spreadsheet (FODS)", fodp: "Flat ODF presentation (FODP)",
  sxw: "OpenOffice 1.x text (SXW)", sxc: "OpenOffice 1.x spreadsheet (SXC)", sxi: "OpenOffice 1.x presentation (SXI)",
  tcx: "Garmin TCX activity", dbf: "dBASE table (DBF)", sla: "Scribus document (SLA)",
  fig: "Xfig drawing (FIG)", plt: "HPGL plotter file (PLT)", wpl: "Windows Media playlist (WPL)",
  xspf: "XSPF playlist",
  apk: "Android package (APK)", jar: "Java archive (JAR)", war: "Web archive (WAR)",
  ear: "Enterprise archive (EAR)", ipa: "iOS app package (IPA)"
};

/** Image sources can convert to any raster target (canvas). */
const IMAGE_SOURCES: FileType[] = [
  "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif"
];

export const IMAGE_TARGETS: TargetFormat[] = [
  "image-png", "image-jpeg", "image-webp", "image-avif", "image-gif", "image-ico",
  "image-bmp", "image-tiff", "image-dds", "image-svg", "image-tga", "image-ppm", "image-psd",
  "image-icns", "image-pbm", "image-pgm", "image-pam", "image-xbm",
  "image-qoi", "image-farbfeld", "image-pcx", "image-xpm", "image-wbmp"
];

/**
 * Document targets an image can honestly reach through OCR — the text on
 * the picture, rendered into each prose format (same rule as image → text).
 */
const IMAGE_OCR_DOCS: TargetFormat[] = [
  "rst", "abw", "zabw", "xhtml", "mhtml", "ps", "eps", "odg", "azw3", "azw4"
];

/** Extra single-image renderings for the smaller raster rows. */
const IMAGE_SMALL_EXTRA: TargetFormat[] = [...IMAGE_OCR_DOCS, "svgz", "cbz", "cbc"];

/** The shared target list every SVG-ish source can reach. */
const SVG_TARGETS: TargetFormat[] = [
  ...IMAGE_TARGETS.filter((t) => t !== "image-svg"),
  "text", "pdf", "docx", "docm", "dotx", "pptx", "pptm", "potx", "ppsx", "html", "markdown", "odt", "odp", "rtf", "tex",
  ...IMAGE_SMALL_EXTRA,
  "txt-base64", "txt-hex",
  // SVG text is directly extractable, so the prose targets apply without
  // OCR — same rule the document sources follow.
  "epub", "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml", "txt-url"
];

/**
 * Raster images can also be packed into a PDF (smallpdf/pdfresizer), or
 * embedded as a real picture in a Word/PowerPoint page — not a text
 * placeholder, an actual `<w:drawing>`/`<p:pic>` the image round-trips
 * through. "text" is real OCR (tesseract.js, bundled offline engine) —
 * not a filename dump.
 */
const IMAGE_AND_PDF: TargetFormat[] = [
  ...IMAGE_TARGETS, "pdf", "docx", "docm", "dotx", "pptx", "pptm", "potx", "ppsx", "html", "text", "markdown", "odt", "odp", "rtf", "prc", "pdb", "tex", "txt-base64", "txt-hex",
  ...IMAGE_OCR_DOCS, "svgz", "cbz", "cbc",
  // The OCR'd text reaches every prose format the document renderer
  // supports (image → text is real OCR, so each format is honest).
  // EPUB is image-based (photo album), the rest read the recognised text.
  "epub", "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml", "txt-url"
];

/**
 * Prose documents all funnel through HTML, so they can be written back
 * out as any of the document formats — including the Office writers.
 */
const DOC_TARGETS: TargetFormat[] = [
  "html", "markdown", "text", "pdf", "docx", "docm", "dotx", "epub", "htmlz", "txtz", "cbz", "cbc", "rtf", "odt", "pptx", "pptm", "potx", "ppsx", "odp", "mobi", "azw", "prc", "pdb", "fb2", "tex", "rst",
  "org", "textile", "mediawiki", "asciidoc",
  "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw",
  ...IMAGE_TARGETS,
  "txt-base64", "txt-hex", "txt-url", "opml"
];

/** A document target list minus the source's own format. */
function docTargetsExcept(...own: TargetFormat[]): TargetFormat[] {
  return DOC_TARGETS.filter((t) => !own.includes(t));
}

/** An image target list minus the source's own format. */
function imageAndPdfExcept(...own: TargetFormat[]): TargetFormat[] {
  return IMAGE_AND_PDF.filter((t) => !own.includes(t));
}

/**
 * Tabular sources all funnel through CSV, so they share one target list:
 * the data formats plus the document renderings of the same table.
 */
const TABLE_TARGETS: TargetFormat[] = [
  "csv", "tsv", "json", "yaml", "xml", "xlsx", "xlsm", "xltx", "xltm", "xls", "ods", "toml", "ini", "sql", "properties", "opml", "jsonl", "vcf", "ics", "geojson",
  "html", "markdown", "text", "pdf", "docx", "epub", "rtf", "odt", "odp", "pptx", "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "txt-url", "azw3", "azw4", "abw", "zabw",
  "mhtml", "xhtml", "ps", "eps", "odg", "svgz",
  ...IMAGE_TARGETS,
  "txt-base64", "txt-hex"
];

/** A table target list minus the source's own format. */
function tableTargetsExcept(...own: TargetFormat[]): TargetFormat[] {
  return TABLE_TARGETS.filter((t) => !own.includes(t));
}

/** Extra spreadsheet/data renderings every record-shaped source can produce. */
const RECORD_EXTRAS: TargetFormat[] = ["tsv", "xls", "ods", "xlsm", "xltx", "xltm", "toml", "ini", "sql", "properties", "jsonl"];

/** The document renderings every record-shaped source can produce. */
const RECORD_DOCS: TargetFormat[] = [
  "html", "markdown", "text", "docx", "epub", "rtf", "odt", "odp", "pptx", "mobi", "azw", "fb2",
  "org", "textile", "mediawiki", "asciidoc", "htmlz", "txtz", "opml", "txt-url", "txt-base64", "txt-hex",
  "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "pdf"
];

/** A record source's full target list: tables + docs, minus its own format. */
function recordTargets(...own: TargetFormat[]): TargetFormat[] {
  const targets: TargetFormat[] = ["csv", "json", "xlsx", "vcf", "ics", "geojson", ...RECORD_EXTRAS, ...RECORD_DOCS];
  return targets.filter((t) => !own.includes(t));
}

/** Subtitle sources get the record targets minus the contact/calendar ones. */
function subtitleTargets(...own: TargetFormat[]): TargetFormat[] {
  const targets: TargetFormat[] = [...recordTargets(), "srt", "vtt", "lrc", "ass", "sbv", "ttml"];
  return targets.filter((t) => t !== "vcf" && t !== "ics" && t !== "geojson" && !own.includes(t));
}

export const MATRIX: Record<FileType, TargetFormat[]> = {
  "image-png": IMAGE_AND_PDF,
  "image-jpeg": IMAGE_AND_PDF,
  "image-webp": IMAGE_AND_PDF,
  "image-gif": IMAGE_AND_PDF,
  "image-bmp": IMAGE_AND_PDF,
  "image-avif": IMAGE_AND_PDF,
  // HEIC photos decode through the bundled libheif WASM — every raster and
  // document target, but never a HEIC back out (no honest local encoder).
  "image-heic": IMAGE_AND_PDF,
  "image-svg": SVG_TARGETS,
  // TIFF → TIFF is a real re-encode (through the canvas pipeline, same
  // as PNG→PNG above) — not a no-op, so it's not filtered out like the
  // other single-purpose raster containers below.
  "image-tiff": IMAGE_AND_PDF,
  // Every smaller raster format decodes to pixels first, then runs the
  // exact same pipeline as the main image sources — the full image+document
  // reach is honest (including the OCR prose and image-based EPUB).
  "image-ico": imageAndPdfExcept("image-ico"),
  // Photoshop Large Document (PSB) is the same 8BPS family with 8-byte
  // section lengths — the flattened composite reads exactly like PSD.
  "image-psb": imageAndPdfExcept("image-psb"),
  "image-dds": imageAndPdfExcept("image-dds"),
  "image-tga": imageAndPdfExcept("image-tga"),
  "image-ppm": imageAndPdfExcept("image-ppm"),
  "image-psd": imageAndPdfExcept("image-psd"),
  "image-icns": imageAndPdfExcept("image-icns"),
  "image-pbm": imageAndPdfExcept("image-pbm"),
  "image-pgm": imageAndPdfExcept("image-pgm"),
  "image-pam": imageAndPdfExcept("image-pam"),
  "image-xbm": imageAndPdfExcept("image-xbm"),
  "image-qoi": imageAndPdfExcept("image-qoi"),
  "image-farbfeld": imageAndPdfExcept("image-farbfeld"),
  "image-pcx": imageAndPdfExcept("image-pcx"),
  "image-xpm": imageAndPdfExcept("image-xpm"),
  "image-wbmp": imageAndPdfExcept("image-wbmp"),
  pdf: ["text", "markdown", "html", ...IMAGE_TARGETS, "cbz", "cbc", "docx", "docm", "dotx", "epub", "htmlz", "txtz", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "txt-base64", "txt-hex", "txt-url", "opml"],
  docx: ["html", "markdown", "text", "pdf", "docm", "dotx", "epub", "htmlz", "txtz", "csv", "xlsx", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "txt-base64", "txt-hex", "txt-url", "opml", ...IMAGE_TARGETS],
  docm: ["html", "markdown", "text", "pdf", "docx", "dotx", "epub", "htmlz", "txtz", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "txt-base64", "txt-hex", "txt-url", "opml", ...IMAGE_TARGETS],
  dotx: ["html", "markdown", "text", "pdf", "docx", "docm", "epub", "htmlz", "txtz", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "txt-base64", "txt-hex", "txt-url", "opml", ...IMAGE_TARGETS],
  xlsx: tableTargetsExcept("xlsx"),
  xlsm: [...tableTargetsExcept("xlsx", "xlsm", "xltx", "xltm"), "xlsx"],
  xls: tableTargetsExcept("xls"),
  ods: tableTargetsExcept("ods"),
  epub: docTargetsExcept("epub"),
  rtf: docTargetsExcept("rtf"),
  odt: docTargetsExcept("odt"),
  odp: docTargetsExcept("odp"),
  pptx: docTargetsExcept("pptx"),
  pptm: docTargetsExcept("pptm"),
  potx: docTargetsExcept("potx"),
  ppsx: docTargetsExcept("ppsx"),
  fb2: docTargetsExcept("fb2"),
  mobi: docTargetsExcept("mobi"),
  azw: docTargetsExcept("azw"),
  prc: docTargetsExcept("prc", "pdb"),
  pdb: docTargetsExcept("pdb"),
  azw3: docTargetsExcept("azw3"),
  snb: docTargetsExcept(),
  rb: docTargetsExcept(),
  fb3: docTargetsExcept(),
  // AZW4 is a Kindle container wrapping a PDF — the whole PDF pipeline is
  // honest from it (extract the drawing), same reach as the pdf row.
  // AZW4 routes through the full PDF pipeline (runConversion("pdf", …)),
  // so the pdf row's every target is honestly reachable.
  azw4: ["pdf", "text", "markdown", "html", ...IMAGE_TARGETS, "cbz", "cbc", "docx", "docm", "dotx", "epub", "htmlz", "txtz", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "svgz", "abw", "zabw", "txt-base64", "txt-hex", "txt-url", "opml"],
  htmlz: docTargetsExcept("htmlz"),
  txtz: docTargetsExcept("txtz"),
  // Comic pages reach prose targets by OCR-ing every page (real tesseract.js,
  // not a filename dump) — the same rule the image sources use. EPUB is the
  // image-based comic book; the other prose targets read the OCR text.
  cbz: ["pdf", "epub", "html", "docx", "docm", "dotx", "cbc", "text", "markdown", "rst", "abw", "zabw", "xhtml", "mhtml", "ps", "eps", "odg", "azw3", "azw4", "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml", "txt-url", ...IMAGE_TARGETS],
  cbc: ["pdf", "epub", "html", "docx", "docm", "dotx", "cbz", "text", "markdown", "rst", "abw", "zabw", "xhtml", "mhtml", "ps", "eps", "odg", "azw3", "azw4", "mobi", "azw", "fb2", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml", "txt-url", ...IMAGE_TARGETS],
  dxf: ["pdf", "html", "text", "markdown", "docx", "docm", "dotx", "epub", "htmlz", "txtz", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "cbc", "txt-base64", "txt-hex", "txt-url", "opml", ...IMAGE_TARGETS],
  // Illustrator files carry a PDF payload since CS6, so every document
  // and raster target is honestly reachable through the PDF pipeline
  // (docTargetsExcept already includes the "copy the drawing" → pdf).
  ai: docTargetsExcept(),
  html: ["markdown", "text", "pdf", "docx", "docm", "dotx", "epub", "htmlz", "txtz", "csv", "xlsx", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "txt-base64", "txt-hex", "txt-url", "opml", ...IMAGE_TARGETS],
  markdown: ["html", "text", "pdf", "docx", "docm", "dotx", "epub", "htmlz", "txtz", "csv", "xlsx", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "org", "textile", "mediawiki", "asciidoc", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "txt-base64", "txt-hex", "txt-url", "opml", ...IMAGE_TARGETS],
  rst: docTargetsExcept("rst"),
  tex: docTargetsExcept("tex"),
  abw: docTargetsExcept("abw"),
  zabw: docTargetsExcept("zabw"),
  oeb: docTargetsExcept(),
  pml: docTargetsExcept(),
  // OpenDocument drawings hold their text in the same text:h/p tags as
  // ODT — every prose target is honestly reachable.
  odg: docTargetsExcept("odg"),
  // .dot/.wps/.doc are content-sniffed at conversion time: text/RTF/HTML/XML
  // payloads convert, binary Word/Works containers throw an honest error.
  dot: docTargetsExcept(),
  wps: docTargetsExcept(),
  doc: docTargetsExcept(),
  // .et (WPS Spreadsheet) is sniffed the same way: OOXML zip → xlsx,
  // OLE2 workbook → xls, CSV text → table. Binary containers error.
  et: recordTargets(),
  // Apple Numbers is a ZIP package like Pages — the IWA text extraction
  // yields the sheet's strings, so the full text-based document set is
  // honestly reachable (the same rule every prose source follows).
  numbers: docTargetsExcept(),
  geojson: recordTargets("geojson"),
  // Apple Pages: text comes from the embedded IWA/QuickLook data, so the
  // full prose document set applies — including the raster render of the
  // extracted text (the same rule ppt/key follow).
  pages: docTargetsExcept(),
  // Apple Keynote: the same iWork container as Pages — the slide text
  // reads out of the IWA/XML blobs, and renders into real presentation
  // files (pptx/odp) exactly like the other text-based sources.
  key: docTargetsExcept(),
  // Legacy binary PowerPoint: the OLE2 text records are readable, so the
  // same text-based document targets are honestly reachable, and the text
  // renders into real presentation files too (pptx/odp via the HTML pipe).
  ppt: docTargetsExcept(),
  // XPS documents: ZIP packages whose FixedPage <Glyphs> carry the text —
  // the full prose document set, like the other text-based readers.
  xps: docTargetsExcept(),
  // Microsoft Publisher: OOXML run text or OLE2 Quill-stream prose.
  pub: docTargetsExcept(),
  // Windows metafiles: the supported record subset renders to SVG, and
  // the text records read as prose for every document target.
  emf: docTargetsExcept(),
  wmf: docTargetsExcept(),
  cgm: docTargetsExcept(),
  chm: docTargetsExcept(),
  // Microsoft Reader: the LZX-compressed binary-HTML content reads as prose
  // for every document target, like CHM.
  lit: docTargetsExcept(),
  // sK1/Sketch vector drawings: basic shapes render to SVG, text objects
  // read as prose, plain-text fallback for anything unparseable.
  sk1: docTargetsExcept(),
  // Shockwave Flash: the DefineText/DefineText2 character runs read as
  // prose for every document target.
  swf: docTargetsExcept(),
  // Hangul Word Processor (HWPX/HWP): the ZIP packaging's HWPML runs.
  hwpx: docTargetsExcept(),
  hwp: docTargetsExcept(),
  // Sony BBeB (LRF): the zlib/UTF-16 text streams read as prose.
  lrf: docTargetsExcept(),
  // WordPerfect: the character stream reads as prose.
  wpd: docTargetsExcept(),
  // WPS Presentation: content-sniffed like .et — an OOXML zip behaves as
  // pptx (full reach), a binary OLE2 deck as ppt (text extraction).
  dps: docTargetsExcept(),
  // Legacy OLE2 office documents (StarWriter/StarCalc/StarDraw, Visio):
  // the body text reads out of the document stream, so the text-based
  // targets apply — same rule as the Apple iWork readers.
  // Legacy OLE2 office documents funnel through the shared document
  // renderer, so the full prose document set is honestly reachable.
  sdw: docTargetsExcept(),
  sdc: docTargetsExcept(),
  sda: docTargetsExcept(),
  vsd: docTargetsExcept(),
  // Psion TCR: a zlib-compressed text file — decompress and read as text.
  tcr: docTargetsExcept(),
  // OpenDocument template flavours (ott/otp/otg) and OpenOffice 1.x packages
  // (sxw/sxi) share the same content.xml body — the full prose set applies.
  ott: docTargetsExcept("ott"),
  otp: docTargetsExcept("otp"),
  otg: docTargetsExcept("otg"),
  sxw: docTargetsExcept("sxw"),
  sxi: docTargetsExcept("sxi"),
  // Flat ODF (fodt/fodp) is the same body XML in a single file.
  fodt: docTargetsExcept("fodt"),
  fodp: docTargetsExcept("fodp"),
  // ODF spreadsheet flavours (ots/sxc) and flat ODS (fods) share the same
  // table:table-row structure — the full table target set applies.
  ots: tableTargetsExcept("ots"),
  sxc: tableTargetsExcept("sxc"),
  fods: tableTargetsExcept("fods"),
  // Scribus (SLA): the zip's document.xml ITEXT runs read as prose.
  sla: docTargetsExcept("sla"),
  // Xfig / HPGL drawings: the text records read as prose.
  fig: docTargetsExcept("fig"),
  plt: docTargetsExcept("plt"),
  xhtml: docTargetsExcept("xhtml"),
  mhtml: docTargetsExcept("mhtml"),
  svgz: SVG_TARGETS.filter((t) => t !== "svgz"),
  text: ["txt-base64", "txt-hex", "txt-url", "pdf", "docx", "docm", "dotx", "html", "markdown", "epub", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "cbz", "cbc", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml", ...IMAGE_TARGETS],
  csv: tableTargetsExcept("csv"),
  json: tableTargetsExcept("json"),
  tsv: tableTargetsExcept("tsv"),
  yaml: tableTargetsExcept("yaml"),
  // XML is treated as a table source (xmlToCsv is the shared reader), so
  // the full data + document target set is honestly reachable.
  xml: tableTargetsExcept("xml"),
  ini: ["json", "yaml", "xml", "text", "markdown", "toml", "txt-base64", "txt-hex"],
  toml: ["json", "yaml", "xml", "csv", "markdown", "text", "txt-base64", "txt-hex"],
  qif: recordTargets(),
  ofx: recordTargets(),
  gedcom: recordTargets(),
  mbox: recordTargets(),
  ldif: recordTargets(),
  cue: recordTargets(),
  // Camera RAW sources funnel through their embedded JPEG preview (see
  // raw-photo.ts), so they share the same target list as any other photo.
  "raw-cr2": IMAGE_AND_PDF,
  "raw-nef": IMAGE_AND_PDF,
  "raw-arw": IMAGE_AND_PDF,
  "raw-dng": IMAGE_AND_PDF,
  "raw-orf": IMAGE_AND_PDF,
  "raw-pef": IMAGE_AND_PDF,
  "raw-rw2": IMAGE_AND_PDF,
  "raw-dcr": IMAGE_AND_PDF,
  "raw-erf": IMAGE_AND_PDF,
  "raw-3fr": IMAGE_AND_PDF,
  "raw-mos": IMAGE_AND_PDF,
  "raw-raf": IMAGE_AND_PDF,
  "raw-cr3": IMAGE_AND_PDF,
  "raw-crw": IMAGE_AND_PDF,
  "raw-mrw": IMAGE_AND_PDF,
  "raw-x3f": IMAGE_AND_PDF,
  // EPS/PS: honest only when the file carries the "DOS EPS" binary
  // wrapper's embedded TIFF preview (see eps.ts) — plain PostScript with
  // no preview throws a clear per-file error at conversion time.
  eps: imageAndPdfExcept("eps"),
  ps: imageAndPdfExcept("ps"),
  // A ZIP of image files IS a comic archive — pack the pages the same way
  // the .cbz source does.
  zip: ["tar", "gzip", "text", "json", "cbz", "cbc", "txt-base64", "txt-hex"],
  // App packages (APK/JAR/WAR/EAR/IPA) are ZIP containers — extract the
  // entries into another archive, or list them as text/JSON.
  apk: ["zip", "tar", "gzip", "text", "json", "txt-base64", "txt-hex"],
  jar: ["zip", "tar", "gzip", "text", "json", "txt-base64", "txt-hex"],
  war: ["zip", "tar", "gzip", "text", "json", "txt-base64", "txt-hex"],
  ear: ["zip", "tar", "gzip", "text", "json", "txt-base64", "txt-hex"],
  ipa: ["zip", "tar", "gzip", "text", "json", "txt-base64", "txt-hex"],
  tar: ["zip", "gzip", "text", "json", "txt-base64", "txt-hex"],
  gzip: ["zip", "tar", "text", "txt-base64", "txt-hex"],
  "font-ttf": ["font-woff", "font-woff2", "txt-base64", "txt-hex"],
  "font-woff": ["font-ttf", "font-woff2", "txt-base64", "txt-hex"],
  "font-woff2": ["font-ttf", "font-woff", "txt-base64", "txt-hex"],
  "font-otf": ["font-ttf", "font-woff", "font-woff2", "txt-base64", "txt-hex"],
  // M4B audiobooks, raw Opus and WebM audio decode through the same Web
  // Audio pipeline as the other non-WAV audio sources.
  "audio-m4b": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-opus": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-weba": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-midi": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-mp3": ["audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-wav": ["audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-ogg": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-m4a": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-flac": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-aiff": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-aac": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-au": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  "audio-voc": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "audio-voc", "txt-base64", "txt-hex"],
  // A video frame is captured as a PNG, then any raster target reaches
  // it through the same canvas pipeline still images use (see
  // convert.ts) — every IMAGE_TARGETS format is honestly reachable,
  // not just the animated-GIF and single-frame PNG/JPEG the earlier
  // batches shipped.
  "video-mp4": [...IMAGE_TARGETS, "video-webm", "video-mp4", "video-mov", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  "video-webm": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  "video-mov": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  // 3GP/3G2 (mobile ISO-BMFF) and Ogg video (OGV) take the same media
  // pipeline — but there's no honest remux to MOV for them, so the
  // video-mov target is not offered.
  "video-3gp": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  "video-3g2": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  "video-ogv": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  // MKV (Matroska) and MPEG transport streams (TS/M2TS/MTS/MOD) decode
  // through the same <video> media pipeline — same honest reach as the
  // other containers (image targets via frame grab, audio via track
  // extraction), minus the MP4-only MOV remux.
  "video-mkv": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  "video-ts": [...IMAGE_TARGETS, "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-oga", "audio-mp4", "audio-m4b", "audio-au", "txt-base64", "txt-hex"],
  // AMR is deliberately NOT in the matrix: Chromium's Android ffmpeg build
  // has no AMR decoder, so decodeAudioData can't decode it — the <audio>
  // element could (via MediaPlayer) but the converter pipeline can't. The
  // file is detected so the app can say "AMR — no local conversion yet",
  // but advertising targets would be dishonest. Needs the native layer.
  "audio-amr": [],
  // Base64/hex can hold ANY file — decode to bytes, sniff the real format,
  // then convert it like that format (image → all raster targets, etc.).
  "text-base64": [...IMAGE_TARGETS, ...RECORD_DOCS],
  "text-hex": [...IMAGE_TARGETS, ...RECORD_DOCS],
  opml: recordTargets("opml"),
  plist: recordTargets(),
  // A URL-encoded text file IS text — decode it, then every target the
  // text source reaches applies (same rule the base64/hex sources follow).
  "text-url": ["text", "pdf", "docx", "docm", "dotx", "html", "markdown", "epub", "rtf", "odt", "odp", "pptx", "pptm", "potx", "ppsx", "fb2", "mobi", "azw", "prc", "pdb", "tex", "rst", "mhtml", "xhtml", "ps", "eps", "odg", "azw3", "azw4", "svgz", "abw", "zabw", "cbz", "cbc", "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "opml", ...IMAGE_TARGETS, "txt-base64", "txt-hex"],
  vcf: recordTargets("vcf"),
  ics: recordTargets("ics"),
  srt: subtitleTargets("srt"),
  vtt: subtitleTargets("vtt"),
  gpx: [...recordTargets(), "kml"],
  // Garmin TCX: trackpoint records like GPX.
  tcx: recordTargets(),
  // dBASE tables read as rows of key/value records.
  dbf: recordTargets(),
  // WPL and XSPF playlists read as media records.
  wpl: recordTargets("wpl"),
  xspf: recordTargets("xspf"),
  lrc: subtitleTargets("lrc"),
  sitemap: recordTargets(),
  rss: recordTargets(),
  kml: [...recordTargets(), "gpx"],
  bookmarks: recordTargets(),
  bibtex: recordTargets(),
  jsonl: recordTargets("jsonl"),
  m3u: recordTargets(),
  eml: recordTargets(),
  torrent: recordTargets(),
  ssv: recordTargets(),
  psv: recordTargets(),
  dif: recordTargets(),
  gnumeric: recordTargets(),
  unknown: []
};

/** Whether a target is achievable from the given source, honestly. */
export function targetsFor(source: FileType): TargetFormat[] {
  return MATRIX[source] ?? [];
}

/** Best extension for a target format (used for the output filename). */
export function targetExtension(target: TargetFormat): string {
  switch (target) {
    case "image-png": return "png";
    case "image-jpeg": return "jpg";
    case "image-webp": return "webp";
    case "image-avif": return "avif";
    case "image-gif": return "gif";
    case "image-ico": return "ico";
    case "image-bmp": return "bmp";
    case "image-tiff": return "tiff";
    case "image-dds": return "dds";
    case "image-svg": return "svg";
    case "image-tga": return "tga";
    case "image-ppm": return "ppm";
    case "image-psd": return "psd";
    case "image-icns": return "icns";
    case "image-pbm": return "pbm";
    case "image-pgm": return "pgm";
    case "image-pam": return "pam";
    case "image-xbm": return "xbm";
    case "image-qoi": return "qoi";
    case "image-farbfeld": return "ff";
    case "image-pcx": return "pcx";
    case "image-xpm": return "xpm";
    case "image-wbmp": return "wbmp";
    case "mobi": return "mobi";
    case "azw": return "azw";
    case "prc": return "prc";
    case "pdb": return "pdb";
    case "tex": return "tex";
    case "docm": return "docm";
    case "dotx": return "dotx";
    case "pptm": return "pptm";
    case "potx": return "potx";
    case "ppsx": return "ppsx";
    case "xlsm": return "xlsm";
    case "xltx": return "xltx";
    case "xltm": return "xltm";
    case "htmlz": return "htmlz";
    case "txtz": return "txtz";
    case "org": return "org";
    case "textile": return "textile";
    case "mediawiki": return "mediawiki";
    case "asciidoc": return "adoc";
    case "rtf": return "rtf";
    case "odt": return "odt";
    case "odp": return "odp";
    case "pptx": return "pptx";
    case "fb2": return "fb2";
    case "tsv": return "tsv";
    case "xls": return "xls";
    case "ods": return "ods";
    case "toml": return "toml";
    case "ini": return "ini";
    case "sql": return "sql";
    case "properties": return "properties";
    case "opml": return "opml";
    case "audio-aiff": return "aiff";
    case "audio-au": return "au";
    case "audio-voc": return "voc";
    case "pdf": return "pdf";
    case "html": return "html";
    case "markdown": return "md";
    case "text": return "txt";
    case "docx": return "docx";
    case "epub": return "epub";
    case "csv": return "csv";
    case "json": return "json";
    case "xlsx": return "xlsx";
    case "yaml": return "yaml";
    case "xml": return "xml";
    case "zip": return "zip";
    case "tar": return "tar";
    case "gzip": return "gz";
    case "font-ttf": return "ttf";
    case "font-woff": return "woff";
    case "font-woff2": return "woff2";
    case "audio-mp3": return "mp3";
    case "audio-wav": return "wav";
    case "audio-flac": return "flac";
    case "audio-ogg": return "ogg";
    case "audio-oga": return "oga";
    case "audio-mp4": return "mp4";
    case "audio-m4b": return "m4b";
    case "video-webm": return "webm";
    case "video-mp4": return "mp4";
    case "video-mov": return "mov";
    case "srt": return "srt";
    case "vtt": return "vtt";
    case "lrc": return "lrc";
    case "ass": return "ass";
    case "sbv": return "sbv";
    case "ttml": return "ttml";
    case "kml": return "kml";
    case "gpx": return "gpx";
    case "jsonl": return "jsonl";
    case "vcf": return "vcf";
    case "ics": return "ics";
    case "txt-base64": return "txt";
    case "txt-hex": return "txt";
    case "txt-url": return "txt";
    case "image-psb": return "psb";
    case "audio-opus": return "opus";
    case "audio-weba": return "weba";
    case "video-3gp": return "3gp";
    case "video-3g2": return "3g2";
    case "video-ogv": return "ogv";
    case "ott": return "ott";
    case "otp": return "otp";
    case "ots": return "ots";
    case "otg": return "otg";
    case "fodt": return "fodt";
    case "fods": return "fods";
    case "fodp": return "fodp";
    case "sxw": return "sxw";
    case "sxc": return "sxc";
    case "sxi": return "sxi";
    case "tcx": return "tcx";
    case "dbf": return "dbf";
    case "sla": return "sla";
    case "fig": return "fig";
    case "plt": return "plt";
    case "wpl": return "wpl";
    case "xspf": return "xspf";
    case "apk": return "apk";
    case "jar": return "jar";
    case "war": return "war";
    case "ear": return "ear";
    case "ipa": return "ipa";
    case "cbz": return "cbz";
    case "cbc": return "cbc";
    case "rst": return "rst";
    case "azw3": return "azw3";
    case "azw4": return "azw4";
    case "mhtml": return "mhtml";
    case "abw": return "abw";
    case "zabw": return "zabw";
    case "geojson": return "geojson";
    case "xhtml": return "xhtml";
    case "ps": return "ps";
    case "eps": return "eps";
    case "odg": return "odg";
    case "svgz": return "svgz";
  }
}
