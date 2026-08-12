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
  | "image-icns"
  | "pdf" | "html" | "markdown" | "text" | "docx" | "epub"
  | "rtf" | "odt" | "pptx" | "fb2"
  | "csv" | "json" | "yaml" | "xml" | "xlsx" | "tsv" | "xls" | "ods" | "toml"
  | "audio-aiff"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2"
  | "audio-mp3" | "audio-wav" | "audio-flac" | "audio-ogg" | "audio-mp4"
  | "video-webm" | "video-mp4"
  | "srt" | "vtt" | "lrc" | "kml" | "gpx" | "jsonl"
  | "txt-base64" | "txt-hex" | "txt-url";

export const TARGET_LABELS: Record<TargetFormat, string> = {
  "image-png": "PNG", "image-jpeg": "JPEG", "image-webp": "WebP", "image-avif": "AVIF", "image-gif": "GIF", "image-ico": "ICO icon",
  "image-bmp": "BMP", "image-tiff": "TIFF", "image-dds": "DDS texture",
  "image-tga": "Targa (TGA)", "image-ppm": "PPM", "image-psd": "Photoshop (PSD)",
  "image-icns": "Apple icon (ICNS)",
  // Not a trace: the SVG carries the picture as an embedded image.
  "image-svg": "SVG (embedded image)",
  pdf: "PDF", html: "HTML", markdown: "Markdown", text: "Plain text", docx: "Word (DOCX)", epub: "EPUB ebook",
  rtf: "Rich Text (RTF)", odt: "OpenDocument text (ODT)", pptx: "PowerPoint (PPTX)", fb2: "FictionBook (FB2)",
  csv: "CSV", json: "JSON", yaml: "YAML", xml: "XML", xlsx: "Excel (XLSX)",
  tsv: "TSV", xls: "Excel 97–2003 (XLS)", ods: "OpenDocument sheet (ODS)", toml: "TOML config",
  "audio-aiff": "AIFF",
  zip: "ZIP", tar: "TAR", gzip: "GZIP",
  "font-ttf": "TTF", "font-woff": "WOFF", "font-woff2": "WOFF2",
  "audio-mp3": "MP3", "audio-wav": "WAV", "audio-flac": "FLAC",
  "audio-ogg": "OGG audio", "audio-mp4": "MP4 audio (M4A)",
  "video-webm": "WebM video", "video-mp4": "MP4 video",
  srt: "SRT subtitles", vtt: "VTT subtitles", lrc: "LRC lyrics", kml: "KML map data", gpx: "GPX GPS tracks",
  jsonl: "JSONL (NDJSON)",
  "txt-base64": "Base64 text", "txt-hex": "Hex text", "txt-url": "URL-encoded text"
};

/** Image sources can convert to any raster target (canvas). */
const IMAGE_SOURCES: FileType[] = [
  "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif"
];

const IMAGE_TARGETS: TargetFormat[] = [
  "image-png", "image-jpeg", "image-webp", "image-avif", "image-gif", "image-ico",
  "image-bmp", "image-tiff", "image-dds", "image-svg", "image-tga", "image-ppm", "image-psd",
  "image-icns"
];

/** Raster images can also be packed into a PDF (smallpdf/pdfresizer). */
const IMAGE_AND_PDF: TargetFormat[] = [...IMAGE_TARGETS, "pdf", "txt-base64", "txt-hex"];

/**
 * Prose documents all funnel through HTML, so they can be written back
 * out as any of the document formats — including the Office writers.
 */
const DOC_TARGETS: TargetFormat[] = [
  "html", "markdown", "text", "pdf", "docx", "epub", "rtf", "odt", "pptx", "txt-base64", "txt-hex"
];

/** A document target list minus the source's own format. */
function docTargetsExcept(...own: TargetFormat[]): TargetFormat[] {
  return DOC_TARGETS.filter((t) => !own.includes(t));
}

/**
 * Tabular sources all funnel through CSV, so they share one target list:
 * the data formats plus the document renderings of the same table.
 */
const TABLE_TARGETS: TargetFormat[] = [
  "csv", "tsv", "json", "yaml", "xml", "xlsx", "xls", "ods",
  "html", "markdown", "pdf", "docx", "epub", "rtf", "odt", "txt-base64", "txt-hex"
];

