/**
 * WordPerfect (.wpd) reader. WordPerfect publishes its file format: every
 * version starts with a 0xFF prefix byte that names the release. WP 6.0/6.1
 * (0xFF 0x00) store the body text as UTF-16LE code units with single-byte
 * function codes (0x00–0x1F, 0x80–0x9F) interleaved; the 5.x family
 * (0xFF 0x01/0x02/0x03) store 8-bit text. This reader walks the character
 * stream, skips the function codes, and keeps the printable prose — the
 * same lossy-but-real rule as the OLE2 and iWork readers.
 */
import { utf16Runs } from "./text-runs";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(text: string, title: string): string {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p)}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title></head><body><h1>${title}</h1>${paragraphs.join(
    "\n"
  )}</body></html>`;
}

/** WP 6.x: walk 2-byte code units, skipping the single-byte function codes. */
function wp6Runs(bytes: Uint8Array): string[] {
  const runs: string[] = [];
  let run = "";
  let i = 4; // skip the 4-byte prefix (2-byte id + 2-byte version pair)
  while (i < bytes.length) {
    const b = bytes[i]!;
    // Single-byte function code: 0x00–0x1F or 0x80–0x9F.
    if (b < 0x20 || (b >= 0x80 && b <= 0x9f)) {
      if (run.trim()) runs.push(run.trim());
      run = "";
      i += 1;
      continue;
    }
    const low = b;
    const high = bytes[i + 1] ?? 0;
    i += 2;
    const unit = low | (high << 8);
    if (unit >= 0x20 && unit !== 0xfffd && !(unit >= 0xd800 && unit <= 0xdfff)) {
      run += String.fromCharCode(unit);
    } else {
      if (run.trim()) runs.push(run.trim());
      run = "";
    }
  }
  if (run.trim()) runs.push(run.trim());
  // Keep only runs that look like prose (function-code noise collapses).
  return runs.filter((r) => r.length >= 2 && /[A-Za-z0-9\u00C0-\uFFFF]/.test(r));
}

/** WP 5.x: 8-bit printable runs (Latin-1 code page). */
function wp5Runs(bytes: Uint8Array): string[] {
  const runs: string[] = [];
  let run = "";
  for (let i = 2; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b >= 0x20 && b !== 0x7f) {
      run += String.fromCharCode(b);
    } else {
      if (run.trim()) runs.push(run.trim());
      run = "";
    }
  }
  if (run.trim()) runs.push(run.trim());
  return runs.filter((r) => r.length >= 2 && /[A-Za-z0-9\u00C0-\u00FF]/.test(r));
}

/** WordPerfect → HTML: the document's prose. */
export function wpdToHtml(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error("This .wpd file is too short to be a valid WordPerfect document.");
  const prefix = bytes[0];
  const family = bytes[1] ?? 0xff;
  let runs: string[] = [];
  if (prefix === 0xff && family === 0x00) {
    runs = wp6Runs(bytes);
  } else if (prefix === 0xff && family >= 0x01 && family <= 0x03) {
    runs = wp5Runs(bytes);
  } else {
    throw new Error("This .wpd file isn't a recognised WordPerfect version (5.x or 6.x).");
  }
  if (runs.length === 0) {
    throw new Error("Couldn't find readable text inside this .wpd file.");
  }
  return wrap(runs.join("\n"), "WordPerfect document");
}
