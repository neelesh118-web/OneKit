import qrcode from "qrcode-generator";

/**
 * QR generator — renders any text/URL to an SVG data URL entirely on-device.
 * The `qrcode-generator` package is a zero-dependency pure-JS encoder; no
 * network, no QR service, nothing leaves the device. SVG keeps the code
 * crisp at any display size.
 */

export interface QrResult {
  dataUrl: string;
  /** Width/height in pixels of the generated image. */
  sizePx: number;
  /** Number of modules (cells) in the QR grid. */
  modules: number;
}

export const QR_MAX_INPUT_CHARS = 1000;

/**
 * Creates a QR PNG data URL. Throws on empty input (callers surface an
 * honest "nothing to encode" message rather than a broken image).
 */
export function qrDataUrl(text: string, cellSize: number = 6): QrResult {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Nothing to encode — enter a URL or text first.");
  }
  if (trimmed.length > QR_MAX_INPUT_CHARS) {
    throw new Error(`Input too long (${trimmed.length} chars) — max ${QR_MAX_INPUT_CHARS}.`);
  }
  // Type 0 = auto-detect the smallest grid that fits the data.
  const qr = qrcode(0, "M");
  qr.addData(trimmed);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const margin = 2;
  const svg = qr.createSvgTag({ cellSize, margin });
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return {
    dataUrl,
    sizePx: (moduleCount + margin * 2) * cellSize,
    modules: moduleCount
  };
}
