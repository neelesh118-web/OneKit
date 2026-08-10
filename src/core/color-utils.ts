/**
 * Color utilities — hex ↔ RGB ↔ HSL conversions for the color picker.
 * Pure functions; the EyeDropper sampling itself lives in the content script.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** "#rrggbb" or "#rgb" → RGB, or null when malformed. */
export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let h = match[1]!;
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number): string => clampChannel(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** RGB 0–255 → HSL (h 0–360, s/l 0–100). */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = clampChannel(r) / 255;
  const gn = clampChannel(g) / 255;
  const bn = clampChannel(b) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** A readable CSS string like "rgb(123, 45, 67)". */
export function rgbCssString(rgb: Rgb): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}
