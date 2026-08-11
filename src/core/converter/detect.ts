/**
 * File type detection — identifies a file's format from its name, declared
 * MIME type, and magic bytes. Container formats (ZIP) are distinguished
 * from their document flavours (DOCX/XLSX/EPUB) by probing inside.
 */

export type FileType =
  | "image-png" | "image-jpeg" | "image-webp" | "image-gif" | "image-bmp" | "image-avif" | "image-svg"
  | "image-tiff" | "image-ico" | "image-dds"
  | "pdf" | "docx" | "xlsx" | "epub"
  | "rtf" | "odt" | "odp" | "ods" | "pptx" | "xls"
  | "fb2" | "mobi" | "audio-aiff" | "audio-aac"
  | "html" | "markdown" | "text"
  | "csv" | "tsv" | "json" | "yaml" | "xml" | "ini"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2" | "font-otf"
  | "audio-mp3" | "audio-wav" | "audio-ogg" | "audio-m4a" | "audio-flac"
  | "video-mp4" | "video-webm" | "video-mov"
  | "text-base64" | "text-hex" | "text-url"
  | "vcf" | "ics" | "srt" | "vtt" | "gpx" | "lrc" | "sitemap" | "rss" | "kml" | "bookmarks"
  | "bibtex" | "jsonl" | "m3u" | "eml" | "torrent" | "qif" | "toml" | "ofx" | "gedcom"
  | "unknown";

export const TYPE_LABELS: Record<FileType, string> = {
  "image-png": "PNG image", "image-jpeg": "JPEG image", "image-webp": "WebP image",
  "image-gif": "GIF image", "image-bmp": "BMP image", "image-avif": "AVIF image", "image-svg": "SVG image",
  "image-tiff": "TIFF image", "image-ico": "ICO icon", "image-dds": "DDS texture",
  pdf: "PDF document", docx: "Word document", xlsx: "Excel workbook", epub: "EPUB ebook",
  rtf: "Rich Text (RTF)", odt: "OpenDocument text", odp: "OpenDocument presentation",
  ods: "OpenDocument spreadsheet", pptx: "PowerPoint deck", xls: "Excel 97–2003 workbook",
  fb2: "FictionBook (FB2)", mobi: "MOBI ebook", "audio-aiff": "AIFF audio", "audio-aac": "AAC audio",
  html: "HTML page", markdown: "Markdown", text: "Plain text",
  csv: "CSV spreadsheet", tsv: "TSV spreadsheet", json: "JSON data", yaml: "YAML data", xml: "XML data", ini: "INI config",
  zip: "ZIP archive", tar: "TAR archive", gzip: "GZIP archive",
  "font-ttf": "TrueType font", "font-woff": "WOFF font", "font-woff2": "WOFF2 font", "font-otf": "OpenType font",
  "audio-mp3": "MP3 audio", "audio-wav": "WAV audio", "audio-ogg": "OGG audio", "audio-m4a": "M4A audio", "audio-flac": "FLAC audio",
  "video-mp4": "MP4 video", "video-webm": "WebM video", "video-mov": "MOV video",
  "text-base64": "Base64 text", "text-hex": "Hex text", "text-url": "URL-encoded text",
  vcf: "VCF contacts", ics: "ICS calendar", srt: "SRT subtitles", vtt: "VTT subtitles", gpx: "GPX GPS tracks",
  lrc: "LRC lyrics", sitemap: "Sitemap XML", rss: "RSS/Atom feed", kml: "KML map data", bookmarks: "Browser bookmarks",
  bibtex: "BibTeX citations", jsonl: "JSON Lines data", m3u: "M3U playlist", eml: "EML email", torrent: "Torrent metadata",
  qif: "QIF transactions", toml: "TOML config", ofx: "OFX statements", gedcom: "GEDCOM family tree",
  unknown: "Unknown format"
};

