/**
 * WCAG contrast checker — pure local math. Takes two hex colors and
 * reports the contrast ratio plus which WCAG AA/AAA levels pass.
 */

export interface Rgb { r: number; g: number; b: number; }

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastResult {
  ratio: number;
  /** WCAG 2.x level → passes */
  normalText: { aa: boolean; aaa: boolean };
  largeText: { aa: boolean; aaa: boolean };
}

export function checkContrast(fgHex: string, bgHex: string): ContrastResult | { error: string } {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg) return { error: `"${fgHex}" is not a 6-digit hex color.` };
  if (!bg) return { error: `"${bgHex}" is not a 6-digit hex color.` };
  const ratio = contrastRatio(fg, bg);
  return {
    ratio: Math.round(ratio * 100) / 100,
    normalText: { aa: ratio >= 4.5, aaa: ratio >= 7 },
    largeText: { aa: ratio >= 3, aaa: ratio >= 4.5 }
  };
}
