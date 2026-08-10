/**
 * Contact extractor — emails and phone numbers from the current page,
 * copied as a clean list. Researchers, freelancers, and business devs
 * constantly scrape contact info by hand; this does it in one click with
 * honest deduplication. Pure local text scanning.
 */

export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  /** Hosts found in the extracted emails (unique, for a quick sanity check). */
  emailHosts: string[];
}

export const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Tighter email regex for validation — no consecutive dots, no dots at
 * edges, real TLD of 2+ letters. */
const EMAIL_VALID = /^[a-zA-Z0-9]+(?:[._%+-][a-zA-Z0-9]+)*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

/** Extracts unique emails from text. */
export function extractEmails(text: string): string[] {
  const matches = (text.match(EMAIL_PATTERN) ?? [])
    .map((e) => e.trim().toLowerCase().replace(/[.,;:]+$/, ""))
    .filter((e) => EMAIL_VALID.test(e));
  return [...new Set(matches)].sort();
}

/** Normalizes a phone number string into a display form. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length >= 8) return `+${digits}`;
  return raw.trim();
}

/** Extracts unique phone-like numbers from text (7–15 digits). */
export function extractPhones(text: string): string[] {
  const patterns = [
    /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /\+\d{1,3}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{4,}/g
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.match(pattern) ?? []) {
      const normalized = normalizePhone(match);
      const digits = normalized.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) found.add(normalized);
    }
  }
  return [...found].sort();
}

/** Full extraction from a page's text (body innerText or a custom string). */
export function extractContacts(text: string): ExtractedContacts {
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const hosts = new Set<string>();
  for (const email of emails) {
    const host = email.split("@")[1];
    if (host) hosts.add(host);
  }
  return { emails, phones, emailHosts: [...hosts].sort() };
}

/** Renders the contacts as a copy-ready plain-text block. */
export function contactsToText(contacts: ExtractedContacts): string {
  const parts: string[] = [];
  if (contacts.emails.length > 0) {
    parts.push("Emails:", ...contacts.emails);
  }
  if (contacts.phones.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push("Phones:", ...contacts.phones);
  }
  return parts.join("\n");
}

/** Renders contacts as CSV (two columns). */
export function contactsToCsv(contacts: ExtractedContacts): string {
  const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    ...contacts.emails.map((e) => [e, "email"]),
    ...contacts.phones.map((p) => [p, "phone"])
  ];
  return [["contact", "type"], ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
