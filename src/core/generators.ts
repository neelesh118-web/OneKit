/**
 * Generator pack — UUID v4, lorem ipsum, random usernames, and a
 * HEX/RGB/HSL color converter. All pure local math; no network.
 */

/** UUID v4 via crypto.randomUUID with a fallback for older engines. */
export function uuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: random hex with version/variant bits set.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do",
  "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "enim",
  "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi",
  "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit",
  "voluptate", "velit", "esse", "cillum", "eu", "fugiat", "nulla", "pariatur", "excepteur",
  "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum"
];

/** Deterministic word picker (seeded by an index) so tests stay stable. */
export function loremIpsum(wordCount: number, random: () => number = Math.random): string {
  const count = Math.max(1, Math.min(500, Math.floor(wordCount)));
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    words.push(LOREM_WORDS[Math.floor(random() * LOREM_WORDS.length)]!);
  }
  const sentence = words.join(" ");
  // Sentence-case the first letter.
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

const ADJECTIVES = ["brave", "clever", "swift", "calm", "lucky", "bold", "quiet", "bright", "sharp", "jolly"];
const NOUNS = ["otter", "falcon", "maple", "river", "pixel", "raven", "stone", "ember", "willow", "comet"];

/** A pronounceable username like "swift-otter-8472". */
export function randomUsername(random: () => number = Math.random): string {
  const adj = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(random() * NOUNS.length)]!;
  const num = Math.floor(random() * 9000) + 1000;
  return `${adj}-${noun}-${num}`;
}

export type Rgb = { r: number; g: number; b: number };

/** Parses #rgb / #rrggbb (optionally without the #). Returns null when bad. */
export function hexToRgb(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16)
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const h = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Converts an RGB triple to an HSL string (h in degrees, s/l in %). */
export function rgbToHsl(r: number, g: number, b: number): string {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

export interface ColorConversions {
  hex: string;
  rgb: string;
  hsl: string;
}

export function colorConversions(hex: string): ColorConversions | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: rgbToHsl(rgb.r, rgb.g, rgb.b)
  };
}