export const EXTENSIONS: Record<FileType, string[]> = {
  "image-png": ["png"], "image-jpeg": ["jpg", "jpeg", "jfif"], "image-webp": ["webp"],
  "image-gif": ["gif"], "image-bmp": ["bmp"], "image-avif": ["avif"], "image-svg": ["svg"],
  "image-tiff": ["tif", "tiff"], "image-ico": ["ico", "cur"], "image-dds": ["dds"],
  pdf: ["pdf"], docx: ["docx"], xlsx: ["xlsx"], epub: ["epub"],
  rtf: ["rtf"], odt: ["odt"], odp: ["odp"], ods: ["ods"], pptx: ["pptx"], xls: ["xls"],
  fb2: ["fb2"], mobi: ["mobi", "azw", "prc"],
  "audio-aiff": ["aif", "aiff", "aifc"], "audio-aac": ["aac"],
  html: ["html", "htm"], markdown: ["md", "markdown"], text: ["txt"],
  csv: ["csv"], tsv: ["tsv"], json: ["json"], yaml: ["yaml", "yml"], xml: ["xml"], ini: ["ini"],
  zip: ["zip"], tar: ["tar"], gzip: ["gz", "gzip"],
  "font-ttf": ["ttf"], "font-woff": ["woff"], "font-woff2": ["woff2"], "font-otf": ["otf"],
  "audio-mp3": ["mp3"], "audio-wav": ["wav"], "audio-ogg": ["ogg", "oga"], "audio-m4a": ["m4a"],
  "audio-flac": ["flac"], "video-mp4": ["mp4"], "video-webm": ["webm"], "video-mov": ["mov"],
  "text-base64": ["b64", "base64"], "text-hex": ["hex"], "text-url": ["uri", "urlenc"],
  vcf: ["vcf", "vcard"], ics: ["ics"], srt: ["srt"], vtt: ["vtt"], gpx: ["gpx"], lrc: ["lrc"],
  // NOTE: sitemap/rss deliberately declare no plain "xml" extension — the
  // name→type map is built with Object.fromEntries, so a duplicate "xml" key
  // would silently overwrite the real xml mapping. .xml files are resolved by
  // content sniffing instead (see detectFromBytes).
  sitemap: [], rss: ["rss", "atom"], kml: ["kml"],
  bibtex: ["bib"], jsonl: ["jsonl", "ndjson"], m3u: ["m3u", "m3u8"], eml: ["eml"], torrent: ["torrent"],
  qif: ["qif"], toml: ["toml"], ofx: ["ofx", "qfx"], gedcom: ["ged", "gedcom"],
  // bookmarks files are HTML with a NETSCAPE-Bookmark header — no own extension,
  // resolved by content sniffing.
  bookmarks: [],
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
  // TIFF byte-order marks; RAW camera files share them, so the decoder is
  // what decides whether the contents are really baseline TIFF.
  if (hasPrefix(bytes, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "image-tiff";
  // ICO/CUR directories start with a zero word then the resource type.
  if (hasPrefix(bytes, [0x00, 0x00, 0x01, 0x00]) || hasPrefix(bytes, [0x00, 0x00, 0x02, 0x00])) return "image-ico";
  if (asciiAt(bytes, 0, "DDS ")) return "image-dds";
  if (asciiAt(bytes, 0, "{\\rtf")) return "rtf";
  if (asciiAt(bytes, 0, "%PDF-")) return "pdf";
  if (hasPrefix(bytes, [0x1f, 0x8b])) return "gzip";
  if (hasPrefix(bytes, [0x00, 0x01, 0x00, 0x00])) return "font-ttf";
  if (asciiAt(bytes, 0, "OTTO")) return "font-otf";
  if (asciiAt(bytes, 0, "wOFF")) return "font-woff";
  if (asciiAt(bytes, 0, "wOF2")) return "font-woff2";
  if (asciiAt(bytes, 0, "ID3")) return "audio-mp3";
  if (asciiAt(bytes, 0, "OggS")) return "audio-ogg";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) return "audio-wav";
  if (asciiAt(bytes, 0, "fLaC")) return "audio-flac";
  // AIFF and AIFF-C share the IFF "FORM" wrapper.
  if (asciiAt(bytes, 0, "FORM") && (asciiAt(bytes, 8, "AIFF") || asciiAt(bytes, 8, "AIFC"))) return "audio-aiff";
  // MOBI/AZW e-books are Palm databases with a book type/creator pair.
  if (asciiAt(bytes, 60, "BOOKMOBI") || asciiAt(bytes, 60, "TEXtREAd")) return "mobi";
  // MP4/MOV/M4A share the ftyp box — the brand tells video from audio.
  if (asciiAt(bytes, 4, "ftypM4A")) return "audio-m4a";
  if (asciiAt(bytes, 4, "ftypisom") || asciiAt(bytes, 4, "ftypmp42") || asciiAt(bytes, 4, "ftypavc1") ||
      asciiAt(bytes, 4, "ftypmp41") || asciiAt(bytes, 4, "ftypdash") || asciiAt(bytes, 4, "ftypcmfc")) return "video-mp4";
  if (asciiAt(bytes, 4, "ftypqt")) return "video-mov";
  // WebM/Matroska EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video-webm";
  // MP3 frame sync (no ID3 tag): FF FB / FF F3 / FF F2.
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) return "audio-mp3";
  // Raw AAC in an ADTS stream: FF F1 (MPEG-4) / FF F9 (MPEG-2).
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) return "audio-aac";
  // OLE2 compound files hold .xls, .doc and .ppt alike — only the workbook
  // stream is readable here, so anything else stays unknown rather than
  // claiming a conversion that doesn't exist.
  if (hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    // Stream names live in the directory as UTF-16LE.
    const directory = textWindow(bytes, 0, 8192);
    if (directory.includes("W\0o\0r\0k\0b\0o\0o\0k\0") || directory.includes("B\0o\0o\0k\0")) return "xls";
    return "unknown";
  }
  // TAR: "ustar" at offset 257.
  if (asciiAt(bytes, 257, "ustar")) return "tar";
  // ZIP container — probe for Office/EPUB flavours.
  if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const window = textWindow(bytes, 0, 600);
    if (window.includes("[Content_Types].xml") && window.includes("word/")) return "docx";
    if (window.includes("[Content_Types].xml") && window.includes("xl/")) return "xlsx";
    if (window.includes("[Content_Types].xml") && window.includes("ppt/")) return "pptx";
    if (window.includes("mimetypeapplication/epub")) return "epub";
    // OpenDocument packages name their flavour in the stored mimetype entry.
    if (window.includes("mimetypeapplication/vnd.oasis.opendocument.text")) return "odt";
    if (window.includes("mimetypeapplication/vnd.oasis.opendocument.presentation")) return "odp";
    if (window.includes("mimetypeapplication/vnd.oasis.opendocument.spreadsheet")) return "ods";
    // A ZIP with a known Office/EPUB name whose container markers live past the
    // probe window (common in small files) is still that format, not a generic
    // ZIP — trust the extension rather than mislabeling it.
    if (
      fallback === "docx" || fallback === "xlsx" || fallback === "epub" ||
      fallback === "pptx" || fallback === "odt" || fallback === "odp" || fallback === "ods"
    ) {
      return fallback;
    }
    return "zip";
  }
  // Text-ish formats: sniff the first chunk. XML-family names (.xml) fall
  // through so content can promote them to gpx/sitemap/rss/kml; an .html name
  // falls through only when it carries the Netscape bookmarks header; a .txt
  // name falls through only when it clearly looks like BibTeX. Other known
  // names are trusted as-is.
  const head = textWindow(bytes, 0, 2000).toLowerCase();
  if (
    fallback !== "unknown" &&
    fallback !== "xml" &&
    !(fallback === "html" && head.includes("netscape-bookmark")) &&
    !(fallback === "text" && /@\w+\s*\{/.test(head)) &&
    !(fallback === "text" && head.startsWith("!type:")) &&
    !(fallback === "text" && head.startsWith("<ofx")) &&
    !(fallback === "text" && /^0\s+@\w+@\s+(indi|fam)/im.test(head))
  ) {
    return fallback;
  }
  const trimmed = head.trimStart();
  if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml") && trimmed.includes("<svg")) return "image-svg";
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
    return trimmed.includes("netscape-bookmark") ? "bookmarks" : "html";
  }
  if (trimmed.startsWith("---") || trimmed.includes(": ") && (trimmed.startsWith("{") === false)) {
    // YAML vs plain text is fuzzy — only claim YAML when it clearly parses later.
  }
  if (trimmed.includes("<fictionbook")) return "fb2";
  if (trimmed.startsWith("begin:vcard")) return "vcf";
  if (trimmed.startsWith("begin:vcalendar")) return "ics";
  if (trimmed.includes("<kml")) return "kml";
  if (trimmed.includes("<gpx")) return "gpx";
  if (trimmed.includes("netscape-bookmark")) return "bookmarks";
  if (trimmed.includes("<urlset")) return "sitemap";
  if (trimmed.includes("<rss") || trimmed.includes("<feed")) return "rss";
  if (trimmed.startsWith("#extm3u")) return "m3u";
  if (trimmed.startsWith("d8:announce")) return "torrent";
  if (/^from:/im.test(trimmed) && /^content-type:/im.test(trimmed)) return "eml";
  if (trimmed.startsWith("!type:")) return "qif";
  if (trimmed.startsWith("<ofx")) return "ofx";
  if (/^0\s+@\w+@\s+(indi|fam)/im.test(trimmed)) return "gedcom";
  if (/@\w+\s*\{/.test(trimmed)) return "bibtex";
  if (trimmed.startsWith("{") && head.includes("\n{")) return "jsonl";
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
