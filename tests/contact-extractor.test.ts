import { describe, expect, it } from "vitest";
import {
  contactsToCsv,
  contactsToText,
  extractContacts,
  extractEmails,
  extractPhones,
  normalizePhone
} from "../src/core/contact-extractor";

describe("contact extractor", () => {
  it("extracts and dedupes emails", () => {
    const emails = extractEmails("mail a@b.com and A@B.com plus c@d.co.uk, then trailing c@d.co.uk.");
    expect(emails).toEqual(["a@b.com", "c@d.co.uk"]);
  });

  it("filters malformed email-ish tokens", () => {
    const emails = extractEmails("foo@bar and a..b@c.com and x@y.z");
    expect(emails).toEqual([]);
  });

  it("normalizes US phone numbers", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("(555) 123-4567");
    expect(normalizePhone("5551234567")).toBe("(555) 123-4567");
    expect(normalizePhone("+1 555 123 4567")).toBe("+1 (555) 123-4567");
    expect(normalizePhone("+442071234567")).toBe("+442071234567");
  });

  it("extracts phones in common formats", () => {
    const phones = extractPhones("Call 555-123-4567 or (555) 987-6543 today");
    expect(phones).toContain("(555) 123-4567");
    expect(phones).toContain("(555) 987-6543");
  });

  it("keeps only 7-15 digit phone-like numbers", () => {
    const phones = extractPhones("short 123-45 and long +1 234 567 890 123 456");
    expect(phones).toHaveLength(0);
  });

  it("extracts both kinds plus hosts", () => {
    const contacts = extractContacts("Email info@acme.com or joe@acme.co.uk, phone 555-0100, mobile (555) 010-1234");
    expect(contacts.emails).toEqual(["info@acme.com", "joe@acme.co.uk"]);
    expect(contacts.emailHosts).toEqual(["acme.co.uk", "acme.com"]);
    expect(contacts.phones.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a copy-ready text block", () => {
    const text = contactsToText({
      emails: ["a@b.com"],
      phones: ["(555) 123-4567"],
      emailHosts: ["b.com"]
    });
    expect(text).toContain("Emails:");
    expect(text).toContain("a@b.com");
    expect(text).toContain("Phones:");
  });

  it("renders CSV with headers and escaping", () => {
    const csv = contactsToCsv({
      emails: ["a@b.com"],
      phones: [],
      emailHosts: []
    });
    expect(csv.split("\n")[0]).toBe('"contact","type"');
    expect(csv).toContain('"a@b.com","email"');
  });
});
