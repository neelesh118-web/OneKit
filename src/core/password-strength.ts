/**
 * Password strength analysis — 100% local, no network.
 * Scores 0–4, estimates entropy, detects common patterns, and gives an
 * honest "crack time" ballpark using a conservative offline-guess model.
 */

export interface PasswordAnalysis {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  entropyBits: number;
  /** Human-friendly crack-time estimate at ~1e10 guesses/sec (GPU). */
  crackTime: string;
  issues: string[];
}

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456", "12345678", "123456789",
  "1234567890", "qwerty", "qwerty123", "abc123", "letmein", "welcome", "admin",
  "admin123", "iloveyou", "monkey", "dragon", "football", "baseball", "trustno1",
  "sunshine", "master", "hello", "freedom", "whatever", "ninja", "princess",
  "shadow", "superman", "batman", "654321", "111111", "000000", "passw0rd",
  "1q2w3e4r", "qwertyuiop", "asdfghjkl", "zaq12wsx", "letmein1", "password!"
]);

const KEYBOARD_ROWS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM",
  "1234567890", "!@#$%^&*()"
];

function poolSize(password: string): number {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  return pool;
}

function hasKeyboardSequence(password: string): boolean {
  const lower = password.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i < row.length - 2; i++) {
      const seq = row.slice(i, i + 3);
      if (lower.includes(seq)) return true;
    }
  }
  return false;
}

function formatCrackTime(seconds: number): string {
  const GUESSES_PER_SEC = 1e10; // conservative offline GPU cluster
  const sec = seconds / GUESSES_PER_SEC;
  if (sec < 1) return "instantly";
  if (sec < 60) return `${Math.max(1, Math.round(sec))} seconds`;
  if (sec < 3600) return `${Math.round(sec / 60)} minutes`;
  if (sec < 86400) return `${Math.round(sec / 3600)} hours`;
  if (sec < 86400 * 30) return `${Math.round(sec / 86400)} days`;
  if (sec < 86400 * 365) return `${Math.round(sec / (86400 * 30))} months`;
  if (sec < 86400 * 365 * 100) return `${Math.round(sec / (86400 * 365))} years`;
  return `${Math.round(sec / (86400 * 365 * 1000))} millennia`;
}

/** Rough entropy: pool^length with a common-password penalty. */
export function estimateEntropy(password: string): number {
  const pool = poolSize(password);
  if (pool === 0) return 0;
  const length = password.length;
  // Sequential patterns make real entropy far lower than pool^length.
  const patternPenalty = hasKeyboardSequence(password) ? 0.55 : 1;
  const repeated = /(.)\1{2,}/.test(password) ? 0.7 : 1;
  return Math.max(0, Math.log2(Math.pow(pool, length)) * patternPenalty * repeated);
}

export function analyzePassword(password: string): PasswordAnalysis {
  const issues: string[] = [];
  if (!password) {
    return { score: 0, label: "Empty", entropyBits: 0, crackTime: "instantly", issues: ["No password entered."] };
  }
  if (password.length < 8) issues.push("Shorter than 8 characters.");
  if (!/[a-z]/.test(password)) issues.push("No lowercase letters.");
  if (!/[A-Z]/.test(password)) issues.push("No uppercase letters.");
  if (!/[0-9]/.test(password)) issues.push("No digits.");
  if (!/[^a-zA-Z0-9]/.test(password)) issues.push("No symbols.");
  if (hasKeyboardSequence(password)) issues.push("Contains a keyboard sequence (e.g. qwerty, 1234).");
  if (/(.)\1{2,}/.test(password)) issues.push("Contains a repeated run of the same character.");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push("This is one of the most common passwords in the world.");

  const entropyBits = estimateEntropy(password);
  const crackTime = formatCrackTime(Math.pow(2, entropyBits));

  let score: 0 | 1 | 2 | 3 | 4;
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || password.length < 6) score = 0;
  else if (password.length < 8 || entropyBits < 28) score = 1;
  else if (entropyBits < 45) score = 2;
  else if (entropyBits < 70) score = 3;
  else score = 4;

  const labels = ["Very weak", "Weak", "Fair", "Strong", "Excellent"] as const;
  return { score, label: labels[score], entropyBits: Math.round(entropyBits * 10) / 10, crackTime, issues };
}
