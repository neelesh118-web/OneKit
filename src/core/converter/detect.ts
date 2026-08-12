/**
 * File type detection — identifies a file's format from its name, declared
 * MIME type, and magic bytes. Container formats (ZIP) are distinguished
 * from their document flavours (DOCX/XLSX/EPUB) by probing inside.
 */

export type FileType =
  | "image-png" | "image-jpeg" | "image-webp" | "image-gif" | "image-bmp" | "image-avif" | "image-svg"
  | "image-tiff" | "image-ico" | "image-dds"
  | "pdf" | "docx" | "docm" | "dotx" | "xlsx" | "xlsm" | "epub"
  | "rtf" | "odt" | "odp" | "ods" | "pptx" | "pptm" | "potx" | "ppsx" | "xls"
  | "fb2" | "mobi" | "azw" | "prc" | "htmlz" | "txtz" | "audio-aiff" | "audio-aac" | "audio-midi"
  | "html" | "markdown" | "rst" | "tex" | "abw" | "zabw" | "oeb" | "pml" | "text"
  | "csv" | "tsv" | "json" | "yaml" | "xml" | "ini"
  | "zip" | "tar" | "gzip"
  | "font-ttf" | "font-woff" | "font-woff2" | "font-otf"
  | "audio-mp3" | "audio-wav" | "audio-ogg" | "audio-m4a" | "audio-flac"
  | "video-mp4" | "video-webm" | "video-mov"
  | "text-base64" | "text-hex" | "text-url"
  | "vcf" | "ics" | "srt" | "vtt" | "gpx" | "lrc" | "sitemap" | "rss" | "kml" | "bookmarks"
  | "bibtex" | "jsonl" | "m3u" | "eml" | "torrent" | "qif" | "toml" | "ofx" | "gedcom"
  | "mbox" | "ldif" | "cue"
  | "raw-cr2" | "raw-nef" | "raw-arw" | "raw-dng" | "raw-orf" | "raw-pef" | "raw-rw2"
  | "raw-dcr" | "raw-erf" | "raw-3fr" | "raw-mos" | "raw-raf"
  | "raw-cr3" | "raw-crw" | "raw-mrw" | "raw-x3f"
  | "eps" | "ps"
  | "image-tga" | "image-ppm" | "image-psd" | "image-icns"
  | "image-pbm" | "image-pgm" | "image-pam" | "image-xbm"
  | "image-qoi" | "image-farbfeld" | "image-pcx"
  | "audio-au" | "audio-voc"
  | "opml" | "plist" | "ssv" | "psv" | "dif" | "gnumeric"
  | "unknown";

export const TYPE_LABELS: Record<FileType, string> = {
  "image-png": "PNG image", "image-jpeg": "JPEG image", "image-webp": "WebP image",
  "image-gif": "GIF image", "image-bmp": "BMP image", "image-avif": "AVIF image", "image-svg": "SVG image",
  "image-tiff": "TIFF image", "image-ico": "ICO icon", "image-dds": "DDS texture",
  pdf: "PDF document", docx: "Word document", docm: "Macro-enabled Word document",
  dotx: "Word template", xlsx: "Excel workbook", xlsm: "Macro-enabled Excel workbook", epub: "EPUB ebook",
  rtf: "Rich Text (RTF)", odt: "OpenDocument text", odp: "OpenDocument presentation",
  ods: "OpenDocument spreadsheet", pptx: "PowerPoint deck", pptm: "Macro-enabled PowerPoint deck",
  potx: "PowerPoint template", ppsx: "PowerPoint slide show", xls: "Excel 97–2003 workbook",
  fb2: "FictionBook (FB2)", mobi: "MOBI ebook", azw: "Kindle AZW ebook", prc: "Palm PRC ebook",
  htmlz: "HTMLZ ebook", txtz: "TXTZ ebook",
  "audio-aiff": "AIFF audio", "audio-aac": "AAC audio",
  "audio-midi": "MIDI music",
  html: "HTML page", markdown: "Markdown", rst: "reStructuredText", tex: "TeX/LaTeX",
  abw: "AbiWord document", zabw: "Compressed AbiWord document", oeb: "Open eBook",
  pml: "Palm Markup Language ebook", text: "Plain text",
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
  mbox: "mbox email archive", ldif: "LDIF directory data", cue: "CUE sheet",
  "raw-cr2": "Canon RAW (CR2)", "raw-nef": "Nikon RAW (NEF)", "raw-arw": "Sony RAW (ARW)",
  "raw-dng": "Adobe DNG", "raw-orf": "Olympus RAW (ORF)", "raw-pef": "Pentax RAW (PEF)",
  "raw-rw2": "Panasonic RAW (RW2)", "raw-dcr": "Kodak RAW (DCR)", "raw-erf": "Epson RAW (ERF)",
  "raw-3fr": "Hasselblad RAW (3FR)", "raw-mos": "Leaf RAW (MOS)", "raw-raf": "Fujifilm RAW (RAF)",
  "raw-cr3": "Canon RAW (CR3)", "raw-crw": "Canon RAW (CRW)", "raw-mrw": "Minolta RAW (MRW)",
  "raw-x3f": "Sigma RAW (X3F)",
  eps: "Encapsulated PostScript (EPS)", ps: "PostScript (PS)",
  "image-tga": "Targa (TGA) image", "image-ppm": "PPM image", "image-psd": "Photoshop (PSD) image",
  "image-pbm": "PBM bitmap", "image-pgm": "PGM grayscale image", "image-pam": "PAM image", "image-xbm": "X11 XBM bitmap",
  "image-qoi": "QOI image", "image-farbfeld": "Farbfeld image", "image-pcx": "PCX image",
  "audio-au": "Sun AU audio", "audio-voc": "Creative Voice audio",
  opml: "OPML outline", plist: "Apple plist", ssv: "SSV spreadsheet", psv: "PSV spreadsheet",
  dif: "DIF spreadsheet", gnumeric: "gnumeric spreadsheet",
  "image-icns": "Apple icon (ICNS)",
  unknown: "Unknown format"
};