/** A table target list minus the source's own format. */
function tableTargetsExcept(...own: TargetFormat[]): TargetFormat[] {
  return TABLE_TARGETS.filter((t) => !own.includes(t));
}

/** Extra spreadsheet renderings every record-shaped source can produce. */
const RECORD_EXTRAS: TargetFormat[] = ["tsv", "xls", "ods"];

export const MATRIX: Record<FileType, TargetFormat[]> = {
  "image-png": IMAGE_AND_PDF,
  "image-jpeg": IMAGE_AND_PDF,
  "image-webp": IMAGE_AND_PDF,
  "image-gif": IMAGE_AND_PDF,
  "image-bmp": IMAGE_AND_PDF,
  "image-avif": IMAGE_AND_PDF,
  "image-svg": [...IMAGE_TARGETS.filter((t) => t !== "image-svg"), "text", "pdf", "txt-base64", "txt-hex"],
  "image-tiff": [...IMAGE_TARGETS.filter((t) => t !== "image-tiff"), "pdf", "txt-base64", "txt-hex"],
  "image-ico": [...IMAGE_TARGETS.filter((t) => t !== "image-ico"), "pdf", "txt-base64", "txt-hex"],
  "image-dds": [...IMAGE_TARGETS.filter((t) => t !== "image-dds"), "pdf", "txt-base64", "txt-hex"],
  "image-tga": [...IMAGE_TARGETS.filter((t) => t !== "image-tga"), "pdf", "txt-base64", "txt-hex"],
  "image-ppm": [...IMAGE_TARGETS.filter((t) => t !== "image-ppm"), "pdf", "txt-base64", "txt-hex"],
  "image-psd": [...IMAGE_TARGETS.filter((t) => t !== "image-psd"), "pdf", "txt-base64", "txt-hex"],
  "image-icns": [...IMAGE_TARGETS.filter((t) => t !== "image-icns"), "pdf", "txt-base64", "txt-hex"],
  pdf: ["text", "markdown", "html", "image-png", "image-jpeg", "image-webp", "image-avif", "image-gif", "image-ico", "image-bmp", "image-tiff", "image-svg", "image-psd", "docx", "epub", "rtf", "odt", "pptx", "fb2", "txt-base64", "txt-hex"],
  docx: ["html", "markdown", "text", "pdf", "epub", "csv", "xlsx", "rtf", "odt", "pptx", "fb2", "image-png", "image-jpeg", "txt-base64", "txt-hex"],
  docm: ["html", "markdown", "text", "pdf", "docx", "epub", "rtf", "odt", "pptx", "fb2", "txt-base64", "txt-hex"],
  dotx: ["html", "markdown", "text", "pdf", "docx", "epub", "rtf", "odt", "pptx", "fb2", "txt-base64", "txt-hex"],
  xlsx: tableTargetsExcept("xlsx").concat("image-png", "image-jpeg"),
  xlsm: tableTargetsExcept("xlsx"),
  xls: tableTargetsExcept("xls").concat("image-png", "image-jpeg"),
  ods: tableTargetsExcept("ods"),
  epub: ["html", "text", "markdown", "pdf", "docx", "rtf", "odt", "pptx", "fb2", "image-png", "image-jpeg", "txt-base64", "txt-hex"],
  rtf: docTargetsExcept("rtf").concat("fb2"),
  odt: docTargetsExcept("odt").concat("fb2"),
  odp: docTargetsExcept("odt", "pptx").concat("pptx", "fb2"),
  pptx: docTargetsExcept("pptx").concat("fb2", "image-png", "image-jpeg"),
  pptm: docTargetsExcept().concat("pptx", "fb2"),
  potx: docTargetsExcept().concat("pptx", "fb2"),
  ppsx: docTargetsExcept().concat("pptx", "fb2"),
  fb2: docTargetsExcept(),
  mobi: docTargetsExcept().concat("image-png", "image-jpeg"),
  azw: docTargetsExcept(),
  prc: docTargetsExcept(),
  htmlz: docTargetsExcept(),
  txtz: docTargetsExcept(),
  cbz: ["pdf", "epub"],
  dxf: ["pdf"],
  html: ["markdown", "text", "pdf", "docx", "epub", "csv", "xlsx", "rtf", "odt", "pptx", "fb2", "image-png", "image-jpeg", "txt-base64", "txt-hex"],
  markdown: ["html", "text", "pdf", "docx", "epub", "csv", "xlsx", "rtf", "odt", "pptx", "fb2", "txt-base64", "txt-hex"],
  rst: docTargetsExcept().concat("fb2"),
  tex: docTargetsExcept().concat("fb2"),
  abw: docTargetsExcept().concat("fb2"),
  zabw: docTargetsExcept().concat("fb2"),
  oeb: docTargetsExcept().concat("fb2"),
  pml: docTargetsExcept(),
  text: ["txt-base64", "txt-hex", "txt-url", "pdf", "docx", "html", "markdown", "epub", "rtf", "odt", "pptx", "fb2", "image-png", "image-jpeg"],
  csv: [...tableTargetsExcept("csv"), "jsonl", "image-png", "image-jpeg"],
  json: [...tableTargetsExcept("json"), "text", "jsonl", "toml"],
  tsv: [...tableTargetsExcept("tsv"), "jsonl"],
  yaml: [...tableTargetsExcept("yaml"), "toml"],
  xml: ["json", "text", "yaml", "html", "markdown", "csv", "xlsx", "txt-base64", "txt-hex"],
  ini: ["json", "yaml", "xml", "text", "markdown", "toml", "txt-base64", "txt-hex"],
  toml: ["json", "yaml", "xml", "csv", "markdown", "text", "txt-base64", "txt-hex"],
  qif: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  ofx: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  gedcom: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  mbox: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  ldif: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  cue: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
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
  zip: ["tar", "gzip", "text", "json", "txt-base64", "txt-hex"],
  tar: ["zip", "gzip", "text", "json", "txt-base64", "txt-hex"],
  gzip: ["zip", "tar", "text", "txt-base64", "txt-hex"],
  "font-ttf": ["font-woff", "font-woff2", "txt-base64", "txt-hex"],
  "font-woff": ["font-ttf", "font-woff2", "txt-base64", "txt-hex"],
  "font-woff2": ["font-ttf", "font-woff", "txt-base64", "txt-hex"],
  "font-otf": ["font-ttf", "font-woff", "font-woff2", "txt-base64", "txt-hex"],
  "audio-midi": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-mp3": ["audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-wav": ["audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-ogg": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-m4a": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-flac": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-aiff": ["audio-wav", "audio-mp3", "audio-flac", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "audio-aac": ["audio-wav", "audio-mp3", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "video-mp4": ["image-gif", "image-png", "image-jpeg", "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "video-webm": ["image-gif", "image-png", "image-jpeg", "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "video-mov": ["image-gif", "image-png", "image-jpeg", "video-webm", "video-mp4", "audio-mp3", "audio-wav", "audio-flac", "audio-aiff", "audio-ogg", "audio-mp4", "txt-base64", "txt-hex"],
  "text-base64": ["text", "pdf"],
  "text-hex": ["text", "pdf"],
  "text-url": ["text", "pdf"],
  vcf: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  ics: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  srt: ["vtt", "lrc", "text", "csv", "json", "xlsx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  vtt: ["srt", "lrc", "text", "csv", "json", "xlsx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  gpx: ["kml", "csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  lrc: ["srt", "vtt", "text", "csv", "json", "xlsx", ...RECORD_EXTRAS],
  sitemap: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS],
  rss: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS],
  kml: ["gpx", "csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  bookmarks: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  bibtex: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  jsonl: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  m3u: ["csv", "json", "xlsx", "html", "markdown", "text", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  eml: ["text", "html", "markdown", "json", "csv", "pdf", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
  torrent: ["json", "text", "csv", "xlsx", "html", "markdown", "docx", ...RECORD_EXTRAS, "txt-base64", "txt-hex"],
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
    case "rtf": return "rtf";
    case "odt": return "odt";
    case "pptx": return "pptx";
    case "fb2": return "fb2";
    case "tsv": return "tsv";
    case "xls": return "xls";
    case "ods": return "ods";
    case "toml": return "toml";
    case "audio-aiff": return "aiff";
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
    case "audio-mp4": return "mp4";
    case "video-webm": return "webm";
    case "video-mp4": return "mp4";
    case "srt": return "srt";
    case "vtt": return "vtt";
    case "lrc": return "lrc";
    case "kml": return "kml";
    case "gpx": return "gpx";
    case "jsonl": return "jsonl";
    case "txt-base64": return "txt";
    case "txt-hex": return "txt";
    case "txt-url": return "txt";
  }
}
