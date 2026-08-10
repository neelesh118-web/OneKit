/**
 * Text & dev toolbox — pure, local utilities: JSON format/validate, Base64,
 * URL encoding, case conversion, SHA-256 hashing, timestamp conversion,
 * regex testing, and a simple line diff. No network, no dependencies.
 */

export type ToolResult<T> = { ok: true; value: T } | { ok: false; error: string };

/* JSON ----------------------------------------------------------------- */

export function formatJson(input: string, indent = 2): ToolResult<string> {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed, null, indent) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export function minifyJson(input: string): ToolResult<string> {
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(input)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

/* Base64 ---------------------------------------------------------------- */

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function isBase64(input: string): boolean {
  if (input.length === 0 || input.length % 4 !== 0) return false;
  return [...input].every((c) => B64_CHARS.includes(c) || c === "=");
}

/** Unicode-safe Base64 encode (UTF-8 → base64 via TextEncoder). */
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64Decode(input: string): ToolResult<string> {
  try {
    if (!isBase64(input.trim())) return { ok: false, error: "That doesn't look like valid Base64 (wrong length or characters)." };
    const binary = atob(input.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch {
    return { ok: false, error: "Could not decode that Base64 string." };
  }
}

/* URL ------------------------------------------------------------------- */

export function urlEncode(text: string): string {
  return encodeURIComponent(text);
}

export function urlDecode(input: string): ToolResult<string> {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return { ok: false, error: "That string has an invalid URL escape sequence." };
  }
}

/* Case conversion -------------------------------------------------------- */

export function toTitleCase(text: string): string {
  return text
    .split(/(\s+)/)
    .map((w) => (w.trim() ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join("");
}

export function toCamelCase(text: string): string {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  return words[0]! + words.slice(1).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
}

export function toSnakeCase(text: string): string {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join("_");
}

export function toKebabCase(text: string): string {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join("-");
}

/* Hashing ---------------------------------------------------------------- */

/** SHA-256 hex digest of a string via WebCrypto (async, local). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Timestamps ------------------------------------------------------------- */

/**
 * Converts an epoch timestamp (seconds or ms, auto-detected) to a date.
 * Returns null when the value isn't a plausible timestamp.
 */
export function timestampToDate(input: string): Date | null {
  const raw = input.trim();
  if (!/^-?\d+$/.test(raw)) return null;
  const value = Number(raw);
  const ms = Math.abs(value) < 1e12 ? value * 1000 : value; // seconds vs ms
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/* Regex ------------------------------------------------------------------ */

export interface RegexTest {
  matches: string[];
  matchCount: number;
}

export function testRegex(pattern: string, flags: string, text: string): ToolResult<RegexTest> {
  try {
    const regex = new RegExp(pattern, flags);
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = regex.exec(text)) !== null && guard < 1000) {
      matches.push(match[0]!);
      guard++;
      if (match[0] === "") regex.lastIndex++; // avoid infinite loop on empty matches
    }
    return { ok: true, value: { matches, matchCount: matches.length } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid regex" };
  }
}

/* Simple diff ------------------------------------------------------------- */

export interface DiffLine {
  type: "same" | "add" | "remove";
  line: string;
}

const DIFF_MAX_LINES = 2000;

/** Line-based diff via dynamic programming (capped; falls back to set diff). */
export function simpleDiff(aText: string, bText: string): DiffLine[] {
  const a = aText.split("\n");
  const b = bText.split("\n");
  if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) return setDiff(a, b);
  // LCS via DP — find the longest common subsequence of line indices.
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", line: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: "remove", line: a[i]! });
      i++;
    } else {
      out.push({ type: "add", line: b[j]! });
      j++;
    }
  }
  while (i < a.length) {
    out.push({ type: "remove", line: a[i]! });
    i++;
  }
  while (j < b.length) {
    out.push({ type: "add", line: b[j]! });
    j++;
  }
  return out;
}

/** Fallback for huge inputs: everything not shared is add/remove. */
function setDiff(a: string[], b: string[]): DiffLine[] {
  const bSet = new Set(b);
  const aSet = new Set(a);
  const out: DiffLine[] = [];
  for (const line of a) {
    out.push(bSet.has(line) ? { type: "same", line } : { type: "remove", line });
  }
  for (const line of b) {
    if (!aSet.has(line)) out.push({ type: "add", line });
  }
  return out;
}
