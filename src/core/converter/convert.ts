/**
 * The converter orchestrator — detect the source format, check it against
 * the honest conversion matrix, dispatch to the right module, and name the
 * output file. All conversions stay on-device.
 */
import { detectFile, TYPE_LABELS, type FileType } from "./detect";
import { TARGET_LABELS, targetExtension, targetsFor, type TargetFormat } from "./matrix";
import { convertImage, type ImageConvertSettings, type ImageTarget } from "./images";
import { convertFont, type FontTarget } from "./fonts";
import {
  anyToFlac,
  anyToMp3,
  anyToWav,
  decodeAudioInBrowser,
  normalizeWav,
  wavToFlac,
  wavToMp3,
  type AudioDecoder
} from "./audio";
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
import { base64ToText, hexToText, urlToText } from "./text";
import * as docs from "./documents";
import * as txt from "./text";
import * as arch from "./archives";

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
}

export const MIME_BY_TARGET: Record<TargetFormat, string> = {
  "image-png": "image/png",
  "image-jpeg": "image/jpeg",
  "image-webp": "image/webp",
  "image-avif": "image/avif",
  "image-gif": "image/gif",
  "image-ico": "image/x-icon",
  pdf: "application/pdf",
  html: "text/html",
  markdown: "text/markdown",
  text: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
  csv: "text/csv",
  json: "application/json",
  yaml: "application/yaml",
  xml: "application/xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  tar: "application/x-tar",
  gzip: "application/gzip",
  "font-ttf": "font/ttf",
  "font-woff": "font/woff",
  "font-woff2": "font/woff2",
  "audio-mp3": "audio/mpeg",
  "audio-wav": "audio/wav",
  "audio-flac": "audio/flac",
  "video-webm": "video/webm",
  "video-mp4": "video/mp4",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  kml: "application/vnd.google-earth.kml+xml",
  gpx: "application/gpx+xml",
  "txt-base64": "text/plain",
  "txt-hex": "text/plain",
  "txt-url": "text/plain"
};

const toBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const toText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Sources that DON'T support raw-bytes → Base64/Hex (they have their own text path). */
const NO_RAW_ENCODE = new Set<FileType>(["text", "text-base64", "text-hex", "text-url", "unknown"]);

