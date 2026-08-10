/**
 * Code 128 barcode encoder — self-contained, no dependencies, 100% local.
 * Encodes ASCII text (Code B) with numeric runs switched to Code C, and
 * renders to an SVG string for display or download.
 */

const CODE_B: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < 95; i++) table[String.fromCharCode(32 + i)] = i;
  table["Ç"] = 96; // Code C switch marker in Code B
  return table;
})();

// Widths of the 107 Code 128 patterns (3 bars + 3 spaces + stop's extra bar).
const PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

const STOP_PATTERN = "2331112";

function barcodeCValue(n: string): number {
  // n is a two-digit string "00".."99".
  return parseInt(n, 10);
}

/** Encodes text as a list of Code 128 values (start B, switch to C for digit runs). */
export function encode128(text: string): number[] {
  const chars = [...text];
  if (chars.length === 0) throw new Error("Nothing to encode.");
  if (chars.some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126)) {
    throw new Error("Code 128 supports printable ASCII only (no emoji or accents).");
  }
  const values: number[] = [104]; // Start Code B
  let i = 0;
  while (i < chars.length) {
    const rest = chars.length - i;
    const digitRun = /^\d{2,}$/.test(chars.slice(i, i + 6).join(""));
    if (digitRun && rest >= 2) {
      // Code C run — pairs of digits become one value.
      values.push(99); // Switch to Code C
      while (i + 1 < chars.length && /^\d\d$/.test(chars[i]! + chars[i + 1]!)) {
        values.push(barcodeCValue(chars[i]! + chars[i + 1]!));
        i += 2;
      }
      values.push(100); // Switch back to Code B
    } else {
      values.push(CODE_B[chars[i]!]!);
      i += 1;
    }
  }
  return values;
}

/** Full symbol: values + checksum + stop. */
export function barcodeSymbol(text: string): { values: number[]; checksum: number } {
  const values = encode128(text);
  let checksum = values[0]!;
  for (let i = 1; i < values.length; i++) {
    checksum += values[i]! * i;
  }
  checksum %= 103;
  return { values: [...values, checksum], checksum };
}

/** Returns the pattern string (bars/spaces widths) for a barcode value. */
export function patternForValue(value: number): string {
  return PATTERNS[value] ?? "";
}

export function barcodePatterns(text: string): string[] {
  const { values } = barcodeSymbol(text);
  return [...values.map((v) => patternForValue(v)), STOP_PATTERN];
}

export interface BarcodeSvg {
  svg: string;
  widthPx: number;
  heightPx: number;
  text: string;
}

/** Renders the barcode as a self-contained SVG string. */
export function barcodeSvg(text: string, height = 60): BarcodeSvg {
  const patterns = barcodePatterns(text);
  const unit = 1;
  let x = 0;
  const bars: string[] = [];
  for (const pattern of patterns) {
    let isBar = true;
    for (const ch of pattern) {
      const w = Number(ch) * unit;
      if (isBar) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`);
      x += w;
      isBar = !isBar;
    }
  }
  const width = x;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    ...bars,
    `</svg>`
  ].join("");
  return { svg, widthPx: width, heightPx: height, text };
}

/** Builds a data URL for an <img> or download. */
export function barcodeDataUrl(text: string, height = 60): string {
  const { svg } = barcodeSvg(text, height);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
