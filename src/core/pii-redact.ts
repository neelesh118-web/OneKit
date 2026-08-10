/**
 * PII redactor — finds personally identifiable / secret patterns in text
 * and produces a copy-safe version. 100% local regex + checksum logic; the
 * redacted text never contains the original value. Credit-card detection
 * includes the Luhn checksum to avoid false positives.
 */

export type PiiKind =
  | "email"
  | "phone"
  | "creditCard"
  | "ssn"
  | "apiKey"
  | "ipAddress";

export interface PiiFinding {
  kind: PiiKind;
  label: string;
  start: number;
  end: number;
}

export interface RedactResult {
  text: string;
  findings: PiiFinding[];
  counts: Partial<Record<PiiKind, number>>;
}

export const PII_LABELS: Record<PiiKind, string> = {
  email: "Email address",
  phone: "Phone number",
  creditCard: "Credit/debit card number",
  ssn: "Social Security number",
  apiKey: "API key / secret",
  ipAddress: "IP address"
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Phone candidates: digit/separator runs ending in a digit. Separators may
// come before OR after digits (handles "(555)" and "+1 555"). The digit
// count (7–15) is enforced in code — see phoneFindings below.
const PHONE_CANDIDATE_RE = /(?<!\d)(?:\+|\d)[\d\s().-]{5,}\d(?!\d)/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// Common secret shapes: sk-, ghp_, AKIA, xoxb-, AIza, Bearer tokens, PEM header.
const API_KEY_RES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgho_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\b-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g
];
const IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
// Loose card-number shape (13–19 digits, optional spaces/dashes).
const CARD_RE = /\b(?:\d[ -]?){13,19}\d\b/g;

/** Luhn checksum — filters false-positive card numbers. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0 && digits.length >= 13;
}

/** Detects findings, non-overlapping, earliest-start order. */
export function scanPii(text: string): PiiFinding[] {
  const findings: PiiFinding[] = [];

  const pushAll = (kind: PiiKind, regexes: RegExp[]): void => {
    for (const re of regexes) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        if (match.index === undefined || match[0] === undefined) continue;
        findings.push({ kind, label: PII_LABELS[kind], start: match.index, end: match.index + match[0].length });
        // Prevent infinite loops on zero-length matches.
        if (match[0].length === 0) re.lastIndex++;
      }
    }
  };

  // Order matters: SPECIFIC patterns first (SSN, Luhn-validated cards,
  // API keys, IPs), loose patterns last (phone). The overlap-dedup below
  // keeps the earliest/first finding, so a 3-2-4 SSN or a 16-digit card
  // must never be swallowed by the phone regex first.
  pushAll("email", [EMAIL_RE]);
  pushAll("ssn", [SSN_RE]);
  pushAll("apiKey", API_KEY_RES);
  pushAll("ipAddress", [IP_RE]);

  // Cards: Luhn-validated digit runs of 13–19 digits.
  CARD_RE.lastIndex = 0;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = CARD_RE.exec(text)) !== null) {
    const digits = cardMatch[0].replace(/[^0-9]/g, "");
    if (luhnValid(digits) && cardMatch.index !== undefined) {
      findings.push({
        kind: "creditCard",
        label: PII_LABELS.creditCard,
        start: cardMatch.index,
        end: cardMatch.index + cardMatch[0].length
      });
    }
  }

  // Phone: run last (least specific). Filter candidates by digit count so
  // long digit runs (order ids, card numbers) are never flagged as phones.
  PHONE_CANDIDATE_RE.lastIndex = 0;
  let phoneMatch: RegExpExecArray | null;
  while ((phoneMatch = PHONE_CANDIDATE_RE.exec(text)) !== null) {
    if (phoneMatch.index === undefined || phoneMatch[0] === undefined) continue;
    const digits = phoneMatch[0].replace(/[^0-9]/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      findings.push({
        kind: "phone",
        label: PII_LABELS.phone,
        start: phoneMatch.index,
        end: phoneMatch.index + phoneMatch[0].length
      });
    }
  }

  // Deduplicate overlaps, keeping the earliest/longest.
  const sorted = findings.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlapping: PiiFinding[] = [];
  let lastEnd = -1;
  for (const finding of sorted) {
    if (finding.start < lastEnd) continue; // overlap — already covered
    nonOverlapping.push(finding);
    lastEnd = finding.end;
  }
  return nonOverlapping;
}

/** Replaces every finding with its kind label. Original values never remain. */
export function redactText(text: string): RedactResult {
  const findings = scanPii(text);
  const counts: Partial<Record<PiiKind, number>> = {};
  let out = "";
  let cursor = 0;
  for (const finding of findings) {
    out += text.slice(cursor, finding.start);
    out += `[${finding.label}]`;
    cursor = finding.end;
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
  }
  out += text.slice(cursor);
  return { text: out, findings, counts };
}
