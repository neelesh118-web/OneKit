import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD_OPTIONS,
  estimateStrength,
  generatePassword,
  type PasswordOptions
} from "../src/core/password-gen";

describe("password-gen", () => {
  it("generates a password of the requested length", () => {
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 20 }).length).toBe(20);
  });

  it("clamps length to sane bounds", () => {
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 2 }).length).toBe(4);
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 500 }).length).toBe(128);
  });

  it("includes at least one char from every selected class", () => {
    const pw = generatePassword({
      length: 12,
      upper: true,
      lower: true,
      digits: true,
      symbols: true,
      excludeAmbiguous: false
    });
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
  });

  it("excludes ambiguous characters when asked", () => {
    const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, excludeAmbiguous: true });
    expect(/[0O1lI|`'"]/.test(pw)).toBe(false);
  });

  it("produces different values across calls", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });

  it("falls back to lower-case when no classes are selected", () => {
    const pw = generatePassword({
      length: 10,
      upper: false,
      lower: false,
      digits: false,
      symbols: false,
      excludeAmbiguous: false
    });
    expect(pw).toMatch(/^[a-z]{10}$/);
  });

  it("estimates strength honestly", () => {
    expect(estimateStrength("").score).toBe(0);
    expect(estimateStrength("password").score).toBeLessThan(3);
    expect(estimateStrength("T!r0ub4dor&Max3").score).toBeGreaterThanOrEqual(3);
    expect(estimateStrength("a".repeat(60)).entropyBits).toBeGreaterThan(100);
  });
});
