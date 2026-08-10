// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzePassword, estimateEntropy } from "../src/core/password-strength";

describe("analyzePassword", () => {
  it("rejects empty passwords", () => {
    const r = analyzePassword("");
    expect(r.score).toBe(0);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("flags common passwords as very weak", () => {
    const r = analyzePassword("password123");
    expect(r.score).toBe(0);
    expect(r.issues.some((i) => i.includes("common"))).toBe(true);
  });

  it("flags short and keyboard-sequence passwords", () => {
    const r = analyzePassword("qwerty7");
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.issues.some((i) => i.includes("keyboard"))).toBe(true);
  });

  it("gives a strong password a high score", () => {
    const r = analyzePassword("Xk9#mQ2!vL8$zR4");
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.issues).toEqual([]);
  });

  it("scores medium passwords fairly", () => {
    const r = analyzePassword("Summer2026!");
    expect(r.score).toBeGreaterThanOrEqual(2);
  });

  it("reports entropy and crack time", () => {
    const r = analyzePassword("CorrectHorseBatteryStaple99!");
    expect(r.entropyBits).toBeGreaterThan(70);
    expect(r.crackTime).toMatch(/years|millennia/);
  });

  it("detects repeated runs", () => {
    const r = analyzePassword("aaaabbbb1234");
    expect(r.issues.some((i) => i.includes("repeated"))).toBe(true);
  });
});

describe("estimateEntropy", () => {
  it("is higher for longer/mixed passwords", () => {
    expect(estimateEntropy("a")).toBeLessThan(estimateEntropy("abcdefgh"));
    expect(estimateEntropy("abcdefgh")).toBeLessThan(estimateEntropy("Ab3!dEf7"));
  });
});
