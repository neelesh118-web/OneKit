/**
 * Password generator + strength estimator. Cryptographically random via
 * crypto.getRandomValues; each selected character class is guaranteed at
 * least one character. Pure functions, fully testable.
 */

export interface PasswordOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  /** Drop look-alike characters (0/O/1/l/I/|/` etc.). */
  excludeAmbiguous: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true
};

export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";
const AMBIGUOUS = "0O1lI|`'\"";

function charsetFor(opts: PasswordOptions): { charset: string; classes: string[] } {
  let classes: string[] = [];
  if (opts.upper) classes.push(UPPER);
  if (opts.lower) classes.push(LOWER);
  if (opts.digits) classes.push(DIGITS);
  if (opts.symbols) classes.push(SYMBOLS);
  if (classes.length === 0) {
    // Nothing selected — fall back to lower-case so the tool never errors
    // into an empty password.
    classes.push(LOWER);
  }
  if (opts.excludeAmbiguous) {
    // Filter each class INDIVIDUALLY (not just the joined charset) so the
    // per-class guarantee below can never reintroduce an ambiguous char.
    classes = classes.map((c) => [...c].filter((ch) => !AMBIGUOUS.includes(ch)).join(""));
  }
  const charset = classes.join("");
  return { charset, classes };
}

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % max;
}

export function generatePassword(opts: PasswordOptions = DEFAULT_PASSWORD_OPTIONS): string {
  const length = Math.min(
    PASSWORD_MAX_LENGTH,
    Math.max(PASSWORD_MIN_LENGTH, Math.floor(opts.length) || DEFAULT_PASSWORD_OPTIONS.length)
  );
  const { charset, classes } = charsetFor(opts);
  const chars: string[] = [];
  // Guarantee one char from each selected class.
  for (const cls of classes) {
    chars.push(cls[randomIndex(cls.length)]!);
  }
  // Fill the rest from the full charset.
  while (chars.length < length) {
    chars.push(charset[randomIndex(charset.length)]!);
  }
  // Fisher–Yates shuffle so the guaranteed chars aren't front-loaded.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j]!;
    chars[j] = tmp!;
  }
  return chars.join("");
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  entropyBits: number;
}

/**
 * Rough entropy estimate: length × log2(unique charset size), adjusted for
 * common-class mixtures. Honest ballpark, not a replacement for a real
 * password strength meter with dictionary checks.
 */
export function estimateStrength(password: string): StrengthResult {
  if (!password) return { score: 0, label: "Very weak", entropyBits: 0 };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  if (pool === 0) pool = 1;
  const entropy = Math.round(password.length * Math.log2(pool));
  const score =
    entropy < 28 ? 0 : entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 90 ? 3 : 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;
  return { score: score as StrengthResult["score"], label: labels[score]!, entropyBits: entropy };
}
