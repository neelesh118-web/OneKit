/**
 * The converter orchestrator — detect the source format, check it against
 * the honest conversion matrix, dispatch to the right module, and name the
 * output file. All conversions stay on-device.
 */
import { detectFile, TYPE_LABELS, type FileType } from "./detect";
import { IMAGE_TARGETS, TARGET_LABELS, targetExtension, targetsFor, type TargetFormat } from "./matrix";
import { convertImage, imageBytesToDataUrl, type ImageConvertSettings, type ImageTarget } from "./images";
import { convertFont, type FontTarget } from "./fonts";
import {
  anyToFlac,
  anyToMp3,
  anyToMp4,
  anyToOgg,
  anyToWav,
  decodeAudioInBrowser,
  normalizeWav,
  parseWav,
  samplesToWav,
  wavToFlac,
  wavToMp3,
  wavToMp4,
  wavToOgg,
  type AudioDecoder
} from "./audio";
import { midiToWav } from "./midi";
import { mp4ToMov } from "./mp4";
import {
  videoToGif,
  videoToImage,
  videoToMp3,
  videoToVideo,
  videoToWav,
  type VideoAudioDeps,
  type VideoFrameExtractor,
  type VideoTarget,
  type VideoToVideoDeps
} from "./video";
import { base64ToBytes, base64ToText, hexToBytes, hexToText, urlToText } from "./text";
import { extractRawPreviewJpeg } from "./raw-photo";
import { extractEpsPreviewTiff } from "./eps";
import { encodeAiff, parseAiff } from "./aiff";
import { encodeAu, parseAu } from "./au";
import { encodeVoc, isVoc, parseVoc } from "./voc";
import { extractAzw4Pdf, extractPagesPreviewPdf, fb2ToHtml, fb2Title, htmlzToHtml, keyToHtml, mobiToHtml, numbersToHtml, pagesToHtml, tcrToHtml, txtzToHtml } from "./ebooks";
import { azw4FromPdf, mobiFromHtml } from "./ebooks-write";
import { imagesToOdp, imagesToOdt, odpToSlides, odtToHtml, slidesToOdp } from "./odf";
import { imagesToPptx, pptxToSlides, slidesToHtml } from "./pptx";
import { imageToRtfDocument, rtfToHtml } from "./rtf";
import { abwToHtml, oebToHtml, pmlToHtml, rstToHtml, texToHtml, zabwToHtml } from "./markup";
import * as docs from "./documents";
import * as txt from "./text";
import * as arch from "./archives";
import { dxfToPdf, dxfToSvg, dxfToText } from "./vector";
import { pptToHtml, sdaToHtml, sdcToHtml, sdwToHtml, vsdToHtml } from "./ole2";
import { xpsToHtml } from "./xps";
import { pubToHtml } from "./pub";
import { emfToSvg, emfToText, wmfToSvg, wmfToText } from "./metafile";
import { cgmToSvg, cgmToText } from "./cgm";
import { chmToHtml } from "./chm";
import { litToHtml } from "./lit";
import { heicToJpeg } from "./heic";
import { skToHtml, skToSvg } from "./sketch";
import { swfToHtml } from "./swf";
import { hwpxToHtml } from "./hwpx";
import { lrfToHtml } from "./lrf";
import { wpdToHtml } from "./wpd";

export interface ConvertInput {
  bytes: Uint8Array;
  name: string;
  mime?: string;
}

export interface ConvertResult {
  bytes: Uint8Array;
  name: string;
  mime: string;
}

export interface ConvertOptions {
  /** Injectable canvas for image conversion (defaults to the DOM canvas). */
  canvas?: Parameters<typeof convertImage>[2];
  /** Quality / max-size settings for image targets. */
  image?: ImageConvertSettings;
  /** Injectable audio decoder (defaults to the Web Audio API). */
  audioDecoder?: AudioDecoder;
  /** Injectable video frame extractor (defaults to the <video> element). */
  videoFrames?: VideoFrameExtractor;
  /** Injectable video transcoder deps (defaults to MediaRecorder). */
  video?: VideoToVideoDeps;
  /** Injectable audio-capture deps for video → audio (defaults to OfflineAudioContext). */
  videoAudio?: VideoAudioDeps;
  /** Injectable OCR engine for image → text (defaults to the bundled tesseract.js, real browser only). */
  ocr?: { recognize?: (dataUrl: string) => Promise<string> };
  /** Injectable HEIC decoder (defaults to the bundled libheif WASM, browser only). */
  heicDecode?: { toJpeg?: (bytes: Uint8Array) => Promise<Uint8Array> };
}

export const MIME_BY_TARGET: Record<TargetFormat, string> = {
  "image-png": "image/png",
  "image-jpeg": "image/jpeg",
  "image-webp": "image/webp",
  "image-avif": "image/avif",
  "image-gif": "image/gif",
  "image-ico": "image/x-icon",
  "image-bmp": "image/bmp",
  "image-tiff": "image/tiff",
  "image-dds": "image/vnd-ms.dds",
  "image-svg": "image/svg+xml",
  "image-tga": "image/x-tga",
  "image-ppm": "image/x-portable-pixmap",
  "image-psd": "image/vnd.adobe.photoshop",
  "image-icns": "image/icns",
  mobi: "application/x-mobipocket-ebook",
  azw: "application/vnd.amazon.ebook",
  azw3: "application/vnd.amazon.ebook",
  azw4: "application/vnd.amazon.ebook",
  prc: "application/x-mobipocket-ebook",
  pdb: "application/vnd.palm",
  mhtml: "message/rfc822",
  xhtml: "application/xhtml+xml",
  ps: "application/postscript",
  eps: "application/postscript",
  odg: "application/vnd.oasis.opendocument.drawing",
  svgz: "image/svg+xml",
  cbc: "application/vnd.comicbook+zip",
  abw: "application/x-abiword",
  zabw: "application/x-abiword-compressed",
  geojson: "application/geo+json",
  tex: "application/x-tex",
  rst: "text/x-rst",
  "image-pbm": "image/x-portable-bitmap",
  "image-pgm": "image/x-portable-graymap",
  "image-pam": "image/x-portable-arbitrary-map",
  "image-xbm": "image/x-xbitmap",
  "image-qoi": "image/qoi",
  "image-farbfeld": "image/farbfeld",
  "image-pcx": "image/x-pcx",
  "image-xpm": "image/x-xpixmap",
  "image-wbmp": "image/vnd.wap.wbmp",
  pdf: "application/pdf",
  html: "text/html",
  markdown: "text/markdown",
  text: "text/plain",
  htmlz: "application/zip",
  txtz: "application/zip",
  cbz: "application/vnd.comicbook+zip",
  org: "text/x-org",
  textile: "text/x-textile",
  mediawiki: "text/x-wiki",
  asciidoc: "text/asciidoc",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  docm: "application/vnd.ms-word.document.macroEnabled.main+xml",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
  epub: "application/epub+zip",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml",
  fb2: "application/x-fictionbook+xml",
  tsv: "text/tab-separated-values",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  toml: "application/toml",
  ini: "text/plain",
  sql: "application/sql",
  properties: "text/x-java-properties",
  opml: "text/x-opml",
  "audio-aiff": "audio/aiff",
  "audio-au": "audio/basic",
  "audio-voc": "audio/x-voc",
  csv: "text/csv",
  json: "application/json",
  yaml: "application/yaml",
  xml: "application/xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
  xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml",
  xltm: "application/vnd.ms-excel.template.macroEnabled.main+xml",
  zip: "application/zip",
  tar: "application/x-tar",
  gzip: "application/gzip",
  "font-ttf": "font/ttf",
  "font-woff": "font/woff",
  "font-woff2": "font/woff2",
  "audio-mp3": "audio/mpeg",
  "audio-wav": "audio/wav",
  "audio-flac": "audio/flac",
  "audio-ogg": "audio/ogg",
  "audio-oga": "audio/ogg",
  "audio-mp4": "audio/mp4",
  "audio-m4b": "audio/mp4",
  "video-webm": "video/webm",
  "video-mp4": "video/mp4",
  "video-mov": "video/quicktime",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  lrc: "text/plain",
  ass: "text/x-ssa",
  sbv: "text/plain",
  ttml: "application/ttml+xml",
  kml: "application/vnd.google-earth.kml+xml",
  gpx: "application/gpx+xml",
  jsonl: "application/x-ndjson",
  vcf: "text/vcard",
  ics: "text/calendar",
  "txt-base64": "text/plain",
  "txt-hex": "text/plain",
  "txt-url": "text/plain"
};

const toBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const toText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Threads the injected canvas into pdfToImages; the browser uses the real DOM one. */
function pdfCanvasDeps(opts: ConvertOptions): { canvasFactory?: () => HTMLCanvasElement } | undefined {
  const factory = opts.canvas?.canvasFactory;
  return factory ? { canvasFactory: factory } : undefined;
}

/** Sources that DON'T support raw-bytes → Base64/Hex (they have their own text path). */
const NO_RAW_ENCODE = new Set<FileType>(["text", "text-base64", "text-hex", "text-url", "unknown"]);

function baseName(name: string): string {
  const cleaned = name.trim();
  const withoutExt = cleaned.replace(/\.[^./\\]+$/, "");
  return withoutExt || "converted";
}

/** The document containers written by the Office writers. */
const OFFICE_TARGETS = new Set<TargetFormat>([
  "rtf", "odt", "pptx", "odp", "fb2", "mobi", "azw", "prc", "pdb", "azw3", "azw4", "tex", "rst", "opml", "txt-url",
  "htmlz", "txtz", "org", "textile", "mediawiki", "asciidoc", "docm", "dotx", "pptm", "potx", "ppsx",
  "cbz", "cbc", "mhtml", "xhtml", "ps", "eps", "odg", "svgz", "abw", "zabw", "geojson",
  "image-png", "image-jpeg", "image-webp", "image-gif", "image-svg"
]);

/** Targets the epub case routes through renderDocument (OFFICE_TARGETS + cbz). */
const IMAGE_OR_DOC_TARGETS = new Set<TargetFormat>(["image-png", "image-jpeg", "image-webp", "image-gif", "image-svg"]);

