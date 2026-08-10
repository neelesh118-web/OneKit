/**
 * Vault health report — strength/reuse/weakness scan across the whole
 * local password vault. The per-password strength analyzer grades one
 * password; this grades the entire vault: weak passwords, reused
 * passwords, short passwords, and count of sites. Pure local analysis of
 * vault entries the user has already unlocked.
 */

export interface VaultEntryLike {
  site: string;
  username: string;
  password: string;
}

/** The same common-password list used by the strength analyzer. */
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "123456789", "qwerty", "abc123", "password1",
  "111111", "123123", "admin", "letmein", "welcome", "monkey", "dragon", "sunshine",
  "iloveyou", "trustno1", "shadow", "master", "654321", "1234567", "1234567890",
  "000000", "qwerty123", "p@ssw0rd", "passw0rd", "password123", "changeme", "test"
]);

export interface PasswordStrengthScore {
  /** 0–4 (weak → strong). */
  level: number;
  label: string;
  issues: string[];
}

/** Grades a single password (subset of the strength analyzer's logic). */
export function gradePassword(password: string): PasswordStrengthScore {
  const issues: string[] = [];
  let level = 0;
  if (password.length >= 8) level++;
  else issues.push("shorter than 8 characters");
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) level++;
  else issues.push("no mix of upper and lower case");
  if (/\d/.test(password)) level++;
  else issues.push("no digits");
  if (/[^a-zA-Z0-9]/.test(password)) level++;
  else issues.push("no symbols");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    level = 0;
    issues.unshift("common password — instantly guessable");
  }
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  return { level, label: labels[level] ?? "Weak", issues };
}

export interface VaultHealthReport {
  total: number;
  weak: Array<{ site: string; username: string; label: string }>;
  reused: Array<{ password: string; sites: string[] }>;
  short: Array<{ site: string; passwordLength: number }>;
  common: Array<{ site: string; password: string }>;
  strong: number;
}

/** Builds the full report from vault entries. */
export function buildVaultHealthReport(entries: VaultEntryLike[]): VaultHealthReport {
  const weak: VaultHealthReport["weak"] = [];
  const short: VaultHealthReport["short"] = [];
  const common: VaultHealthReport["common"] = [];
  const byPassword = new Map<string, string[]>();
  let strong = 0;

  for (const entry of entries) {
    const grade = gradePassword(entry.password);
    if (grade.level <= 1) {
      weak.push({ site: entry.site, username: entry.username, label: grade.label });
    } else {
      strong++;
    }
    if (entry.password.length < 8) short.push({ site: entry.site, passwordLength: entry.password.length });
    if (COMMON_PASSWORDS.has(entry.password.toLowerCase())) common.push({ site: entry.site, password: entry.password });
    const sites = byPassword.get(entry.password) ?? [];
    sites.push(entry.site);
    byPassword.set(entry.password, sites);
  }

  const reused = [...byPassword.entries()]
    .filter(([, sites]) => sites.length > 1)
    .map(([password, sites]) => ({ password, sites }))
    .sort((a, b) => b.sites.length - a.sites.length);

  return { total: entries.length, weak, reused, short, common, strong };
}

/** One-line summary for the popup. */
export function healthSummary(report: VaultHealthReport): string {
  if (report.total === 0) return "No passwords in the vault yet — add some to get a health report.";
  const problems = report.weak.length + report.reused.length + report.common.length;
  if (problems === 0) return `Healthy — all ${report.total} passwords are unique and reasonably strong.`;
  return `${report.total} passwords: ${report.weak.length} weak, ${report.reused.length} reused group${report.reused.length === 1 ? "" : "s"}, ${report.common.length} common.`;
}