function baseName(name: string): string {
  const cleaned = name.trim();
  const withoutExt = cleaned.replace(/\.[^./\\]+$/, "");
  return withoutExt || "converted";
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
      if (target === "pdf") return docs.imagesToPdf([{ bytes, name: "image" }]);
      return convertImage(bytes, target as ImageTarget, opts.canvas, opts.image);
    case "image-svg":
      if (target === "text") return toBytes(toText(bytes));
      if (target === "pdf") {
        // Rasterize to PNG first, then pack into a PDF (reuses both pipelines).
        const png = await convertImage(bytes, "image-png", opts.canvas, opts.image);
        return docs.imagesToPdf([{ bytes: png, name: "image" }]);
      }
      return convertImage(bytes, target as ImageTarget, opts.canvas, opts.image);
    case "pdf":
      if (target === "text") return toBytes(await docs.pdfToText(bytes));
      if (target === "markdown") return toBytes(await docs.pdfToMarkdown(bytes));
      if (target === "html") return toBytes(await docs.pdfToHtml(bytes));
      // PDF → DOCX (text-based): extracts the text into a real Word file.
      // Formatting and images aren't preserved — the content is editable.
      if (target === "docx") return docs.textToDocx(await docs.pdfToText(bytes));
      // Single-file path: the first page. The Convert tab zips all pages
      // via pdfToImages so multi-page PDFs never lose pages.
      {
        const pages = await docs.pdfToImages(bytes, target === "image-png" ? "png" : "jpeg");
        if (pages.length === 0) throw new Error("This PDF has no pages to render.");
        return pages[0]!.bytes;
      }
    case "docx": {
      const html = await docs.docxToHtml(bytes);
      if (target === "html") return toBytes(html);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "pdf") return docs.docxToPdf(bytes);
      if (target === "epub") return docs.epubFromHtml("Document", html);
      return toBytes(docs.htmlToText(html));
    }
    case "epub": {
      const html = docs.epubToHtml(bytes);
      if (target === "html") return toBytes(html);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "pdf") return docs.epubToPdf(bytes);
      if (target === "docx") return docs.htmlToDocx(html);
      return toBytes(docs.htmlToText(html));
    }
    case "markdown": {
      const md = toText(bytes);
      const html = docs.markdownToHtml(md);
      if (target === "html") return toBytes(html);
      if (target === "pdf") return docs.markdownToPdf(md);
      if (target === "docx") return docs.markdownToDocx(md);
      if (target === "epub") return docs.epubFromHtml("Document", html);
      return toBytes(docs.htmlToText(html));
    }
    case "html": {
      const html = toText(bytes);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "text") return toBytes(docs.htmlToText(html));
      if (target === "docx") return docs.htmlToDocx(html);
      if (target === "epub") return docs.epubFromHtml("Document", html);
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
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "ics": {
      const records = docs.icsToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No VEVENT blocks found in this file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "srt":
    case "vtt": {
      const sub = toText(bytes);
      if (target === "csv" || target === "json") {
        const records = docs.subtitlesToRecords(sub);
        if (records.length === 0) throw new Error("No timed cues found in this subtitle file.");
        if (target === "json") return toBytes(JSON.stringify(records, null, 2));
        return toBytes(docs.recordsToCsv(records));
      }
      if (target === "text") return toBytes(docs.subtitlesToText(sub));
      return toBytes(source === "srt" ? docs.srtToVtt(sub) : docs.vttToSrt(sub));
    }
    case "gpx": {
      const gpx = toText(bytes);
      if (target === "kml") return toBytes(docs.gpxToKml(gpx));
      const records = docs.gpxToRecords(gpx);
      if (records.length === 0) throw new Error("No track points found in this GPX file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "kml": {
      const kml = toText(bytes);
      if (target === "gpx") return toBytes(docs.kmlToGpx(kml));
      const records = docs.kmlToRecords(kml);
      if (records.length === 0) throw new Error("No placemarks with coordinates found in this KML file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "bookmarks": {
      const records = docs.bookmarksToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No bookmarked links found in this file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "bibtex": {
      const records = docs.bibToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No @type{key, …} entries found in this BibTeX file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "jsonl": {
      const records = docs.jsonlToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No parseable JSON lines found in this file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
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
      return toBytes(docs.lrcToText(lrc));
    }
    case "sitemap": {
      const records = docs.sitemapToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No <url> entries found in this sitemap.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "rss": {
      const records = docs.rssToRecords(toText(bytes));
      if (records.length === 0) throw new Error("No feed items found in this file.");
      if (target === "json") return toBytes(JSON.stringify(records, null, 2));
      if (target === "csv") return toBytes(docs.recordsToCsv(records));
      if (target === "xlsx") return docs.csvToXlsx(docs.recordsToCsv(records));
      if (target === "markdown") return toBytes(docs.recordsToMarkdown(records));
      if (target === "text") return toBytes(docs.recordsToText(records));
      return toBytes(docs.recordsToHtml(records));
    }
    case "text-base64": {
      const decoded = base64ToText(toText(bytes));
      if (!decoded.ok) throw new Error(decoded.error);
      if (target === "pdf") return docs.textToPdf(decoded.value);
      return toBytes(decoded.value);
    }
    case "text-hex": {
      const decoded = hexToText(toText(bytes));
      if (!decoded.ok) throw new Error(decoded.error);
      if (target === "pdf") return docs.textToPdf(decoded.value);
      return toBytes(decoded.value);
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
      return toBytes(json);
    }
    case "ini": {
      const text = toText(bytes);
      const json = docs.iniToJson(text);
      if (target === "text") return toBytes(text);
      if (target === "yaml") return toBytes(docs.jsonToYaml(json));
      if (target === "xml") return toBytes(docs.jsonToXml(json));
      return toBytes(json);
    }
    case "xml": {
      const xml = toText(bytes);
      if (target === "html") return toBytes(docs.jsonToHtml(docs.xmlToJson(xml)));
      if (target === "json") return toBytes(docs.xmlToJson(xml));
      if (target === "yaml") return toBytes(docs.jsonToYaml(docs.xmlToJson(xml)));
      return toBytes(xml); // xml → text is a validated passthrough
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
      return docs.epubFromHtml("Spreadsheet", docs.csvToHtml(csv));
    }
    case "zip": {
      const files = arch.unzipToFiles(bytes);
      if (target === "tar") return arch.filesToTar(files);
      return arch.gzipBytes(bytes);
    }
    case "tar": {
      const files = arch.untarToFiles(bytes);
      if (target === "zip") return arch.filesToZip(files);
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
      return normalizeWav(bytes);
    case "audio-mp3":
      if (target === "audio-flac") return anyToFlac(bytes, opts.audioDecoder ?? decodeAudioInBrowser);
      return anyToWav(bytes, opts.audioDecoder ?? decodeAudioInBrowser);
    case "audio-ogg":
    case "audio-m4a":
    case "audio-flac": {
      const decode = opts.audioDecoder ?? decodeAudioInBrowser;
      if (target === "audio-mp3") return anyToMp3(bytes, decode);
      if (target === "audio-flac") return anyToFlac(bytes, decode);
      return anyToWav(bytes, decode);
    }
    case "video-mp4":
    case "video-webm":
    case "video-mov":
      if (target === "video-webm" || target === "video-mp4") {
        return videoToVideo(bytes, target as VideoTarget, opts.video);
      }
      if (target === "image-png" || target === "image-jpeg") {
        return videoToImage(bytes, target === "image-png" ? "png" : "jpeg", opts.videoFrames);
      }
      if (target === "audio-mp3") {
        return videoToMp3(bytes, opts.videoAudio);
      }
      if (target === "audio-wav") {
        return videoToWav(bytes, opts.videoAudio);
      }
      return videoToGif(bytes, opts.videoFrames);
    default:
      throw new Error("Unsupported conversion.");
  }
}
