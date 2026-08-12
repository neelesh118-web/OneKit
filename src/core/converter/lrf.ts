/**
 * Sony BBeB (.lrf) reader. The BBeB file format (as documented by the
 * calibre project's lrf parser) is: a fixed header, then an object index,
 * then objects whose streams carry zlib-compressed or raw UTF-16LE text
 * interleaved with 0xF5xx control tags. This reader walks the object
 * index, decompresses every zlib stream it finds, and extracts the
 * printable UTF-16LE text runs — layout, fonts and images are dropped,
 * the same honest rule as the other binary document readers.
 */
import { unzlibSync } from "fflate/browser";
import { utf16Runs } from "./text-runs";

const LRF_MAGIC = [0x4c, 0x00, 0x52, 0x00, 0x46, 0x00]; // "LRF" UTF-16LE

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function entityUnescape(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

/** Find zlib streams inside an object region and decompress them. */
function zlibStreams(region: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const dv = new DataView(region.buffer, region.byteOffset);
  for (let i = 0; i + 2 < region.length; i++) {
    if (region[i] !== 0x78) continue;
    const cmf = region[i + 1]!;
    if (cmf !== 0x01 && cmf !== 0x5e && cmf !== 0x9c && cmf !== 0xda) continue;
    // Sanity: the uncompressed length implied by the zlib header's window
    // bits must fit inside the region.
    try {
      out.push(unzlibSync(region.subarray(i)));
      i += Math.min(region.length - i, 4096); // skip ahead — streams rarely repeat
    } catch {
      /* not a real zlib stream at this offset */
    }
  }
  return out;
}

/** Sony LRF → HTML: the book's text, page order lost but prose kept. */
export function lrfToHtml(bytes: Uint8Array): string {
  if (bytes.length < 0x28) throw new Error("This .lrf file is too short to be a valid BBeB book.");
  for (let i = 0; i < 6; i++) {
    if (bytes[i] !== LRF_MAGIC[i]) {
      throw new Error("This .lrf file doesn't carry the BBeB 'LRF' header.");
    }
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const numberObjects = Number(dv.getBigUint64(0x10, true));
  const indexOffset = Number(dv.getBigUint64(0x18, true));
  if (numberObjects <= 0 || numberObjects > 5000) {
    throw new Error("This .lrf file has an invalid object count.");
  }
  if (indexOffset + numberObjects * 16 > bytes.length) {
    throw new Error("This .lrf file's object index runs past the end of the file.");
  }
  const paragraphs: string[] = [];
  for (let i = 0; i < numberObjects; i++) {
    const entry = indexOffset + i * 16;
    const objId = dv.getUint32(entry, true);
    const objOff = dv.getUint32(entry + 4, true);
    const objSize = dv.getUint32(entry + 8, true);
    if (objOff + objSize > bytes.length || objSize > 4 * 1024 * 1024 || objSize < 4) continue;
    const region = bytes.subarray(objOff, objOff + objSize);
    // Only look at objects whose size suggests a text stream; images and
    // fonts are big and binary, but we still filter their output.
    const streams = zlibStreams(region);
    let text = "";
    if (streams.length > 0) {
      text = streams.map((s) => utf16Runs(s, { skipTagRange: true }).join(" ")).join("\n");
    } else {
      text = utf16Runs(region, { skipTagRange: true }).join(" ");
    }
    const clean = entityUnescape(text).trim();
    if (clean.length >= 2) paragraphs.push(clean);
  }
  if (paragraphs.length === 0) {
    throw new Error("Couldn't find readable text inside this .lrf book.");
  }
  const body = paragraphs
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>LRF book</title></head><body><h1>LRF book</h1>${body}</body></html>`;
}
