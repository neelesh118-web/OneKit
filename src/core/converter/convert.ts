/**
 * The converter orchestrator — detect the source format, check it against
 * the honest conversion matrix, dispatch to the right module, and name the
 * output file. All conversions stay on-device.
 */
import { detectFile, TYPE_LABELS, type FileType } from "./detect";
import { TARGET_LABELS, targetExtension, targetsFor, type TargetFormat } from "./matrix";
import { convertImage, type ImageConvertSettings, type ImageTarget } from "./images";
import { convertFont, type FontTarget } from "./fonts";
import { anyToMp3, anyToWav, decodeAudioInBrowser, normalizeWav, wavToMp3, type AudioDecoder } from "./audio";
import { videoToGif, type VideoFrameExtractor } from "./video";
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
}

export const MIME_BY_TARGET: Record<TargetFormat, string> = {
  "image-png": "image/png",
  "image-jpeg": "image/jpeg",
  "image-webp": "image/webp",
  "image-avif": "image/avif",
  "image-gif": "image/gif",
  pdf: "application/pdf",
  html: "text/html",
  markdown: "text/markdown",
  text: "text/plain",
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
  "txt-base64": "text/plain",
  "txt-hex": "text/plain",
  "txt-url": "text/plain"
};

const toBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const toText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

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
      return convertImage(bytes, target as ImageTarget, opts.canvas, opts.image);
    case "pdf":
      if (target === "text") return toBytes(await docs.pdfToText(bytes));
      if (target === "markdown") return toBytes(await docs.pdfToMarkdown(bytes));
      if (target === "html") return toBytes(await docs.pdfToHtml(bytes));
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
      return toBytes(docs.htmlToText(html));
    }
    case "epub": {
      const html = docs.epubToHtml(bytes);
      if (target === "html") return toBytes(html);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "pdf") return docs.epubToPdf(bytes);
      return toBytes(docs.htmlToText(html));
    }
    case "html": {
      const html = toText(bytes);
      if (target === "markdown") return toBytes(docs.htmlToMarkdown(html));
      if (target === "text") return toBytes(docs.htmlToText(html));
      return docs.htmlToPdf(html);
    }
    case "markdown": {
      const md = toText(bytes);
      const html = docs.markdownToHtml(md);
      if (target === "html") return toBytes(html);
      if (target === "pdf") return docs.markdownToPdf(md);
      return toBytes(docs.htmlToText(html));
    }
    case "text": {
      const text = toText(bytes);
      if (target === "txt-base64") return toBytes(txt.textToBase64(text));
      if (target === "txt-hex") return toBytes(txt.textToHex(text));
      if (target === "pdf") return docs.textToPdf(text);
      return toBytes(txt.textToUrl(text));
    }
    case "csv": {
      const csv = toText(bytes);
      if (target === "json") return toBytes(JSON.stringify(docs.csvToJson(csv), null, 2));
      if (target === "pdf") return docs.csvToPdf(csv);
      return docs.csvToXlsx(csv);
    }
    case "json": {
      const json = toText(bytes);
      if (target === "yaml") return toBytes(docs.jsonToYaml(json));
      if (target === "xml") return toBytes(docs.jsonToXml(json));
      if (target === "csv") return toBytes(docs.jsonToCsv(json));
      return toBytes(docs.jsonToText(json));
    }
    case "yaml":
      return toBytes(docs.yamlToJson(toText(bytes)));
    case "xml": {
      const xml = toText(bytes);
      if (target === "json") return toBytes(docs.xmlToJson(xml));
      return toBytes(xml); // xml → text is a validated passthrough
    }
    case "xlsx":
      if (target === "csv") return toBytes(await docs.xlsxToCsv(bytes));
      return toBytes(await docs.xlsxToJson(bytes));
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
      return convertFont(bytes, target as FontTarget);
    case "audio-wav":
      if (target === "audio-mp3") {
        const result = wavToMp3(bytes);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      return normalizeWav(bytes);
    case "audio-mp3":
      return anyToWav(bytes, opts.audioDecoder ?? decodeAudioInBrowser);
    case "audio-ogg":
    case "audio-m4a":
    case "audio-flac": {
      const decode = opts.audioDecoder ?? decodeAudioInBrowser;
      if (target === "audio-mp3") return anyToMp3(bytes, decode);
      return anyToWav(bytes, decode);
    }
    case "video-mp4":
    case "video-webm":
    case "video-mov":
      return videoToGif(bytes, opts.videoFrames);
    default:
      throw new Error("Unsupported conversion.");
  }
}
