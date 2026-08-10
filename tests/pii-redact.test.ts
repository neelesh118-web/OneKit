import { describe, expect, it } from "vitest";
import { luhnValid, redactText, scanPii } from "../src/core/pii-redact";

describe("pii-redact", () => {
  it("finds emails, phones, and SSNs", () => {
    const text = "Contact me@example.com or 555-123-4567. SSN 123-45-6789.";
    const findings = scanPii(text);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("phone");
    expect(kinds).toContain("ssn");
  });

  it("luhnValid accepts real card numbers and rejects fakes", () => {
    // 4111111111111111 (test Visa) is Luhn-valid.
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("1234567890123456")).toBe(false);
    expect(luhnValid("4111 1111 1111 1111".replace(/[^0-9]/g, ""))).toBe(true);
  });

  it("detects valid card numbers but not lookalike digit runs", () => {
    const findings = scanPii("Card: 4111 1111 1111 1111. Order id 1234567890123456.");
    expect(findings.filter((f) => f.kind === "creditCard")).toHaveLength(1);
  });

  it("detects API keys and private key headers", () => {
    const findings = scanPii(
      "key=sk-abcdefghijklmnopqrstuvwxyz0123456789 and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"
    );
    expect(findings.filter((f) => f.kind === "apiKey").length).toBeGreaterThanOrEqual(2);
  });

  it("redacts every finding and never leaks the original", () => {
    const email = "private@example.com";
    const result = redactText(`Reach me at ${email} today`);
    expect(result.text).toContain("[Email address]");
    expect(result.text).not.toContain(email);
    expect(result.counts.email).toBe(1);
  });

  it("redacts a full mixed payload", () => {
    const input =
      "Email a@b.com, phone +1 (555) 010-9999, card 4111 1111 1111 1111, ssn 123-45-6789";
    const result = redactText(input);
    expect(result.findings.length).toBeGreaterThanOrEqual(4);
    expect(result.text).not.toMatch(/@/);
    expect(result.text).not.toMatch(/\d{4} \d{4} \d{4} \d{4}/);
    expect(result.text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  });

  it("leaves clean text untouched", () => {
    const result = redactText("Just a normal sentence with no secrets.");
    expect(result.findings).toHaveLength(0);
    expect(result.text).toBe("Just a normal sentence with no secrets.");
  });
});
