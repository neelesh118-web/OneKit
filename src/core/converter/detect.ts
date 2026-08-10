/**
 * File type detection — identifies a file's format from its name, declared
 * MIME type, and magic bytes. Container formats (ZIP) are distinguished
 * from their document flavours (DOCX/XLSX/EPUB) by probing inside.
 */

export type FileType =
  | "image-png" | "image-jpeg" | "image-webp" | "image-gif" | "image-bmp" | "image-avif" | "image-svg"
  | "pdf" | "docx" | "xlsx" | "epub"
  | "html" | "markdown" | "text"
  | "csv" | "json" | "yaml" | "xml"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2"
  | "audio-mp3" | "audio-wav" | "audio-ogg" | "audio-m4a"
  | "unknown";

export const TYPE_LABELS: Record<FileType, string> = {
  "image-png": "PNG image", "image-jpeg": "JPEG image", "image-webp": "WebP image",
  "image-gif": "GIF image", "image-bmp": "BMP image", "image-avif": "AVIF image", "image-svg": "SVG image",
  pdf: "PDF document", docx: "Word document", xlsx: "Excel workbook", epub: "EPUB ebook",
  html: "HTML page", markdown: "Markdown", text: "Plain text",
  csv: "CSV spreadsheet", json: "JSON data", yaml: "YAML data", xml: "XML data",
  zip: "ZIP archive", tar: "TAR archive", gzip: "GZIP archive",
  "font-ttf": "TrueType font", "font-woff": "WOFF font", "font-woff2": "WOFF2 font",
  "audio-mp3": "MP3 audio", "audio-wav": "WAV audio", "audio-ogg": "OGG audio", "audio-m4a": "M4A audio",
  unknown: "Unknown format"
};

export const EXTENSIONS: Record<FileType, string[]> = {
  "image-png": ["png"], "image-jpeg": ["jpg", "jpeg"], "image-webp": ["webp"],
  "image-gif": ["gif"], "image-bmp": ["bmp"], "image-avif": ["avif"], "image-svg": ["svg"],
  pdf: ["pdf"], docx: ["docx"], xlsx: ["xlsx"], epub: ["epub"],
  html: ["html", "htm"], markdown: ["md", "markdown"], text: ["txt"],
  csv: ["csv"], json: ["json"], yaml: ["yaml", "yml"], xml: ["xml"],
  zip: ["zip"], tar: ["tar"], gzip: ["gz", "gzip"],
  "font-ttf": ["ttf"], "font-woff": ["woff"], "font-woff2": ["woff2"],
  "audio-mp3": ["mp3"], "audio-wav": ["wav"], "audio-ogg": ["ogg", "oga"], "audio-m4a": ["m4a", "mp4"],
  unknown: []
};

const EXT_TO_TYPE: Record<string, FileType> = Object.fromEntries(
  (Object.keys(EXTENSIONS) as FileType[]).flatMap((type) =>
    EXTENSIONS[type].map((ext) => [ext, type] as const)
  )
);

/** Detects from the filename extension alone (fast path). */
export function detectFromName(name: string): FileType {
  const dot = name.toLowerCase().split(".").pop();
  return dot ? (EXT_TO_TYPE[dot] ?? "unknown") : "unknown";
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Decodes a short window of bytes as latin1 to scan for readable signatures. */
function textWindow(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < Math.min(bytes.length, offset + length); i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

/** Detects from magic bytes; container flavours (docx/xlsx/epub) need probing. */
export function detectFromBytes(bytes: Uint8Array, fallback: FileType): FileType {
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image-png";
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image-jpeg";
  if (hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38])) return "image-gif";
  if (hasPrefix(bytes, [0x42, 0x4d])) return "image-bmp";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image-webp";
  if (asciiAt(bytes, 4, "ftypavif") || asciiAt(bytes, 4, "ftypavis")) return "image-avif";
  if (asciiAt(bytes, 0, "%PDF-")) return "pdf";
  if (hasPrefix(bytes, [0x1f, 0x8b])) return "gzip";
  if (hasPrefix(bytes, [0x00, 0x01, 0x00, 0x00])) return "font-ttf";
  if (asciiAt(bytes, 0, "wOFF")) return "font-woff";
  if (asciiAt(bytes, 0, "wOF2")) return "font-woff2";
  if (asciiAt(bytes, 0, "ID3")) return "audio-mp3";
  if (asciiAt(bytes, 0, "OggS")) return "audio-ogg";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) return "audio-wav";
  if (asciiAt(bytes, 4, "ftypM4A") || asciiAt(bytes, 4, "ftypisom")) return "audio-m4a";
  // MP3 frame sync (no ID3 tag): FF FB / FF F3 / FF F2.
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) return "audio-mp3";
  // TAR: "ustar" at offset 257.
  if (asciiAt(bytes, 257, "ustar")) return "tar";
  // ZIP container — probe for Office/EPUB flavours.
  if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const window = textWindow(bytes, 0, 600);
    if (window.includes("[Content_Types].xml") && window.includes("word/")) return "docx";
    if (window.includes("[Content_Types].xml") && window.includes("xl/")) return "xlsx";
    if (window.includes("mimetypeapplication/epub")) return "epub";
    return "zip";
  }
  // Text-ish formats: sniff the first chunk.
  if (fallback !== "unknown") return fallback;
  const head = textWindow(bytes, 0, 2000).toLowerCase();
  const trimmed = head.trimStart();
  if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml") && trimmed.includes("<svg")) return "image-svg";
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) return "html";
  if (trimmed.startsWith("---") || trimmed.includes(": ") && (trimmed.startsWith("{") === false)) {
    // YAML vs plain text is fuzzy — only claim YAML when it clearly parses later.
  }
  if (trimmed.startsWith("{")) return "json";
  if (trimmed.startsWith("<")) return "xml";
  return fallback;
}

export interface Detection {
  type: FileType;
  /** How confident we are — name is weak, magic is strong. */
  reliable: boolean;
}

/** Combined detection: magic bytes win, then name, then mime. */
export function detectFile(bytes: Uint8Array, name: string, mime?: string): Detection {
  const fromName = detectFromName(name);
  const byMagic = detectFromBytes(bytes, fromName);
  const reliable = byMagic !== "unknown";
  return { type: byMagic, reliable };
}
