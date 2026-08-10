import type { FileType } from "./detect";

/**
 * The conversion matrix — which target formats each source type can
 * become, and which conversion function handles it. This is the single
 * source of truth the Convert tab's UI renders from, and the honest
 * boundary of what's possible 100% locally.
 */

export type TargetFormat =
  | "image-png" | "image-jpeg" | "image-webp" | "image-avif"
  | "pdf" | "html" | "markdown" | "text"
  | "csv" | "json" | "yaml" | "xml" | "xlsx"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2"
  | "audio-mp3" | "audio-wav"
  | "txt-base64" | "txt-hex" | "txt-url";

export const TARGET_LABELS: Record<TargetFormat, string> = {
  "image-png": "PNG", "image-jpeg": "JPEG", "image-webp": "WebP", "image-avif": "AVIF",
  pdf: "PDF", html: "HTML", markdown: "Markdown", text: "Plain text",
  csv: "CSV", json: "JSON", yaml: "YAML", xml: "XML", xlsx: "Excel (XLSX)",
  zip: "ZIP", tar: "TAR", gzip: "GZIP",
  "font-ttf": "TTF", "font-woff": "WOFF", "font-woff2": "WOFF2",
  "audio-mp3": "MP3", "audio-wav": "WAV",
  "txt-base64": "Base64 text", "txt-hex": "Hex text", "txt-url": "URL-encoded text"
};

/** Image sources can convert to any raster target (canvas). */
const IMAGE_SOURCES: FileType[] = [
  "image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif"
];

const IMAGE_TARGETS: TargetFormat[] = ["image-png", "image-jpeg", "image-webp", "image-avif"];

export const MATRIX: Record<FileType, TargetFormat[]> = {
  "image-png": IMAGE_TARGETS,
  "image-jpeg": IMAGE_TARGETS,
  "image-webp": IMAGE_TARGETS,
  "image-gif": IMAGE_TARGETS,
  "image-bmp": IMAGE_TARGETS,
  "image-avif": IMAGE_TARGETS,
  "image-svg": ["image-png", "image-jpeg", "image-webp", "text"],
  pdf: ["text", "markdown", "html"],
  docx: ["html", "markdown", "text"],
  xlsx: ["csv", "json"],
  epub: ["html", "text", "markdown"],
  html: ["markdown", "text", "pdf"],
  markdown: ["html", "text"],
  text: ["txt-base64", "txt-hex", "txt-url"],
  csv: ["json", "xlsx"],
  json: ["yaml", "xml", "csv", "text"],
  yaml: ["json"],
  xml: ["json", "text"],
  zip: ["tar", "gzip"],
  tar: ["zip", "gzip"],
  gzip: ["zip", "tar", "text"],
  "font-ttf": ["font-woff", "font-woff2"],
  "font-woff": ["font-ttf", "font-woff2"],
  "font-woff2": ["font-ttf", "font-woff"],
  "audio-mp3": ["audio-wav"],
  "audio-wav": ["audio-mp3", "audio-wav"],
  "audio-ogg": ["audio-wav"],
  "audio-m4a": ["audio-wav"],
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
    case "pdf": return "pdf";
    case "html": return "html";
    case "markdown": return "md";
    case "text": return "txt";
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
    case "txt-base64": return "txt";
    case "txt-hex": return "txt";
    case "txt-url": return "txt";
  }
}