/** Prose targets an image reaches by OCR-ing the picture first. */
const OCR_DOC_TARGETS = new Set<TargetFormat>([
  "rst", "abw", "zabw", "xhtml", "mhtml", "ps", "eps", "odg", "azw3", "azw4"
]);

/** The spreadsheet/data containers every table and record source can produce. */
const SHEET_TARGETS = new Set<TargetFormat>(["xlsx", "xlsm", "xltx", "xltm", "tsv", "xls", "ods", "toml", "ini", "sql", "properties", "jsonl", "vcf", "ics", "geojson"]);

/**
 * Every prose source funnels through HTML, so one renderer serves them
 * all — PDF, Word, EPUB, RTF, OpenDocument and PowerPoint included.
 */
async function renderDocument(html: string, title: string, target: TargetFormat, opts: ConvertOptions = {}): Promise<Uint8Array> {
  if (target === "html") return toBytes(html);
  if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
  if (target === "pdf") return docs.htmlToPdf(html);
  if (target === "docx") return docs.htmlToDocx(html);
  if (target === "docm") return docs.docxToDocm(docs.htmlToDocx(html));
  if (target === "dotx") return docs.docxToDotx(docs.htmlToDocx(html));
  if (target === "epub") return docs.epubFromHtml(title, html);
  if (target === "rtf") return toBytes(docs.htmlToRtf(html));
  if (target === "odt") return docs.htmlToOdt(html);
  if (target === "odp") return docs.htmlToOdp(html);
  if (target === "pptx") return docs.htmlToPptx(html);
  if (target === "pptm") return docs.pptxToPptm(docs.htmlToPptx(html));
  if (target === "potx") return docs.pptxToPotx(docs.htmlToPptx(html));
  if (target === "ppsx") return docs.pptxToPpsx(docs.htmlToPptx(html));
  if (target === "fb2") return docs.htmlToFb2(html, title);
  if (target === "mobi" || target === "azw" || target === "prc" || target === "pdb" || target === "azw3") return await mobiFromHtml(html, { title });
  if (target === "azw4") return azw4FromPdf(await docs.htmlToPdf(html), { title });
  if (target === "mhtml") return docs.htmlToMhtml(html, title);
  if (target === "xhtml") return docs.htmlToXhtml(html);
  if (target === "ps") return docs.htmlToPs(html);
  if (target === "eps") return docs.htmlToEps(html);
  if (target === "odg") return docs.htmlToOdg(html, title);
  if (target === "svgz") return arch.gzipBytes(docs.textToSvg(docs.htmlToText(html)));
  if (target === "cbz" || target === "cbc") {
    const svg = docs.textToSvg(docs.htmlToText(html));
    const png = await convertImage(svg, "image-png", opts.canvas, opts.image, "image-svg");
    return arch.filesToZip({ "page-01.png": png });
  }
  if (target === "abw") return docs.htmlToAbw(html, title);
  if (target === "zabw") return arch.gzipBytes(docs.htmlToAbw(html, title));
  if (target === "tex") return toBytes(docs.htmlToLatex(html, title));
  if (target === "rst") return toBytes(docs.textToRst(docs.htmlToText(html), title));
  if (target === "opml") return toBytes(docs.htmlToOpml(html, title));
  if (target === "txt-url") return toBytes(txt.textToUrl(docs.htmlToText(html)));
  if (target === "htmlz") return docs.htmlToHtmlz(html, title);
  if (target === "txtz") return docs.htmlToTxtz(html, title);
  if (target === "org") return toBytes(docs.htmlToOrg(html, title));
  if (target === "textile") return toBytes(docs.htmlToTextile(html, title));
  if (target === "mediawiki") return toBytes(docs.htmlToMediawiki(html, title));
  if (target === "asciidoc") return toBytes(docs.htmlToAsciidoc(html, title));
  if (target === "image-svg") return docs.textToSvg(docs.htmlToText(html));
  if (target === "image-png" || target === "image-jpeg" || target === "image-webp" || target === "image-gif") {
    const svg = docs.textToSvg(docs.htmlToText(html));
    return convertImage(svg, target, opts.canvas, opts.image, "image-svg");
  }
  return toBytes(docs.htmlToText(html));
}

/**
 * Every record-shaped source (contacts, feeds, playlists, money…) funnels
 * through the same routes: sheets via renderTable, documents via
 * renderDocument, contacts/calendar via the vCard/iCal writers.
 */
async function routeRecords(
  records: Record<string, string>[],
  title: string,
  target: TargetFormat,
  opts: ConvertOptions = {}
): Promise<Uint8Array> {
  if (target === "json") return toBytes(JSON.stringify(records, null, 2));
  if (target === "csv") return toBytes(docs.recordsToCsv(records));
  if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
  if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
  if (target === "text") return toBytes(docs.recordsToText(records));
  if (target === "vcf") return toBytes(docs.recordsToVcf(records));
  if (target === "ics") return toBytes(docs.recordsToIcs(records));
  if (target === "geojson") return toBytes(docs.recordsToGeoJson(records));
  if (target === "docx" || target === "epub" || target === "pdf" || OFFICE_TARGETS.has(target)) {
    return renderDocument(docs.recordsToHtml(records), title, target, opts);
  }
  if (SHEET_TARGETS.has(target)) return renderTable(docs.recordsToCsv(records), title, target, opts);
  return toBytes(docs.recordsToHtml(records));
}

/** Any PCM WAV → AIFF, the shared bridge for every audio and video source. */
function wavToAiff(wav: Uint8Array): Uint8Array {
  const parsed = parseWav(wav);
  if (!parsed.ok) throw new Error(parsed.error);
  return encodeAiff(parsed.value);
}

/** Any PCM WAV → AU, the same bridge for the Sun/NeXT format. */
function wavToAu(wav: Uint8Array): Uint8Array {
  const parsed = parseWav(wav);
  if (!parsed.ok) throw new Error(parsed.error);
  return encodeAu(parsed.value.sampleRate, parsed.value.channels, parsed.value.samples);
}

/** Any PCM WAV → VOC, the same bridge for the Creative Voice format. */
function wavToVoc(wav: Uint8Array): Uint8Array {
  const parsed = parseWav(wav);
  if (!parsed.ok) throw new Error(parsed.error);
  return encodeVoc(parsed.value.sampleRate, parsed.value.channels, parsed.value.samples);
}

/**
 * Every tabular source funnels through CSV, so one renderer serves them
 * all — the data formats directly, the document formats via the table's
 * HTML.
 */
async function renderTable(csv: string, title: string, target: TargetFormat, opts: ConvertOptions = {}): Promise<Uint8Array> {
  if (target === "csv") return toBytes(csv);
  if (target === "tsv") return toBytes(docs.csvToTsv(csv));
  if (target === "json") return toBytes(JSON.stringify(docs.csvToJson(csv), null, 2));
  if (target === "yaml") return toBytes(docs.jsonToYaml(JSON.stringify(docs.csvToJson(csv))));
  if (target === "xml") return toBytes(docs.jsonToXml(JSON.stringify(docs.csvToJson(csv))));
  if (target === "xlsx") return docs.csvToXlsx(csv);
  if (target === "xls") return docs.csvToXls(csv);
  if (target === "ods") return docs.csvToOds(csv);
  if (target === "toml") return toBytes(docs.jsonToToml(JSON.stringify(docs.csvToJson(csv))));
  if (target === "ini") return toBytes(docs.jsonToIni(JSON.stringify(docs.csvToJson(csv))));
  if (target === "jsonl") return toBytes(docs.csvToJsonl(csv));
  if (target === "sql") return toBytes(docs.recordsToSql(docs.csvToJson(csv) as Record<string, string>[], title));
  if (target === "properties") return toBytes(docs.recordsToProperties(docs.csvToJson(csv) as Record<string, string>[]));
  if (target === "xlsm") return docs.xlsxToXlsm(await docs.csvToXlsx(csv));
  if (target === "xltx") return docs.xlsxToXltx(await docs.csvToXlsx(csv));
  if (target === "xltm") return docs.xlsxToXltm(await docs.csvToXlsx(csv));
  if (target === "vcf") return toBytes(docs.recordsToVcf(docs.csvToJson(csv) as Record<string, string>[]));
  if (target === "ics") return toBytes(docs.recordsToIcs(docs.csvToJson(csv) as Record<string, string>[]));
  if (target === "geojson") return toBytes(docs.recordsToGeoJson(docs.csvToJson(csv) as Record<string, string>[]));
  if (target === "markdown") return toBytes(docs.csvToMarkdown(csv));
  if (target === "pdf") return docs.csvToPdf(csv);
  if (target === "image-svg") return docs.csvToSvg(csv);
  if (target === "svgz") return arch.gzipBytes(docs.csvToSvg(csv));
  if (target === "image-png" || target === "image-jpeg" || target === "image-webp" || target === "image-gif") {
    const svg = docs.csvToSvg(csv);
    return convertImage(svg, target, opts.canvas, opts.image, "image-svg");
  }
  return renderDocument(docs.csvToHtml(csv), title, target, opts);
}

/**
 * Converts a file to the requested target format. Throws an Error with an
 * honest message when the format can't be detected or the pair isn't
 * supported locally.
 */
export async function convertFile(
  input: ConvertInput,
  target: TargetFormat,
  opts: ConvertOptions = {}
): Promise<ConvertResult> {
  const detected = detectFile(input.bytes, input.name, input.mime);
  const source = detected.type;
  if (source === "unknown") {
    throw new Error(
      "Couldn't detect the file's format. Renaming it with the right extension (e.g. .pdf, .png) usually fixes this."
    );
  }
  if (!targetsFor(source).includes(target)) {
    throw new Error(
      `Converting ${TYPE_LABELS[source]} → ${TARGET_LABELS[target]} isn't supported locally.`
    );
  }
  const bytes = await runConversion(source, target, input.bytes, opts);
  return {
    bytes,
    name: `${baseName(input.name)}.${targetExtension(target)}`,
    mime: MIME_BY_TARGET[target]
  };
}

