import type { FileType } from "./detect";

/**
 * The conversion matrix — which target formats each source type can
 * become, and which conversion function handles it. This is the single
 * source of truth the Convert tab's UI renders from, and the honest
 * boundary of what's possible 100% locally.
 */

export type TargetFormat =
  | "image-png" | "image-jpeg" | "image-webp" | "image-avif" | "image-gif" | "image-ico"
  | "pdf" | "html" | "markdown" | "text" | "docx" | "epub"
  | "csv" | "json" | "yaml" | "xml" | "xlsx"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2"
  | "audio-mp3" | "audio-wav" | "audio-flac"
  | "video-webm" | "video-mp4"
  | "srt" | "vtt" | "kml" | "gpx"
  | "txt-base64" | "txt-hex" | "txt-url";

export const TARGET_LABELS: Record<TargetFormat, string> = {
  "image-png": "PNG", "image-jpeg": "JPEG", "image-webp": "WebP", "image-avif": "AVIF", "image-gif": "GIF", "image-ico": "ICO icon",
  pdf: "PDF", html: "HTML", markdown: "Markdown", text: "Plain text", docx: "Word (DOCX)", epub: "EPUB ebook",
  csv: "CSV", json: "JSON", yaml: "YAML", xml: "XML", xlsx: "Excel (XLSX)",
  zip: "ZIP", tar: "TAR", gzip: "GZIP",
  "font-ttf": "TTF", "font-woff": "WOFF", "font-woff2": "WOFF2",
  "audio-mp3": "MP3", "audio-wav": "WAV", "audio-flac": "FLAC",
  "video-webm": "WebM video", "video-mp4": "MP4 video",
  srt: "SRT subtitles", vtt: "VTT subtitles", kml: "KML map data", gpx: "GPX GPS tracks",
  "txt-base64": "Base64 text", "txt-hex": "Hex text", "txt-url": "URL-encoded text"
};

/** Image sources can convert to any raster target (canvas). */
const IMAGE_SOURCES: FileType[] = [
  "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif"
];

const IMAGE_TARGETS: TargetFormat[] = ["image-png", "image-jpeg", "image-webp", "image-avif", "image-gif", "image-ico"];

/** Raster images can also be packed into a PDF (smallpdf/pdfresizer). */
const IMAGE_AND_PDF: TargetFormat[] = [...IMAGE_TARGETS, "pdf", "txt-base64", "txt-hex"];

export const MATRIX: Record<FileType, TargetFormat[]> = {
  "image-png": IMAGE_AND_PDF,
  "image-jpeg": IMAGE_AND_PDF,
  "image-webp": IMAGE_AND_PDF,
  "image-gif": IMAGE_AND_PDF,
  "image-bmp": IMAGE_AND_PDF,
  "image-avif": IMAGE_AND_PDF,
  "image-svg": ["image-png", "image-jpeg", "image-webp", "image-gif", "image-ico", "text", "pdf", "txt-base64", "txt-hex"],
  pdf: ["text", "markdown", "html", "image-png", "image-jpeg", "docx", "txt-base64", "txt-hex"],
  docx: ["html", "markdown", "text", "pdf", "epub", "txt-base64", "txt-hex"],
  xlsx: ["csv", "json", "html", "yaml", "xml", "markdown", "pdf", "docx", "epub", "txt-base64", "txt-hex"],
  epub: ["html", "text", "markdown", "pdf", "docx", "txt-base64", "txt-hex"],
  html: ["markdown", "text", "pdf", "docx", "epub", "txt-base64", "txt-hex"],
  markdown: ["html", "text", "pdf", "docx", "epub", "txt-base64", "txt-hex"],
  text: ["txt-base64", "txt-hex", "txt-url", "pdf", "docx", "html", "markdown", "epub"],
  csv: ["json", "xlsx", "pdf", "html", "yaml", "xml", "markdown", "docx", "epub", "txt-base64", "txt-hex"],
  json: ["yaml", "xml", "csv", "text", "html", "pdf", "xlsx", "docx", "epub", "txt-base64", "txt-hex"],
  tsv: ["csv", "json", "xlsx", "html", "pdf", "yaml", "xml", "markdown", "docx", "epub", "txt-base64", "txt-hex"],
  yaml: ["json", "xml", "csv", "html", "xlsx", "docx", "epub", "txt-base64", "txt-hex"],
  xml: ["json", "text", "yaml", "html", "txt-base64", "txt-hex"],
  ini: ["json", "yaml", "xml", "text", "txt-base64", "txt-hex"],
  zip: ["tar", "gzip", "txt-base64", "txt-hex"],
  tar: ["zip", "gzip", "txt-base64", "txt-hex"],
  gzip: ["zip", "tar", "text", "txt-base64", "txt-hex"],
  "font-ttf": ["font-woff", "font-woff2", "txt-base64", "txt-hex"],
  "font-woff": ["font-ttf", "font-woff2", "txt-base64", "txt-hex"],
  "font-woff2": ["font-ttf", "font-woff", "txt-base64", "txt-hex"],
  "font-otf": ["font-ttf", "font-woff", "font-woff2", "txt-base64", "txt-hex"],
  "audio-mp3": ["audio-wav", "audio-flac", "txt-base64", "txt-hex"],
  "audio-wav": ["audio-mp3", "audio-wav", "audio-flac", "txt-base64", "txt-hex"],
  "audio-ogg": ["audio-wav", "audio-mp3", "audio-flac", "txt-base64", "txt-hex"],
  "audio-m4a": ["audio-wav", "audio-mp3", "audio-flac", "txt-base64", "txt-hex"],
  "audio-flac": ["audio-wav", "audio-mp3", "audio-flac", "txt-base64", "txt-hex"],
  "video-mp4": ["image-gif", "image-png", "image-jpeg", "video-webm", "video-mp4", "audio-mp3", "audio-wav", "txt-base64", "txt-hex"],
  "video-webm": ["image-gif", "image-png", "image-jpeg", "video-webm", "video-mp4", "audio-mp3", "audio-wav", "txt-base64", "txt-hex"],
  "video-mov": ["image-gif", "image-png", "image-jpeg", "video-webm", "video-mp4", "audio-mp3", "audio-wav", "txt-base64", "txt-hex"],
  "text-base64": ["text", "pdf"],
  "text-hex": ["text", "pdf"],
  "text-url": ["text", "pdf"],
  vcf: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  ics: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  srt: ["vtt", "text", "csv", "json", "txt-base64", "txt-hex"],
  vtt: ["srt", "text", "csv", "json", "txt-base64", "txt-hex"],
  gpx: ["kml", "csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  lrc: ["srt", "vtt", "text", "csv", "json"],
  sitemap: ["csv", "json", "xlsx", "html", "markdown", "text"],
  rss: ["csv", "json", "xlsx", "html", "markdown", "text"],
  kml: ["gpx", "csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  bookmarks: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  bibtex: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
  jsonl: ["csv", "json", "xlsx", "html", "markdown", "text", "txt-base64", "txt-hex"],
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
    case "video-webm": return "webm";
    case "video-mp4": return "mp4";
    case "srt": return "srt";
    case "vtt": return "vtt";
    case "kml": return "kml";
    case "gpx": return "gpx";
    case "txt-base64": return "txt";
    case "txt-hex": return "txt";
    case "txt-url": return "txt";
  }
}