export const EXTENSIONS: Record<FileType, string[]> = {
  "image-png": ["png"], "image-jpeg": ["jpg", "jpeg", "jfif"], "image-webp": ["webp"],
  "image-gif": ["gif"], "image-bmp": ["bmp"], "image-avif": ["avif"], "image-svg": ["svg"],
  "image-tiff": ["tif", "tiff"], "image-ico": ["ico", "cur"], "image-dds": ["dds"],
  pdf: ["pdf"], docx: ["docx"], docm: ["docm"], dotx: ["dotx"],
  xlsx: ["xlsx"], xlsm: ["xlsm"], epub: ["epub"],
  rtf: ["rtf"], odt: ["odt"], odp: ["odp"], ods: ["ods"], pptx: ["pptx"],
  pptm: ["pptm"], potx: ["potx"], ppsx: ["ppsx"], xls: ["xls"],
  fb2: ["fb2"], mobi: ["mobi"], azw: ["azw"], prc: ["prc"], htmlz: ["htmlz"], txtz: ["txtz"],
  "audio-aiff": ["aif", "aiff", "aifc"], "audio-aac": ["aac"], "audio-midi": ["mid", "midi"],
  html: ["html", "htm"], markdown: ["md", "markdown"], rst: ["rst"], tex: ["tex", "latex"],
  abw: ["abw"], zabw: ["zabw"], oeb: ["oeb"], pml: ["pml"], text: ["txt"],
  csv: ["csv"], tsv: ["tsv"], json: ["json"], yaml: ["yaml", "yml"], xml: ["xml"], ini: ["ini"],
  zip: ["zip"], tar: ["tar"], gzip: ["gz", "gzip"],
  "font-ttf": ["ttf"], "font-woff": ["woff"], "font-woff2": ["woff2"], "font-otf": ["otf"],
  "audio-mp3": ["mp3"], "audio-wav": ["wav"], "audio-ogg": ["ogg", "oga"], "audio-m4a": ["m4a"],
  // .m4v is Apple's naming for the exact same MP4/ISO-BMFF container
  // (iTunes video purchases/rentals) — no separate codec or demuxer
  // needed, it takes the same pipeline as any other .mp4.
  "audio-flac": ["flac"], "video-mp4": ["mp4", "m4v"], "video-webm": ["webm"], "video-mov": ["mov"],
  "text-base64": ["b64", "base64"], "text-hex": ["hex"], "text-url": ["uri", "urlenc"],
  vcf: ["vcf", "vcard"], ics: ["ics"], srt: ["srt"], vtt: ["vtt"], gpx: ["gpx"], lrc: ["lrc"],
  // NOTE: sitemap/rss deliberately declare no plain "xml" extension — the
  // name→type map is built with Object.fromEntries, so a duplicate "xml" key
  // would silently overwrite the real xml mapping. .xml files are resolved by
  // content sniffing instead (see detectFromBytes).
  sitemap: [], rss: ["rss", "atom"], kml: ["kml"],
  bibtex: ["bib"], jsonl: ["jsonl", "ndjson"], m3u: ["m3u", "m3u8"], eml: ["eml"], torrent: ["torrent"],
  qif: ["qif"], toml: ["toml"], ofx: ["ofx", "qfx"], gedcom: ["ged", "gedcom"],
  mbox: ["mbox"], ldif: ["ldif"], cue: ["cue"],
  // bookmarks files are HTML with a NETSCAPE-Bookmark header — no own extension,
  // resolved by content sniffing.
  bookmarks: [],
  "raw-cr2": ["cr2"], "raw-nef": ["nef"], "raw-arw": ["arw"], "raw-dng": ["dng"],
  "raw-orf": ["orf"], "raw-pef": ["pef"], "raw-rw2": ["rw2"], "raw-dcr": ["dcr"],
  "raw-erf": ["erf"], "raw-3fr": ["3fr"], "raw-mos": ["mos"], "raw-raf": ["raf"],
  "raw-cr3": ["cr3"], "raw-crw": ["crw"], "raw-mrw": ["mrw"], "raw-x3f": ["x3f"],
  eps: ["eps", "epsf"], ps: ["ps"],
  "image-tga": ["tga"], "image-ppm": ["ppm"], "image-psd": ["psd"], "image-icns": ["icns"],
  "image-pbm": ["pbm"], "image-pgm": ["pgm"], "image-pam": ["pam"], "image-xbm": ["xbm"],
  "image-qoi": ["qoi"], "image-farbfeld": ["ff", "farbfeld"], "image-pcx": ["pcx"],
  "audio-au": ["au", "snd"], "audio-voc": ["voc"],
  opml: ["opml"], plist: ["plist"], ssv: ["ssv"], psv: ["psv"], dif: ["dif"], gnumeric: ["gnumeric"],
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

/**
 * Camera RAW formats built on the TIFF/EP container — they share the exact
 * "II*\0"/"MM\0*" byte-order mark with baseline TIFF, so only the file's
 * own extension (carried in as `fallback`) tells them apart from a plain
 * .tiff and from each other.
 */
const RAW_TIFF_TYPES = new Set<FileType>([
  "raw-cr2", "raw-nef", "raw-arw", "raw-dng", "raw-orf", "raw-pef", "raw-rw2",
  "raw-dcr", "raw-erf", "raw-3fr", "raw-mos"
]);

/** Detects from magic bytes; container flavours (docx/xlsx/epub) need probing. */
export function detectFromBytes(bytes: Uint8Array, fallback: FileType): FileType {
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image-png";
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image-jpeg";
  if (hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38])) return "image-gif";
  if (hasPrefix(bytes, [0x42, 0x4d])) return "image-bmp";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image-webp";
  if (asciiAt(bytes, 4, "ftypavif") || asciiAt(bytes, 4, "ftypavis")) return "image-avif";
  // Fujifilm RAF carries its own ASCII header, not a TIFF byte-order mark.
  if (asciiAt(bytes, 0, "FUJIFILMCCD-RAW")) return "raw-raf";
  // Canon CR3 is an ISO base media (MP4-family) container with its own brand.
  if (asciiAt(bytes, 4, "ftypcrx ")) return "raw-cr3";
  // Canon CRW: the old CIFF format — byte-order mark, then "HEAPCCDR" at offset 8.
  if ((hasPrefix(bytes, [0x49, 0x49]) || hasPrefix(bytes, [0x4d, 0x4d])) && asciiAt(bytes, 8, "HEAPCCDR")) {
    return "raw-crw";
  }
  // Minolta MRW: "\0MRM" header.
  if (hasPrefix(bytes, [0x00, 0x4d, 0x52, 0x4d])) return "raw-mrw";
  // Sigma X3F: "FOVb" header.
  if (asciiAt(bytes, 0, "FOVb")) return "raw-x3f";
  // TIFF byte-order marks; most camera RAW formats are TIFF/EP containers
  // that share them byte-for-byte with baseline TIFF. The extension is what
  // tells them apart — trust it when it names one of the known RAW kinds,
  // otherwise treat the bytes as plain TIFF (the decoder is the final judge).
  if (hasPrefix(bytes, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    if (RAW_TIFF_TYPES.has(fallback)) return fallback;
    return "image-tiff";
  }
  // ICO/CUR directories start with a zero word then the resource type — but
  // an uncompressed-truecolor TGA with no ID/colour-map field starts the
  // same way ([0,0,2,0,...]) purely by coincidence, so trust the .tga
  // extension over this magic when the two collide.
  if (
    fallback !== "image-tga" &&
    (hasPrefix(bytes, [0x00, 0x00, 0x01, 0x00]) || hasPrefix(bytes, [0x00, 0x00, 0x02, 0x00]))
  ) {
    return "image-ico";
  }
  if (asciiAt(bytes, 0, "DDS ")) return "image-dds";
  if (asciiAt(bytes, 0, "8BPS")) return "image-psd";
  if (asciiAt(bytes, 0, "icns")) return "image-icns";
  if (hasPrefix(bytes, [0x50, 0x36]) || hasPrefix(bytes, [0x50, 0x33])) return "image-ppm"; // "P6"/"P3"
  if (hasPrefix(bytes, [0x50, 0x31]) || hasPrefix(bytes, [0x50, 0x34])) return "image-pbm"; // "P1"/"P4"
  if (hasPrefix(bytes, [0x50, 0x32]) || hasPrefix(bytes, [0x50, 0x35])) return "image-pgm"; // "P2"/"P5"
  if (hasPrefix(bytes, [0x50, 0x37])) return "image-pam"; // "P7"
  if (asciiAt(bytes, 0, "#define")) return "image-xbm";
  // QOI: "qoif" magic. Farbfeld: 8-byte "farbfeld" magic.
  if (asciiAt(bytes, 0, "qoif")) return "image-qoi";
  if (asciiAt(bytes, 0, "farbfeld")) return "image-farbfeld";
  // PCX: ZSoft header (0x0A manufacturer, version 5, RLE encoding 1).
  if (bytes.length >= 4 && bytes[0] === 0x0a && bytes[1] === 5 && bytes[2] === 1) return "image-pcx";
  // Sun AU: ".snd" magic. Creative Voice: "Creative Voice File" header.
  if (asciiAt(bytes, 0, ".snd")) return "audio-au";
  if (asciiAt(bytes, 0, "Creative Voice File")) return "audio-voc";
  if (asciiAt(bytes, 0, "{\\rtf")) return "rtf";
  if (asciiAt(bytes, 0, "%PDF-")) return "pdf";
  // PostScript: either the binary "DOS EPS" wrapper (C5 D0 D3 C6) or plain
  // ASCII PostScript starting with the %!PS-Adobe header — .eps and plain
  // .ps share the exact same header, so the extension breaks the tie.
  if (hasPrefix(bytes, [0xc5, 0xd0, 0xd3, 0xc6]) || asciiAt(bytes, 0, "%!PS-Adobe")) {
    return fallback === "ps" ? "ps" : "eps";
  }
  if (hasPrefix(bytes, [0x1f, 0x8b])) return fallback === "zabw" ? "zabw" : "gzip";
  if (hasPrefix(bytes, [0x00, 0x01, 0x00, 0x00])) return "font-ttf";
  if (asciiAt(bytes, 0, "OTTO")) return "font-otf";
  if (asciiAt(bytes, 0, "wOFF")) return "font-woff";
  if (asciiAt(bytes, 0, "wOF2")) return "font-woff2";
  if (asciiAt(bytes, 0, "ID3")) return "audio-mp3";
  if (asciiAt(bytes, 0, "OggS")) return "audio-ogg";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) return "audio-wav";
  if (asciiAt(bytes, 0, "fLaC")) return "audio-flac";
  if (asciiAt(bytes, 0, "MThd")) return "audio-midi";
  // AIFF and AIFF-C share the IFF "FORM" wrapper.
  if (asciiAt(bytes, 0, "FORM") && (asciiAt(bytes, 8, "AIFF") || asciiAt(bytes, 8, "AIFC"))) return "audio-aiff";
  // MOBI/AZW e-books are Palm databases with a book type/creator pair.
  if (asciiAt(bytes, 60, "BOOKMOBI") || asciiAt(bytes, 60, "TEXtREAd")) {
    if (fallback === "azw" || fallback === "prc") return fallback;
    return "mobi";
  }
  // MP4/MOV/M4A share the ftyp box — the brand tells video from audio.
  if (asciiAt(bytes, 4, "ftypM4A")) return "audio-m4a";
  if (asciiAt(bytes, 4, "ftypisom") || asciiAt(bytes, 4, "ftypmp42") || asciiAt(bytes, 4, "ftypavc1") ||
      asciiAt(bytes, 4, "ftypmp41") || asciiAt(bytes, 4, "ftypdash") || asciiAt(bytes, 4, "ftypcmfc") ||
      // Apple's .m4v brand — the exact same MP4/ISO-BMFF container.
      asciiAt(bytes, 4, "ftypM4V ") || asciiAt(bytes, 4, "ftypM4VP")) return "video-mp4";
  if (asciiAt(bytes, 4, "ftypqt")) return "video-mov";
  // WebM/Matroska EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video-webm";
  // MP3 frame sync (no ID3 tag): FF FB / FF F3 / FF F2.
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) return "audio-mp3";
  // Raw AAC in an ADTS stream: FF F1 (MPEG-4) / FF F9 (MPEG-2).
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) return "audio-aac";
  // TGA has no reliable header signature — old-style files carry no magic
  // at all. Trust the optional TGA 2.0 footer when present; otherwise fall
  // back to the extension, since nothing else in this list claims .tga.
  if (bytes.length >= 18 && asciiAt(bytes, bytes.length - 18, "TRUEVISION-XFILE.")) return "image-tga";
  if (fallback === "image-tga") return "image-tga";
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
    if (window.includes("[Content_Types].xml") && window.includes("word/")) {
      if (fallback === "docm" || fallback === "dotx") return fallback;
      return "docx";
    }
    if (window.includes("[Content_Types].xml") && window.includes("xl/")) {
      if (fallback === "xlsm") return fallback;
      return "xlsx";
    }
    if (window.includes("[Content_Types].xml") && window.includes("ppt/")) {
      if (fallback === "pptm" || fallback === "potx" || fallback === "ppsx") return fallback;
      return "pptx";
    }
    if (window.includes("mimetypeapplication/epub")) return "epub";
    if (fallback === "htmlz" || fallback === "txtz") return fallback;
    // OpenDocument packages name their flavour in the stored mimetype entry.
    if (window.includes("mimetypeapplication/vnd.oasis.opendocument.text")) return "odt";
    if (window.includes("mimetypeapplication/vnd.oasis.opendocument.presentation")) return "odp";
    if (window.includes("mimetypeapplication/vnd.oasis.opendocument.spreadsheet")) return "ods";
    // A ZIP with a known Office/EPUB name whose container markers live past the
    // probe window (common in small files) is still that format, not a generic
    // ZIP — trust the extension rather than mislabeling it.
    if (
      fallback === "docx" || fallback === "docm" || fallback === "dotx" ||
      fallback === "xlsx" || fallback === "xlsm" || fallback === "epub" ||
      fallback === "pptx" || fallback === "pptm" || fallback === "potx" || fallback === "ppsx" ||
      fallback === "odt" || fallback === "odp" || fallback === "ods"
    ) {
      return fallback;
    }
    return "zip";
  }
  // Text-ish formats: sniff the first chunk. XML-family names (.xml) fall
  // through so content can promote them to gpx/sitemap/rss/kml; an .html name
  // falls through only when it carries the Netscape bookmarks header; a .txt
  // name falls through only when its content clearly matches one of the
  // structured-text sniffers below. Other known names are trusted as-is.
  const head = textWindow(bytes, 0, 2000).toLowerCase();
  const structuredText = (h: string): boolean =>
    /@\w+\s*\{/.test(h) || // BibTeX
    h.startsWith("!type:") || // QIF
    h.startsWith("<ofx") || // OFX
    /^0\s+@\w+@\s+(indi|fam)/im.test(h) || // GEDCOM
    /^from\s+\S+\s+\w{3}\s+\w{3}\s+\d+/im.test(h) || // mbox
    /^dn:\s+/im.test(h) || // LDIF
    (/^file\s+".+"\s+\w+/im.test(h) && /^track\s+\d+/im.test(h)); // CUE
  if (
    fallback !== "unknown" &&
    fallback !== "xml" &&
    !(fallback === "html" && head.includes("netscape-bookmark")) &&
    !(fallback === "text" && structuredText(head))
  ) {
    return fallback;
  }
  const trimmed = head.trimStart();
  if (trimmed.startsWith("<opml") || trimmed.startsWith("<?xml") && trimmed.includes("<opml")) return "opml";
  if (trimmed.startsWith("<?xml") && trimmed.includes("<plist")) return "plist";
  // DIF: "TABLE" then a version line. gnumeric: XML with gnm namespace.
  if (/^TABLE[\s\n]*[012]/.test(trimmed)) return "dif";
  if (trimmed.startsWith("<?xml") && trimmed.includes("<gnm:Workbook")) return "gnumeric";
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
  if (/^from\s+\S+\s+\w{3}\s+\w{3}\s+\d+/im.test(trimmed)) return "mbox";
  if (/^dn:\s+/im.test(trimmed)) return "ldif";
  if (/^file\s+".+"\s+\w+/im.test(trimmed) && /^track\s+\d+/im.test(trimmed)) return "cue";
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