/**
 * Reads text out of a real picture via OCR — the bundled tesseract.js
 * engine (WASM + English traineddata, no network), the same one the
 * standalone OCR tool uses. Only available where the extension runtime
 * can locate its own asset files (`browser.runtime.getURL`); Node and
 * other hosts get an honest error instead of a fake empty result.
 */
/**
 * Decodes a HEIC/HEIF photo to JPEG bytes — the injectable override (used by
 * tests) or the bundled libheif WASM decoder rendered through the canvas.
 */
async function runHeicDecode(bytes: Uint8Array, opts: ConvertOptions): Promise<Uint8Array> {
  if (opts.heicDecode?.toJpeg) return opts.heicDecode.toJpeg(bytes);
  return heicToJpeg(bytes, opts.canvas?.canvasFactory);
}

async function runOcr(bytes: Uint8Array, name: string, opts: ConvertOptions): Promise<string> {
  const dataUrl = await imageBytesToDataUrl(bytes, name);
  const recognize =
    opts.ocr?.recognize ??
    (async (url: string) => {
      const g = globalThis as {
        browser?: { runtime?: { getURL?: (p: string) => string } };
        chrome?: { runtime?: { getURL?: (p: string) => string } };
      };
      const getUrl = g.browser?.runtime?.getURL ?? g.chrome?.runtime?.getURL;
      if (!getUrl) {
        throw new Error("OCR needs the extension runtime to locate its offline engine files — not available here.");
      }
      const ocr = await import("../ocr");
      return ocr.ocrImageDataUrl(url, getUrl);
    });
  return recognize(dataUrl);
}

/**
 * Decodes a base64/hex payload back to raw bytes, sniffs the real file
 * type inside, then converts it exactly like that format. Honest errors
 * when the decoded bytes aren't recognizable or can't reach the target.
 */
async function convertDecodedBytes(
  raw: Uint8Array,
  target: TargetFormat,
  opts: ConvertOptions
): Promise<Uint8Array> {
  const inner = detectFile(raw, "decoded.bin").type;
  if (inner === "unknown" || inner === "text-base64" || inner === "text-hex" || inner === "text-url") {
    throw new Error("The decoded bytes aren't a recognizable file type — try 'text' or 'pdf' instead.");
  }
  const innerTargets = targetsFor(inner);
  if (!innerTargets.includes(target)) {
    throw new Error(
      `The decoded file is a ${TYPE_LABELS[inner]} — converting it to ${TARGET_LABELS[target]} isn't supported locally.`
    );
  }
  return runConversion(inner, target, raw, opts);
}

/**
 * Reads a .dot/.wps file the honest way: the payload decides. RTF, HTML,
 * plain text and XML content all convert; binary OLE2 containers can't be
 * parsed locally and get a clear error instead of a mangled file.
 */
/** True when the bytes look like printable text (no NULs/control bytes). */
function isPrintable(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
    const b = bytes[i]!;
    if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 27)) return false;
  }
  return true;
}

async function sniffDocToHtml(bytes: Uint8Array): Promise<string> {
  const inner = detectFile(bytes, "sniff.bin").type;
  if (inner === "rtf") return rtfToHtml(toText(bytes));
  if (inner === "html") return toText(bytes);
  if (inner === "docx") return docs.docxToHtml(bytes);
  if (inner === "text" || inner === "markdown" || inner === "xml") {
    return `<pre>${docs.escapeHtml(toText(bytes))}</pre>`;
  }
  // Plain text has no magic bytes, so it lands on "unknown" — accept it
  // when the payload is printable (no NULs, no control bytes).
  if (inner === "unknown" && isPrintable(bytes)) {
    return `<pre>${docs.escapeHtml(toText(bytes))}</pre>`;
  }
  throw new Error(
    "This file is a binary Word/Works container that can't be read locally — try the text, RTF or HTML version instead."
  );
}

async function runConversion(
  source: FileType,
  target: TargetFormat,
  bytes: Uint8Array,
  opts: ConvertOptions
): Promise<Uint8Array> {
  // Any file → Base64 / Hex text is a raw-bytes encoding (except the
  // text-family sources, which keep their own decode/encode paths).
  if (!NO_RAW_ENCODE.has(source) && (target === "txt-base64" || target === "txt-hex")) {
    return target === "txt-base64" ? toBytes(txt.bytesToBase64(bytes)) : toBytes(txt.bytesToHex(bytes));
  }
  switch (source) {
    case "image-png":
    case "image-jpeg":
    case "image-webp":
    case "image-gif":
    case "image-bmp":
    case "image-avif":
    // TIFF, ICO, DDS, TGA, PPM, PSD and ICNS are decoded to pixels first,
    // then take the same canvas path as every other raster format.
    case "image-tiff":
    case "image-ico":
    case "image-dds":
    case "image-tga":
    case "image-ppm":
    case "image-psd":
    case "image-icns":
    case "image-pbm":
    case "image-pgm":
    case "image-pam":
    case "image-xbm":
    case "image-qoi":
    case "image-farbfeld":
    case "image-pcx":
    case "image-xpm":
    case "image-wbmp":
      if (target === "pdf") return docs.imagesToPdf([{ bytes, name: "image" }]);
      if (target === "docx") return docs.imagesToDocx([{ bytes, name: "image" }]);
      if (target === "docm") return docs.docxToDocm(await docs.imagesToDocx([{ bytes, name: "image" }]));
      if (target === "dotx") return docs.docxToDotx(await docs.imagesToDocx([{ bytes, name: "image" }]));
      if (target === "pptx") return imagesToPptx([{ bytes, name: "image" }]);
      if (target === "pptm") return docs.pptxToPptm(await imagesToPptx([{ bytes, name: "image" }]));
      if (target === "potx") return docs.pptxToPotx(await imagesToPptx([{ bytes, name: "image" }]));
      if (target === "ppsx") return docs.pptxToPpsx(await imagesToPptx([{ bytes, name: "image" }]));
      if (target === "html") return docs.imageToHtml({ bytes, name: "image" });
      if (target === "text") return toBytes(await runOcr(bytes, "image", opts));
      if (target === "markdown") return docs.imageToMarkdown({ bytes, name: "image" });
      if (target === "odt") return imagesToOdt([{ bytes, name: "image" }]);
      if (target === "odp") return imagesToOdp([{ bytes, name: "image" }]);
      if (target === "rtf") return toBytes(await imageToRtfDocument({ bytes, name: "image" }));
      if (target === "prc" || target === "pdb") return await mobiFromHtml(toText(await docs.imageToHtml({ bytes, name: "image" })), { title: "Image" });
      if (target === "tex") return toBytes(docs.htmlToLatex(toText(await docs.imageToHtml({ bytes, name: "image" })), "Image"));
      // Text-document targets read the picture with OCR and render the
      // recognised text into each prose format (same rule as image → text).
      if (OCR_DOC_TARGETS.has(target)) {
        const text = await runOcr(bytes, "image", opts);
        return renderDocument(`<pre>${docs.escapeHtml(text)}</pre>`, "Image", target, opts);
      }
      if (target === "svgz") return arch.gzipBytes(await convertImage(bytes, "image-svg", opts.canvas, opts.image, source));
      if (target === "cbz" || target === "cbc") {
        return arch.filesToZip({ "page-01.png": await convertImage(bytes, "image-png", opts.canvas, opts.image, source) });
      }
      return convertImage(bytes, target as ImageTarget, opts.canvas, opts.image, source);
    case "image-svg":
      if (target === "text") return toBytes(toText(bytes));
      // SVG text is directly extractable (no OCR needed) — strip the tags
      // and render the content into each prose format.
      if (OCR_DOC_TARGETS.has(target)) {
        const text = toText(bytes).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return renderDocument(`<pre>${docs.escapeHtml(text)}</pre>`, "Image", target, opts);
      }
      if (target === "svgz") return arch.gzipBytes(bytes);
      if (target === "cbz" || target === "cbc") {
        return arch.filesToZip({ "page-01.png": await convertImage(bytes, "image-png", opts.canvas, opts.image, source) });
      }
      // SVG embeds directly — the browser renders it natively, no rasterization needed.
      if (target === "html") return docs.wrapImageAsHtml(bytes, "image/svg+xml", "image");
      if (target === "markdown") return docs.wrapImageAsMarkdown(bytes, "image/svg+xml", "image");
      if (target === "pdf" || target === "docx" || target === "pptx" || target === "odt" || target === "odp" || target === "rtf") {
        // Rasterize to PNG first, then pack into the container (reuses both pipelines).
        const png = await convertImage(bytes, "image-png", opts.canvas, opts.image, source);
        if (target === "pdf") return docs.imagesToPdf([{ bytes: png, name: "image" }]);
        if (target === "docx") return docs.imagesToDocx([{ bytes: png, name: "image" }]);
        if (target === "odt") return imagesToOdt([{ bytes: png, name: "image" }]);
        if (target === "odp") return imagesToOdp([{ bytes: png, name: "image" }]);
        if (target === "rtf") return toBytes(await imageToRtfDocument({ bytes: png, name: "image" }));
        return imagesToPptx([{ bytes: png, name: "image" }]);
      }
      return convertImage(bytes, target as ImageTarget, opts.canvas, opts.image, source);
    case "raw-cr2":
    case "raw-nef":
    case "raw-arw":
    case "raw-dng":
    case "raw-orf":
    case "raw-pef":
    case "raw-rw2":
    case "raw-dcr":
    case "raw-erf":
    case "raw-3fr":
    case "raw-mos":
    case "raw-raf":
    case "raw-cr3":
    case "raw-crw":
    case "raw-mrw":
    case "raw-x3f": {
      // RAW sensor data can't be demosaiced in pure TS — extract the
      // camera's own embedded JPEG preview and run it through the same
      // pipeline as any other photo.
      const preview = extractRawPreviewJpeg(bytes);
      if (target === "pdf") return docs.imagesToPdf([{ bytes: preview, name: "image" }]);
      if (target === "docx") return docs.imagesToDocx([{ bytes: preview, name: "image" }]);
      if (target === "pptx") return imagesToPptx([{ bytes: preview, name: "image" }]);
      if (target === "html") return docs.imageToHtml({ bytes: preview, name: "image" });
      if (target === "text") return toBytes(await runOcr(preview, "image", opts));
      if (target === "markdown") return docs.imageToMarkdown({ bytes: preview, name: "image" });
      if (target === "odt") return imagesToOdt([{ bytes: preview, name: "image" }]);
      if (target === "odp") return imagesToOdp([{ bytes: preview, name: "image" }]);
      if (target === "rtf") return toBytes(await imageToRtfDocument({ bytes: preview, name: "image" }));
      if (OCR_DOC_TARGETS.has(target)) {
        const text = await runOcr(preview, "image", opts);
        return renderDocument(`<pre>${docs.escapeHtml(text)}</pre>`, "Image", target, opts);
      }
      if (target === "svgz") return arch.gzipBytes(await convertImage(preview, "image-svg", opts.canvas, opts.image, "image-jpeg"));
      if (target === "cbz" || target === "cbc") {
        return arch.filesToZip({ "page-01.png": await convertImage(preview, "image-png", opts.canvas, opts.image, "image-jpeg") });
      }
      return convertImage(preview, target as ImageTarget, opts.canvas, opts.image, "image-jpeg");
    }
    case "image-heic": {
      // HEIC/HEIF photos (iPhone etc.) decode through the bundled libheif
      // WASM to a JPEG, then take the exact same pipeline as the camera RAW
      // previews above — every raster, document and OCR target.
      const jpeg = await runHeicDecode(bytes, opts);
      if (target === "pdf") return docs.imagesToPdf([{ bytes: jpeg, name: "image" }]);
      if (target === "docx") return docs.imagesToDocx([{ bytes: jpeg, name: "image" }]);
      if (target === "pptx") return imagesToPptx([{ bytes: jpeg, name: "image" }]);
      if (target === "html") return docs.imageToHtml({ bytes: jpeg, name: "image" });
      if (target === "text") return toBytes(await runOcr(jpeg, "image", opts));
      if (target === "markdown") return docs.imageToMarkdown({ bytes: jpeg, name: "image" });
      if (target === "odt") return imagesToOdt([{ bytes: jpeg, name: "image" }]);
      if (target === "odp") return imagesToOdp([{ bytes: jpeg, name: "image" }]);
      if (target === "rtf") return toBytes(await imageToRtfDocument({ bytes: jpeg, name: "image" }));
      if (OCR_DOC_TARGETS.has(target)) {
        const text = await runOcr(jpeg, "image", opts);
        return renderDocument(`<pre>${docs.escapeHtml(text)}</pre>`, "Image", target, opts);
      }
      if (target === "svgz") return arch.gzipBytes(await convertImage(jpeg, "image-svg", opts.canvas, opts.image, "image-jpeg"));
      if (target === "cbz" || target === "cbc") {
        return arch.filesToZip({ "page-01.png": await convertImage(jpeg, "image-png", opts.canvas, opts.image, "image-jpeg") });
      }
      return convertImage(jpeg, target as ImageTarget, opts.canvas, opts.image, "image-jpeg");
    }
    case "eps":
    case "ps": {
      // Full PostScript rasterisation is out of scope (no local PS
      // interpreter) — but the "DOS EPS" binary wrapper some exporters
      // write embeds a real TIFF preview. Extracting it is a genuine
      // conversion; files with no such preview throw an honest error.
      const preview = extractEpsPreviewTiff(bytes);
      if (target === "pdf") {
        const png = await convertImage(preview, "image-png", opts.canvas, opts.image, "image-tiff");
        return docs.imagesToPdf([{ bytes: png, name: "image" }]);
      }
      if (
        target === "docx" || target === "pptx" || target === "html" || target === "text" ||
        target === "markdown" || target === "odt" || target === "odp" || target === "rtf"
      ) {
        const png = await convertImage(preview, "image-png", opts.canvas, opts.image, "image-tiff");
        if (target === "docx") return docs.imagesToDocx([{ bytes: png, name: "image" }]);
        if (target === "pptx") return imagesToPptx([{ bytes: png, name: "image" }]);
        if (target === "html") return docs.imageToHtml({ bytes: png, name: "image" });
        if (target === "markdown") return docs.imageToMarkdown({ bytes: png, name: "image" });
        if (target === "odt") return imagesToOdt([{ bytes: png, name: "image" }]);
        if (target === "odp") return imagesToOdp([{ bytes: png, name: "image" }]);
        if (target === "rtf") return toBytes(await imageToRtfDocument({ bytes: png, name: "image" }));
        return toBytes(await runOcr(png, "image", opts));
      }
      if (OCR_DOC_TARGETS.has(target)) {
        const text = await runOcr(preview, "image", opts);
        return renderDocument(`<pre>${docs.escapeHtml(text)}</pre>`, "Image", target, opts);
      }
      if (target === "svgz") return arch.gzipBytes(await convertImage(preview, "image-svg", opts.canvas, opts.image, "image-tiff"));
      if (target === "cbz" || target === "cbc") {
        return arch.filesToZip({ "page-01.png": await convertImage(preview, "image-png", opts.canvas, opts.image, "image-tiff") });
      }
      return convertImage(preview, target as ImageTarget, opts.canvas, opts.image, "image-tiff");
    }
    case "pdf":
    case "ai":
      // AI files are PDF payloads — copying to .pdf is the honest native move.
      if (target === "pdf") return bytes;
      if (target === "text") return toBytes(await docs.pdfToText(bytes));
      if (target === "markdown") return toBytes(await docs.pdfToMarkdown(bytes));
      if (target === "html") return toBytes(await docs.pdfToHtml(bytes));
      // PDF → DOCX (text-based): extracts the text into a real Word file.
      // Formatting and images aren't preserved — the content is editable.
      if (target === "docx") return docs.textToDocx(await docs.pdfToText(bytes));
      // PDF → EPUB (text-based), same honest caveat as → DOCX.
      if (target === "epub") {
        const text = await docs.pdfToText(bytes);
        return docs.epubFromHtml("Document", `<pre>${docs.escapeHtml(text)}</pre>`);
      }
      // PDF → document containers: extract readable text before writing.
      if (
        target === "rtf" || target === "odt" || target === "odp" || target === "pptx" ||
        target === "pptm" || target === "potx" || target === "ppsx" || target === "docm" ||
        target === "dotx" || target === "fb2" || target === "mobi" || target === "azw" ||
        target === "prc" || target === "pdb" || target === "azw3" || target === "azw4" ||
        target === "tex" || target === "rst" || target === "org" || target === "textile" ||
        target === "mediawiki" || target === "asciidoc" || target === "htmlz" ||
        target === "txtz" || target === "mhtml" || target === "xhtml" || target === "ps" ||
        target === "eps" || target === "odg" || target === "svgz" || target === "abw" ||
        target === "zabw" || target === "cbc" ||
        target === "txt-base64" || target === "txt-hex" || target === "txt-url" || target === "opml"
      ) {
        return renderDocument(await docs.pdfToHtml(bytes), "Document", target, opts);
      }
      // Single-file path: render page 1 as PNG, then push it through the
      // raster pipeline so EVERY image target works (GIF/WebP/BMP/TIFF/
      // ICO/AVIF included). The Convert tab zips all pages via pdfToImages
      // so multi-page PDFs never lose pages.
      if (target === "cbz") {
        const pages = await docs.pdfToImages(bytes, "png", pdfCanvasDeps(opts));
        if (pages.length === 0) throw new Error("This PDF has no pages to render.");
        const files: Record<string, Uint8Array> = {};
        for (const page of pages) files[page.name] = page.bytes;
        return arch.filesToZip(files);
      }
      {
        const pages = await docs.pdfToImages(bytes, "png", pdfCanvasDeps(opts));
        if (pages.length === 0) throw new Error("This PDF has no pages to render.");
        if (target === "image-png") return pages[0]!.bytes;
        return convertImage(pages[0]!.bytes, target as ImageTarget, opts.canvas, opts.image, "image-png");
      }
    case "docx":
    case "docm":
    case "dotx": {
      const html = await docs.docxToHtml(bytes);
      if (target === "html") return toBytes(html);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "pdf") return docs.docxToPdf(bytes);
      if (target === "docx") return docs.htmlToDocx(html);
      if (target === "epub") return docs.epubFromHtml("Document", html);
      if (target === "csv") return toBytes(docs.htmlToCsv(html));
      if (target === "xlsx") return docs.csvToXlsx(docs.htmlToCsv(html));
      if (OFFICE_TARGETS.has(target)) return renderDocument(html, "Document", target, opts);
      return toBytes(docs.htmlToText(html));
    }
    case "rtf":
      return renderDocument(rtfToHtml(toText(bytes)), "Document", target, opts);
    case "odt":
      return renderDocument(odtToHtml(bytes), "Document", target, opts);
    // OpenDocument drawings keep their text in the same text:h/text:p tags
    // as ODT, so the same reader serves both flavours.
    case "odg":
      return renderDocument(odtToHtml(bytes), "Drawing", target, opts);
    case "odp":
      if (target === "odp") return slidesToOdp(odpToSlides(bytes));
      return renderDocument(slidesToHtml(odpToSlides(bytes), "Presentation"), "Presentation", target, opts);
    case "pptx":
    case "pptm":
    case "potx":
    case "ppsx":
      if (target === "odp") return slidesToOdp(pptxToSlides(bytes));
      return renderDocument(slidesToHtml(pptxToSlides(bytes), "Presentation"), "Presentation", target, opts);
    case "fb2": {
      const xml = toText(bytes);
      return renderDocument(fb2ToHtml(xml), fb2Title(xml), target, opts);
    }
    // FB3 is the compressed FictionBook variant — a gzip stream of the
    // same XML, so it funnels through the exact FB2 reader.
    case "fb3": {
      const xml = arch.gunzipToText(bytes);
      return renderDocument(fb2ToHtml(xml), fb2Title(xml), target, opts);
    }
    case "mobi":
    case "azw":
    case "prc":
    // PDB (PalmDOC), AZW3 (KF8), SNB (Samsung) and RB (Rocket eBook) are
    // all Palm databases — the same container the MOBI reader handles.
    case "pdb":
    case "azw3":
    case "snb":
    case "rb":
      return renderDocument(mobiToHtml(bytes), "Book", target, opts);
    // AZW4 wraps a PDF inside a Palm database — extract the drawing and
    // run the whole PDF pipeline, exactly like .ai files do.
    case "azw4":
      return runConversion("pdf", target, extractAzw4Pdf(bytes), opts);
    case "htmlz":
      return renderDocument(htmlzToHtml(bytes), "Book", target, opts);
    case "txtz":
      return renderDocument(txtzToHtml(bytes), "Book", target, opts);
    case "xls":
    case "xlsm":
    case "ods":
      // SheetJS reads BIFF8 and OpenDocument with the same reader the
      // .xlsx path uses, so the whole table pipeline is shared.
      if (source === "xlsm" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        throw new Error("Could not read this .xlsm - the file is not a valid OOXML package.");
      }
      // xlsm → xlsx is a macro strip: an xlsx is the same OOXML package
      // without the vbaProject.bin stream, so this keeps every cell and
      // every style instead of rebuilding from CSV.
      if (source === "xlsm" && target === "xlsx") return docs.xlsmToXlsx(bytes);
      return renderTable(await docs.xlsxToCsv(bytes), "Spreadsheet", target, opts);
    case "epub": {
      if (target === "cbz") return docs.epubImagesToCbz(bytes);
      const html = docs.epubToHtml(bytes);
      if (target === "html") return toBytes(html);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "pdf") return docs.epubToPdf(bytes);
      if (target === "docx") return docs.htmlToDocx(html);
      if (OFFICE_TARGETS.has(target) || IMAGE_OR_DOC_TARGETS.has(target)) return renderDocument(html, "Book", target, opts);
      return toBytes(docs.htmlToText(html));
    }
    case "cbz":
    case "cbc": {
      // RAR comic books (.cbr) share the CBZ extension mapping but pack a
      // different archive — say so instead of failing with a misleading
      // "not a zip" error.
      if (
        bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 &&
        bytes[3] === 0x21 && bytes[4] === 0x1a && bytes[5] === 0x07
      ) {
        throw new Error("RAR comic books (.cbr) can't be read locally — convert the archive to .cbz first.");
      }
      const entries = arch.unzipToFiles(bytes);
      const pages = Object.entries(entries)
        .filter(([name, data]) => data.length > 0 && /\.(?:png|jpe?g|gif|webp|bmp|avif|tiff?|ico|dds|tga|ppm|psd|icns)$/i.test(name))
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
      if (pages.length === 0) throw new Error("This CBZ contains no supported image pages.");
      const prepared = await Promise.all(pages.map(async ([name, pageBytes]) => {
        const pageType = detectFile(pageBytes, name).type;
        if (pageType === "image-png" || pageType === "image-jpeg") return { bytes: pageBytes, name };
        if (!pageType.startsWith("image-")) throw new Error(`Couldn't decode comic page ${name}.`);
        return {
          bytes: await convertImage(pageBytes, "image-png", opts.canvas, opts.image, pageType),
          name: name.replace(/\.[^.]+$/, ".png")
        };
      }));
      // Comic → prose: OCR every page and join them. Real OCR (tesseract.js,
      // the bundled offline engine), never a filename dump.
      if (target === "text" || target === "markdown" || OCR_DOC_TARGETS.has(target)) {
        const pageTexts: string[] = [];
        for (const page of prepared) {
          const pageText = await runOcr(page.bytes, page.name, opts);
          if (pageText.trim()) pageTexts.push(pageText);
        }
        const prose = pageTexts.join("\n\n");
        if (target === "text" || target === "markdown") return toBytes(prose);
        return renderDocument(`<pre>${docs.escapeHtml(prose)}</pre>`, "Comic text", target, opts);
      }
      if (target === "epub") return docs.epubFromImages("Comic", prepared);
      if (target === "pdf") return docs.imagesToPdf(prepared);
      if (target === "docx") return docs.imagesToDocx(prepared);
      if (target === "docm") return docs.docxToDocm(await docs.imagesToDocx(prepared));
      if (target === "dotx") return docs.docxToDotx(await docs.imagesToDocx(prepared));
      if (target === "html") {
        const imgs: string[] = [];
        for (let index = 0; index < prepared.length; index += 1) {
          const page = prepared[index]!;
          const dataUrl = await imageBytesToDataUrl(page.bytes, "image/png");
          imgs.push(`<img src="${dataUrl}" alt="page ${index + 1}"/>`);
        }
        return toBytes(`<!doctype html><html><head><meta charset="utf-8"/><title>Comic</title></head><body>${imgs.join("\n")}</body></html>`);
      }
      // Raster targets read the first page, matching the PDF → image rule.
      if (target === "image-png") return prepared[0]!.bytes;
      return convertImage(prepared[0]!.bytes, target as ImageTarget, opts.canvas, opts.image, "image-png");
    }
    case "dxf": {
      if (target === "pdf") return dxfToPdf(bytes);
      if (target === "text") return toBytes(dxfToText(bytes));
      if (target === "markdown") return toBytes(dxfToText(bytes)); // plain text is valid Markdown
      const svg = dxfToSvg(bytes);
      if (target === "html") {
        return toBytes(`<!doctype html><html><head><meta charset="utf-8"/><title>DXF drawing</title></head><body>${svg}</body></html>`);
      }
      if (target === "image-svg") return toBytes(svg);
      // Document targets render the entity inventory as a real document.
      if (!target.startsWith("image-")) {
        return renderDocument(
          `<h1>DXF drawing</h1><pre>${docs.escapeHtml(dxfToText(bytes))}</pre>`,
          "DXF drawing",
          target,
          opts
        );
      }
      return convertImage(toBytes(svg), target as ImageTarget, opts.canvas, opts.image, "image-svg");
    }
    case "markdown": {
      const md = toText(bytes);
      const html = docs.markdownToHtml(md);
      if (target === "html") return toBytes(html);
      if (target === "pdf") return docs.markdownToPdf(md);
      if (target === "docx") return docs.markdownToDocx(md);
      if (target === "epub") return docs.epubFromHtml("Document", html);
      if (target === "csv") return toBytes(docs.htmlToCsv(html));
      if (target === "xlsx") return docs.csvToXlsx(docs.htmlToCsv(html));
      if (OFFICE_TARGETS.has(target)) return renderDocument(html, "Document", target, opts);
      return toBytes(docs.htmlToText(html));
    }
    case "rst":
      return renderDocument(rstToHtml(toText(bytes)), "Document", target, opts);
    case "tex":
      return renderDocument(texToHtml(toText(bytes)), "Document", target, opts);
    case "abw":
      return renderDocument(abwToHtml(toText(bytes)), "Document", target, opts);
    // .dot (Word template) and .wps (Microsoft Works) files are content-
    // sniffed at conversion time: text/RTF/HTML/XML payloads convert like
    // the format they actually contain; binary containers throw an honest
    // error (the same rule the .eps and .xlsm paths follow).
    case "dot":
    case "wps":
    case "doc":
      return renderDocument(await sniffDocToHtml(bytes), "Document", target, opts);
    // Apple Pages: the embedded QuickLook PDF is the faithful path; text
    // extraction from the IWA blobs covers the rest.
    case "pages": {
      const preview = extractPagesPreviewPdf(bytes);
      if (target === "pdf" && preview) return preview;
      return renderDocument(pagesToHtml(bytes), "Pages document", target, opts);
    }
    // Apple Numbers: the same iWork container — the sheet's strings read
    // as prose through the shared text extraction.
    case "numbers":
      return renderDocument(numbersToHtml(bytes), "Numbers spreadsheet", target, opts);
    // Apple Keynote: same iWork container — the embedded QuickLook PDF is
    // the faithful path when present, slide text otherwise.
    case "key": {
      const preview = extractPagesPreviewPdf(bytes);
      if (target === "pdf" && preview) return preview;
      return renderDocument(keyToHtml(bytes), "Keynote presentation", target, opts);
    }
    // Legacy binary PowerPoint: the OLE2 text records are readable without
    // layout fidelity — title, bullets and notes, rendered as a document.
    case "ppt":
      return renderDocument(pptToHtml(bytes), "PowerPoint presentation", target, opts);
    // .dps (WPS Presentation) is content-sniffed like .et: an OOXML zip
    // behaves as pptx (real slides), a binary OLE2 deck as ppt (text).
    case "dps": {
      const inner = detectFile(bytes, "sniff.bin").type;
      if (inner === "pptx" || inner === "zip") return runConversion("pptx", target, bytes, opts);
      if (inner === "ppt") return runConversion("ppt", target, bytes, opts);
      throw new Error("This .dps file is a binary WPS container that can't be read locally.");
    }
    // Legacy OLE2 office documents: the document stream's text reads like
    // any other text-based source.
    case "sdw":
      return renderDocument(sdwToHtml(bytes), "StarWriter document", target, opts);
    case "sdc":
      return renderDocument(sdcToHtml(bytes), "StarCalc spreadsheet", target, opts);
    case "sda":
      return renderDocument(sdaToHtml(bytes), "StarDraw drawing", target, opts);
    case "vsd":
      return renderDocument(vsdToHtml(bytes), "Visio diagram", target, opts);
    // Psion TCR: decompress the zlib text and read it as plain prose.
    case "tcr":
      return renderDocument(tcrToHtml(bytes), "TCR text", target, opts);
    // XPS: a ZIP package whose FixedPage <Glyphs> carry the document text.
    case "xps":
      return renderDocument(xpsToHtml(bytes), "XPS document", target, opts);
    // Microsoft Publisher: OOXML run text or legacy OLE2 Quill prose.
    case "pub":
      return renderDocument(pubToHtml(bytes), "Publisher document", target, opts);
    // Windows metafiles: the supported record subset renders to SVG; the
    // text records read as prose for every document target.
    case "chm":
      // Compiled HTML Help: the LZX-compressed content stream holds every
      // help page — page text reads as prose, rendered as a document.
      return renderDocument(chmToHtml(bytes), "CHM help", target, opts);
    case "lit":
      // Microsoft Reader: the LZX-compressed binary-HTML spine reads as
      // prose through the same document renderer.
      return renderDocument(litToHtml(bytes), "LIT ebook", target, opts);
    case "cgm":
      // Binary CGM vector drawings: the primitive subset renders to SVG,
      // the TEXT records read as prose — same rule as the metafiles.
      if (target === "image-svg") return toBytes(cgmToSvg(bytes));
      if (target.startsWith("image-")) {
        return convertImage(toBytes(cgmToSvg(bytes)), target as ImageTarget, opts.canvas, opts.image, "image-svg");
      }
      return renderDocument(`<pre>${docs.escapeHtml(cgmToText(bytes))}</pre>`, "CGM metafile", target, opts);
    case "emf":
      if (target === "image-svg") return toBytes(emfToSvg(bytes));
      if (target.startsWith("image-")) {
        return convertImage(toBytes(emfToSvg(bytes)), target as ImageTarget, opts.canvas, opts.image, "image-svg");
      }
      return renderDocument(`<pre>${docs.escapeHtml(emfToText(bytes))}</pre>`, "EMF metafile", target, opts);
    case "wmf":
      if (target === "image-svg") return toBytes(wmfToSvg(bytes));
      if (target.startsWith("image-")) {
        return convertImage(toBytes(wmfToSvg(bytes)), target as ImageTarget, opts.canvas, opts.image, "image-svg");
      }
      return renderDocument(`<pre>${docs.escapeHtml(wmfToText(bytes))}</pre>`, "WMF metafile", target, opts);
    // sK1/Sketch vector drawings: basic shapes render to SVG, text objects
    // read as prose, plain-text fallback for anything unparseable.
    case "sk1":
      if (target === "image-svg") return toBytes(skToSvg(bytes));
      if (target.startsWith("image-")) {
        return convertImage(toBytes(skToSvg(bytes)), target as ImageTarget, opts.canvas, opts.image, "image-svg");
      }
      return renderDocument(skToHtml(bytes), "sK1 drawing", target, opts);
    // Shockwave Flash: the static-text tags' character runs read as prose.
    case "swf":
      return renderDocument(swfToHtml(bytes), "SWF text", target, opts);
    // Hangul Word Processor — the ZIP packaging's HWPML runs read as prose.
    case "hwpx":
      return renderDocument(hwpxToHtml(bytes), "HWP document", target, opts);
    case "hwp": {
      // Modern .hwp files are the same ZIP packaging as .hwpx; legacy
      // binary HWP is a proprietary compound format we can't read.
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return renderDocument(hwpxToHtml(bytes), "HWP document", target, opts);
      }
      throw new Error("Binary .hwp files can't be read locally — only the ZIP (HWPX) packaging.");
    }
    // Sony BBeB (LRF): the zlib/UTF-16 text streams read as prose.
    case "lrf":
      return renderDocument(lrfToHtml(bytes), "LRF book", target, opts);
    // WordPerfect: the character stream reads as prose.
    case "wpd":
      return renderDocument(wpdToHtml(bytes), "WordPerfect document", target, opts);
    // .et (WPS Spreadsheet) is content-sniffed like .dot/.wps: an OOXML
    // zip behaves as xlsx, an OLE2 workbook as xls, CSV text as a table.
    case "et": {
      const inner = detectFile(bytes, "sniff.bin").type;
      // A zip .et IS a spreadsheet by definition (OOXML or ODS flavour),
      // so any zip/office container goes through the shared SheetJS read.
      if (inner === "xlsx" || inner === "xls" || inner === "ods" || inner === "zip") {
        return renderTable(await docs.xlsxToCsv(bytes), "Spreadsheet", target, opts);
      }
      if (inner === "csv" || inner === "text" || (inner === "unknown" && isPrintable(bytes))) {
        return renderTable(toText(bytes), "Spreadsheet", target, opts);
      }
      throw new Error("This .et file is a binary WPS container that can't be read locally.");
    }
    case "geojson": {
      const records = docs.geojsonToRecords(toText(bytes));
      return routeRecords(records, "GeoJSON", target);
    }
    case "xhtml":
      // XHTML is XML-serialised HTML — drop the declaration and reuse the
      // HTML pipeline.
      return renderDocument(toText(bytes).replace(/^\s*<\?xml[^>]*\?>\s*/i, ""), "Document", target, opts);
    case "mhtml":
      return renderDocument(docs.mhtmlToHtml(bytes), "Document", target, opts);
    case "svgz":
      // A .svgz is a gzipped SVG — decompress and run the SVG pipeline.
      return runConversion("image-svg", target, toBytes(arch.gunzipToText(bytes)), opts);
    case "zabw":
      return renderDocument(zabwToHtml(bytes), "Document", target, opts);
    case "oeb":
      return renderDocument(oebToHtml(toText(bytes)), "Book", target, opts);
    case "pml":
      return renderDocument(pmlToHtml(toText(bytes)), "Book", target, opts);
    case "html": {
      const html = toText(bytes);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "text") return toBytes(docs.htmlToText(html));
      if (target === "docx") return docs.htmlToDocx(html);
      if (target === "epub") return docs.epubFromHtml("Document", html);
      if (target === "csv") return toBytes(docs.htmlToCsv(html));
      if (target === "xlsx") return docs.csvToXlsx(docs.htmlToCsv(html));
      if (OFFICE_TARGETS.has(target)) return renderDocument(html, "Document", target, opts);
      return docs.htmlToPdf(html);
    }
    case "text": {
      const text = toText(bytes);
      if (target === "txt-base64") return toBytes(txt.textToBase64(text));
      if (target === "txt-hex") return toBytes(txt.textToHex(text));
      if (target === "pdf") return docs.textToPdf(text);
      if (target === "docx") return docs.textToDocx(text);
      if (target === "epub") {
        return docs.epubFromHtml(
          "Document",
          `<pre>${docs.escapeHtml(text)}</pre>`
        );
      }
      if (target === "markdown") return toBytes(text); // plain text is valid Markdown
      if (OFFICE_TARGETS.has(target)) {
        return renderDocument(`<pre>${docs.escapeHtml(text)}</pre>`, "Document", target, opts);
      }
      if (target === "html") {
        return toBytes(
          `<!doctype html>\n<html><head><meta charset=\"utf-8\"></head>\n<body>\n<pre>${docs.escapeHtml(text)}</pre>\n</body>\n</html>`
        );
      }
      return toBytes(txt.textToUrl(text));
    }
    case "vcf": {
      const records = docs.vcfToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No VCARD blocks found in this file.");
      return routeRecords(records, "Contacts", target, opts);
    }
    case "opml": {
      const records = docs.opmlToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No <outline> entries found in this OPML file.");
      if (target === "xml") return toBytes(toText(bytes));
      if (target === "yaml") return toBytes(docs.jsonToYaml(JSON.stringify(records)));
      return routeRecords(records, "Outline", target, opts);
    }
    case "plist": {
      const records = docs.plistToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No <dict> blocks found in this plist.");
      if (target === "xml") return toBytes(toText(bytes));
      if (target === "yaml") return toBytes(docs.jsonToYaml(JSON.stringify(records)));
      return routeRecords(records, "Plist", target, opts);
    }
    case "ics": {
      const records = docs.icsToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No VEVENT blocks found in this file.");
      return routeRecords(records, "Calendar", target);
    }
    case "srt":
    case "vtt": {
      const sub = toText(bytes);
      const cues = docs.subtitlesToRecords(sub);
      if (target === "csv" || target === "json") {
        if (cues.length === 0) throw new Error("No timed cues found in this subtitle file.");
        const records = cues.map((c) => ({ index: c.index, start: c.start, end: c.end, text: c.text }));
        if (target === "json") return toBytes(JSON.stringify(records, null, 2));
        return toBytes(docs.recordsToCsv(records));
      }
      if (target === "lrc") return toBytes(docs.subtitlesToLrc(sub));
      if (target === "ass") return toBytes(docs.cuesToAss(cues));
      if (target === "sbv") return toBytes(docs.cuesToSbv(cues));
      if (target === "ttml") return toBytes(docs.cuesToTtml(cues));
      if (target === "text") return toBytes(docs.subtitlesToText(sub));
      if (target === "srt" || target === "vtt") return toBytes(source === "srt" ? docs.srtToVtt(sub) : docs.vttToSrt(sub));
      if (SHEET_TARGETS.has(target) || target === "docx" || target === "epub" || OFFICE_TARGETS.has(target)) {
        const records = cues.map((c) => ({ index: c.index, start: c.start, end: c.end, text: c.text }));
        return routeRecords(records, "Subtitles", target);
      }
      return toBytes(docs.subtitlesToText(sub));
    }
    case "m3u": {
      const records = docs.m3uToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No playlist entries found in this file.");
      return routeRecords(records, "Records", target);
    }
    case "eml": {
      const eml = toText(bytes);
      if (target === "html") return toBytes(docs.emlToHtml(eml));
      if (target === "csv") {
        const e = docs.emlToRecords(eml)[0]!;
        return toBytes(docs.recordsToCsv([{ from: e.from, to: e.to, subject: e.subject, date: e.date, body: e.body }]));
      }
      if (target === "json") return toBytes(JSON.stringify(docs.emlToRecords(eml), null, 2));
      if (target === "pdf") return docs.textToPdf(docs.emlToRecords(eml)[0]!.body);
      const body = docs.emlToRecords(eml)[0]!.body;
      if (target === "markdown") return toBytes(body);
      if (target === "docx") return docs.textToDocx(body);
      if (target === "vcf" || target === "ics" || SHEET_TARGETS.has(target) || target === "epub" || OFFICE_TARGETS.has(target)) {
        return routeRecords(docs.emlToRecords(eml) as unknown as Record<string, string>[], "Email", target);
      }
      return toBytes(body);
    }
    case "torrent": {
      const records = docs.torrentToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No file records found in this torrent.");
      return routeRecords(records, "Records", target);
    }
    case "gpx": {
      const gpx = toText(bytes);
      if (target === "kml") return toBytes(docs.gpxToKml(gpx));
      const records = docs.gpxToRecords(gpx);
      if (records.length === 0) throw new Error("No track points found in this GPX file.");
      return routeRecords(records, "Records", target);
    }
    case "kml": {
      const kml = toText(bytes);
      if (target === "gpx") return toBytes(docs.kmlToGpx(kml));
      const records = docs.kmlToRecords(kml);
      if (records.length === 0) throw new Error("No placemarks with coordinates found in this KML file.");
      return routeRecords(records, "Records", target);
    }
    case "bookmarks": {
      const records = docs.bookmarksToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No bookmarked links found in this file.");
      return routeRecords(records, "Records", target);
    }
    case "bibtex": {
      const records = docs.bibToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No @type{key, …} entries found in this BibTeX file.");
      return routeRecords(records, "Records", target);
    }
    case "jsonl": {
      const records = docs.jsonlToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No parseable JSON lines found in this file.");
      return routeRecords(records, "Records", target);
    }
    case "lrc": {
      const lrc = toText(bytes);
      if (target === "csv" || target === "json") {
        const records = docs.lrcToCues(lrc).map((c) => ({ time: String(c.timeMs), text: c.text }));
        if (target === "json") return toBytes(JSON.stringify(records, null, 2));
        return toBytes(docs.recordsToCsv(records));
      }
      if (target === "srt") return toBytes(docs.lrcToSrt(lrc));
      if (target === "vtt") return toBytes(docs.lrcToVtt(lrc));
      if (target === "ass" || target === "sbv" || target === "ttml") {
        // LRC has no end times — each cue spans 3s from its start, the
        // same convention the existing LRC → SRT path uses.
        const msToStamp = (ms: number): string => {
          const h = Math.floor(ms / 3_600_000);
          const m = Math.floor(ms / 60_000) % 60;
          const s = Math.floor(ms / 1000) % 60;
          const f = ms % 1000;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
        };
        const cues = docs.lrcToCues(lrc).map((c, i) => ({
          index: String(i + 1),
          start: msToStamp(c.timeMs),
          end: msToStamp(c.timeMs + 3000),
          text: c.text
        }));
        if (target === "ass") return toBytes(docs.cuesToAss(cues));
        if (target === "sbv") return toBytes(docs.cuesToSbv(cues));
        return toBytes(docs.cuesToTtml(cues));
      }
      if (SHEET_TARGETS.has(target) || target === "docx" || target === "epub" || OFFICE_TARGETS.has(target)) {
        const records = docs.lrcToCues(lrc).map((c) => ({ time: String(c.timeMs), text: c.text }));
        return routeRecords(records, "Lyrics", target);
      }
      return toBytes(docs.lrcToText(lrc));
    }
    case "sitemap": {
      const records = docs.sitemapToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No <url> entries found in this sitemap.");
      return routeRecords(records, "Records", target);
    }
    case "rss": {
      const records = docs.rssToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No feed items found in this file.");
      return routeRecords(records, "Records", target);
    }
    case "text-base64": {
      // text/pdf keep the pure-text decode (a base64 string of prose).
      const decoded = base64ToText(toText(bytes));
      if (!decoded.ok) throw new Error(decoded.error);
      if (target === "pdf") return docs.textToPdf(decoded.value);
      if (target === "text") return toBytes(decoded.value);
      // Any other target: decode at the byte level, sniff the REAL file
      // the base64 holds (image, PDF, document…), and convert it as that
      // format — no mangling through the UTF-8 text path.
      return convertDecodedBytes(txt.base64ToBytes(toText(bytes)), target, opts);
    }
    case "text-hex": {
      const decoded = hexToText(toText(bytes));
      if (!decoded.ok) throw new Error(decoded.error);
      if (target === "pdf") return docs.textToPdf(decoded.value);
      if (target === "text") return toBytes(decoded.value);
      return convertDecodedBytes(txt.hexToBytes(toText(bytes)), target, opts);
    }
    case "text-url": {
      const decoded = urlToText(toText(bytes));
      if (!decoded.ok) throw new Error(decoded.error);
      if (target === "pdf") return docs.textToPdf(decoded.value);
      return toBytes(decoded.value);
    }
    case "csv": {
      const csv = toText(bytes);
      if (target === "json") return toBytes(JSON.stringify(docs.csvToJson(csv), null, 2));
      if (target === "pdf") return docs.csvToPdf(csv);
      if (target === "html") return toBytes(docs.csvToHtml(csv));
      if (target === "yaml") return toBytes(docs.jsonToYaml(JSON.stringify(docs.csvToJson(csv))));
      if (target === "xml") return toBytes(docs.jsonToXml(JSON.stringify(docs.csvToJson(csv))));
      if (target === "markdown") return toBytes(docs.csvToMarkdown(csv));
      if (target === "docx") return docs.htmlToDocx(docs.csvToHtml(csv));
      if (target === "epub") return docs.epubFromHtml("Spreadsheet", docs.csvToHtml(csv));
      if (target === "jsonl") return toBytes(docs.csvToJsonl(csv));
      if (SHEET_TARGETS.has(target) || OFFICE_TARGETS.has(target)) {
        return renderTable(csv, "Spreadsheet", target, opts);
      }
      return docs.csvToXlsx(csv);
    }
    case "json": {
      const json = toText(bytes);
      if (target === "yaml") return toBytes(docs.jsonToYaml(json));
      if (target === "xml") return toBytes(docs.jsonToXml(json));
      if (target === "csv") return toBytes(docs.jsonToCsv(json));
      if (target === "html") return toBytes(docs.jsonToHtml(json));
      if (target === "pdf") return docs.textToPdf(docs.jsonToText(json));
      if (target === "xlsx") return docs.csvToXlsx(docs.jsonToCsv(json));
      if (target === "docx") return docs.textToDocx(docs.jsonToText(json));
      if (target === "epub") return docs.epubFromHtml("Data", docs.jsonToHtml(json));
      if (target === "markdown") return toBytes(`\`\`\`json\n${docs.jsonToText(json)}\n\`\`\``);
      if (target === "jsonl") return toBytes(docs.jsonToJsonl(json));
      if (target === "toml") return toBytes(docs.jsonToToml(json));
      if (SHEET_TARGETS.has(target) || OFFICE_TARGETS.has(target)) {
        return renderTable(docs.jsonToCsv(json), "Data", target);
      }
      return toBytes(docs.jsonToText(json));
    }
    case "tsv": {
      // Tab-separated is CSV with tab delimiters — swap and reuse the CSV path.
      const csv = toText(bytes).replace(/\t/g, ",");
      if (target === "csv") return toBytes(csv);
      if (target === "json") return toBytes(JSON.stringify(docs.csvToJson(csv), null, 2));
      if (target === "pdf") return docs.csvToPdf(csv);
      if (target === "xlsx") return docs.csvToXlsx(csv);
      if (target === "yaml") return toBytes(docs.jsonToYaml(JSON.stringify(docs.csvToJson(csv))));
      if (target === "xml") return toBytes(docs.jsonToXml(JSON.stringify(docs.csvToJson(csv))));
      if (target === "markdown") return toBytes(docs.csvToMarkdown(csv));
      if (target === "docx") return docs.htmlToDocx(docs.csvToHtml(csv));
      if (target === "epub") return docs.epubFromHtml("Spreadsheet", docs.csvToHtml(csv));
      if (target === "jsonl") return toBytes(docs.csvToJsonl(csv));
      if (SHEET_TARGETS.has(target) || OFFICE_TARGETS.has(target)) {
        return renderTable(csv, "Spreadsheet", target, opts);
      }
      return toBytes(docs.csvToHtml(csv));
    }
    case "yaml": {
      const yaml = toText(bytes);
      const json = docs.yamlToJson(yaml);
      if (target === "xml") return toBytes(docs.jsonToXml(json));
      if (target === "csv") return toBytes(docs.jsonToCsv(json));
      if (target === "html") return toBytes(docs.jsonToHtml(json));
      if (target === "xlsx") return docs.csvToXlsx(docs.jsonToCsv(json));
      if (target === "docx") return docs.htmlToDocx(docs.jsonToHtml(json));
      if (target === "epub") return docs.epubFromHtml("Data", docs.jsonToHtml(json));
      if (target === "markdown") return toBytes(`\`\`\`yaml\n${yaml.trim()}\n\`\`\``);
      if (target === "toml") return toBytes(docs.jsonToToml(json));
      if (SHEET_TARGETS.has(target) || OFFICE_TARGETS.has(target)) {
        return renderTable(docs.jsonToCsv(json), "Data", target);
      }
      return toBytes(json);
    }
    case "ini": {
      const text = toText(bytes);
      const json = docs.iniToJson(text);
      if (target === "text") return toBytes(text);
      if (target === "markdown") return toBytes(`\`\`\`ini\n${text.trim()}\n\`\`\``);
      if (target === "yaml") return toBytes(docs.jsonToYaml(json));
      if (target === "xml") return toBytes(docs.jsonToXml(json));
      if (target === "toml") return toBytes(docs.jsonToToml(json));
      return toBytes(json);
    }
    case "xml": {
      const xml = toText(bytes);
      if (target === "html") return toBytes(docs.jsonToHtml(docs.xmlToJson(xml)));
      if (target === "json") return toBytes(docs.xmlToJson(xml));
      if (target === "yaml") return toBytes(docs.jsonToYaml(docs.xmlToJson(xml)));
      if (target === "markdown") return toBytes(`\`\`\`xml\n${xml.trim()}\n\`\`\``);
      if (target === "xlsx") return docs.csvToXlsx(docs.xmlToCsv(xml));
      return toBytes(xml); // xml → text is a validated passthrough
    }
    case "toml": {
      const toml = toText(bytes);
      const json = docs.tomlToJson(toml);
      if (target === "json") return toBytes(json);
      if (target === "yaml") return toBytes(docs.jsonToYaml(json));
      if (target === "xml") return toBytes(docs.jsonToXml(json));
      if (target === "csv") return toBytes(docs.jsonToCsv(json));
      if (target === "markdown") return toBytes(`\`\`\`toml\n${toml.trim()}\n\`\`\``);
      return toBytes(toml); // toml → text is a validated passthrough
    }
    case "qif":
    case "ofx":
    case "gedcom":
    case "mbox":
    case "ldif":
    case "cue":
    case "ssv":
    case "psv":
    case "dif":
    case "gnumeric": {
      const text = toText(bytes);
      const records =
        source === "qif"
          ? docs.qifToRecords(text)
          : source === "ofx"
            ? docs.ofxToRecords(text)
            : source === "gedcom"
              ? docs.gedcomToRecords(text)
              : source === "mbox"
                ? docs.mboxToRecords(text)
                : source === "ldif"
                  ? docs.ldifToRecords(text)
                  : source === "cue"
                    ? docs.cueToRecords(text)
                    : source === "ssv"
                      ? docs.ssvToRecords(text)
                      : source === "psv"
                        ? docs.psvToRecords(text)
                        : source === "dif"
                          ? docs.difToRecords(text)
                          : docs.gnumericToRecords(text);
      if (records.length === 0) {
        throw new Error(`No records found in this ${TYPE_LABELS[source]} file.`);
      }
      return routeRecords(records, "Data", target);
    }
    case "xlsx": {
      if (target === "csv") return toBytes(await docs.xlsxToCsv(bytes));
      if (target === "html") return toBytes(await docs.xlsxToHtml(bytes));
      if (target === "json") return toBytes(await docs.xlsxToJson(bytes));
      const csv = await docs.xlsxToCsv(bytes);
      if (target === "yaml") return toBytes(docs.jsonToYaml(JSON.stringify(docs.csvToJson(csv))));
      if (target === "xml") return toBytes(docs.jsonToXml(JSON.stringify(docs.csvToJson(csv))));
      if (target === "markdown") return toBytes(docs.csvToMarkdown(csv));
      if (target === "pdf") return docs.csvToPdf(csv);
      if (target === "docx") return docs.htmlToDocx(docs.csvToHtml(csv));
      if (SHEET_TARGETS.has(target) || OFFICE_TARGETS.has(target)) {
        return renderTable(csv, "Spreadsheet", target, opts);
      }
      return docs.epubFromHtml("Spreadsheet", docs.csvToHtml(csv));
    }
    case "zip": {
      const files = arch.unzipToFiles(bytes);
      if (target === "tar") return arch.filesToTar(files);
      if (target === "text") {
        return toBytes(
          Object.entries(files)
            .map(([name, data]) => `${name} (${data.length} bytes)`)
            .join("\n")
        );
      }
      return arch.gzipBytes(bytes);
    }
    case "tar": {
      const files = arch.untarToFiles(bytes);
      if (target === "zip") return arch.filesToZip(files);
      if (target === "text") {
        return toBytes(
          Object.entries(files)
            .map(([name, data]) => `${name} (${data.length} bytes)`)
            .join("\n")
        );
      }
      return arch.gzipBytes(bytes);
    }
    case "gzip": {
      if (target === "text") return toBytes(arch.gunzipToText(bytes));
      if (target === "zip") return arch.gunzipAsZip(bytes);
      return arch.gunzipAsTar(bytes);
    }
    case "font-ttf":
    case "font-woff":
    case "font-woff2":
    case "font-otf":
      return convertFont(bytes, target as FontTarget);
    case "audio-wav":
      if (target === "audio-mp3") {
        const result = wavToMp3(bytes);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      if (target === "audio-flac") return wavToFlac(bytes);
      if (target === "audio-aiff") return wavToAiff(bytes);
      if (target === "audio-au") return wavToAu(bytes);
      if (target === "audio-voc") return wavToVoc(bytes);
      if (target === "audio-ogg" || target === "audio-oga") return wavToOgg(bytes);
      if (target === "audio-mp4" || target === "audio-m4b") return wavToMp4(bytes);
      return normalizeWav(bytes);
    case "audio-mp3": {
      const decode = opts.audioDecoder ?? decodeAudioInBrowser;
      if (target === "audio-flac") return anyToFlac(bytes, decode);
      if (target === "audio-aiff") return wavToAiff(await anyToWav(bytes, decode));
      if (target === "audio-au") return wavToAu(await anyToWav(bytes, decode));
      if (target === "audio-voc") return wavToVoc(await anyToWav(bytes, decode));
      if (target === "audio-ogg" || target === "audio-oga") return anyToOgg(bytes, decode);
      if (target === "audio-mp4" || target === "audio-m4b") return anyToMp4(bytes, decode);
      return anyToWav(bytes, decode);
    }
    case "audio-ogg":
    case "audio-m4a":
    case "audio-aac":
    case "audio-flac": {
      const decode = opts.audioDecoder ?? decodeAudioInBrowser;
      if (target === "audio-mp3") return anyToMp3(bytes, decode);
      if (target === "audio-flac") return anyToFlac(bytes, decode);
      if (target === "audio-aiff") return wavToAiff(await anyToWav(bytes, decode));
      if (target === "audio-au") return wavToAu(await anyToWav(bytes, decode));
      if (target === "audio-voc") return wavToVoc(await anyToWav(bytes, decode));
      if (target === "audio-ogg" || target === "audio-oga") return anyToOgg(bytes, decode);
      if (target === "audio-mp4" || target === "audio-m4b") return anyToMp4(bytes, decode);
      return anyToWav(bytes, decode);
    }
    case "audio-aiff": {
      // AIFF is big-endian PCM — parse it, then reuse the WAV pipeline.
      const parsed = parseAiff(bytes);
      const wav = samplesToWav(parsed.sampleRate, parsed.channels, parsed.samples);
      if (target === "audio-mp3") {
        const result = wavToMp3(wav);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      if (target === "audio-flac") return wavToFlac(wav);
      if (target === "audio-ogg" || target === "audio-oga") return wavToOgg(wav);
      if (target === "audio-mp4" || target === "audio-m4b") return wavToMp4(wav);
      if (target === "audio-au") return encodeAu(parsed.sampleRate, parsed.channels, parsed.samples);
      if (target === "audio-voc") return encodeVoc(parsed.sampleRate, parsed.channels, parsed.samples);
      // AIFF → AIFF: re-encodes through the same parse/re-encode pass as
      // every other target here — a real normalization pass (canonical
      // form), not a byte-identical no-op.
      if (target === "audio-aiff") return encodeAiff(parsed);
      return wav;
    }
    case "audio-au": {
      // AU is big-endian PCM — parse it, then reuse the WAV pipeline.
      const parsed = parseAu(bytes);
      const wav = samplesToWav(parsed.sampleRate, parsed.channels, parsed.samples);
      if (target === "audio-mp3") {
        const result = wavToMp3(wav);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      if (target === "audio-flac") return wavToFlac(wav);
      if (target === "audio-aiff") return encodeAiff(parsed);
      if (target === "audio-ogg" || target === "audio-oga") return wavToOgg(wav);
      if (target === "audio-mp4" || target === "audio-m4b") return wavToMp4(wav);
      if (target === "audio-voc") return encodeVoc(parsed.sampleRate, parsed.channels, parsed.samples);
      // AU → AU: same canonical re-encode pass as every other target.
      if (target === "audio-au") return encodeAu(parsed.sampleRate, parsed.channels, parsed.samples);
      return wav;
    }
    case "audio-voc": {
      // VOC is block-based PCM — parse it, then reuse the WAV pipeline.
      const parsed = parseVoc(bytes);
      const wav = samplesToWav(parsed.sampleRate, parsed.channels, parsed.samples);
      if (target === "audio-mp3") {
        const result = wavToMp3(wav);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      if (target === "audio-flac") return wavToFlac(wav);
      if (target === "audio-aiff") return wavToAiff(wav);
      if (target === "audio-au") return wavToAu(wav);
      if (target === "audio-ogg") return wavToOgg(wav);
      if (target === "audio-mp4") return wavToMp4(wav);
      if (target === "audio-voc") return encodeVoc(parsed.sampleRate, parsed.channels, parsed.samples);
      return wav;
    }
    case "audio-midi": {
      const wav = midiToWav(bytes);
      if (target === "audio-mp3") {
        const result = wavToMp3(wav);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      if (target === "audio-flac") return wavToFlac(wav);
      if (target === "audio-aiff") return wavToAiff(wav);
      if (target === "audio-au") return wavToAu(wav);
      if (target === "audio-voc") return wavToVoc(wav);
      if (target === "audio-ogg" || target === "audio-oga") return wavToOgg(wav);
      if (target === "audio-mp4" || target === "audio-m4b") return wavToMp4(wav);
      return wav;
    }
    case "video-mp4":
    case "video-webm":
    case "video-mov":
      // mp4 → mov is a pure container remux (QuickTime brand swap) — no
      // re-encoding, so it runs without any media stack. webm → mov is
      // not offered: that would need a local H.264 encoder.
      if (source === "video-mp4" && target === "video-mov") {
        return mp4ToMov(bytes);
      }
      if (target === "video-webm" || target === "video-mp4") {
        return videoToVideo(bytes, target as VideoTarget, opts.video);
      }
      if (target === "image-png" || target === "image-jpeg") {
        return videoToImage(bytes, target === "image-png" ? "png" : "jpeg", opts.videoFrames);
      }
      if (target !== "image-gif" && (IMAGE_TARGETS as TargetFormat[]).includes(target)) {
        // Grab a frame as a PNG, then reach any other raster target
        // through the same canvas pipeline still images already use.
        const png = await videoToImage(bytes, "png", opts.videoFrames);
        return convertImage(png, target as ImageTarget, opts.canvas, opts.image, "image-png");
      }
      if (target === "audio-mp3") {
        return videoToMp3(bytes, opts.videoAudio);
      }
      if (target === "audio-wav") {
        return videoToWav(bytes, opts.videoAudio);
      }
      if (target === "audio-flac") return wavToFlac(await videoToWav(bytes, opts.videoAudio));
      if (target === "audio-aiff") return wavToAiff(await videoToWav(bytes, opts.videoAudio));
      if (target === "audio-au") return wavToAu(await videoToWav(bytes, opts.videoAudio));
      if (target === "audio-ogg" || target === "audio-oga") return wavToOgg(await videoToWav(bytes, opts.videoAudio));
      if (target === "audio-mp4" || target === "audio-m4b") return wavToMp4(await videoToWav(bytes, opts.videoAudio));
      return videoToGif(bytes, opts.videoFrames);
    default:
      throw new Error("Unsupported conversion.");
  }
}
