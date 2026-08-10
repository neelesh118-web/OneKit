import { describe, expect, it } from "vitest";
import { computePrivacyScore, gradeFor, type PrivacyInput } from "../src/core/privacy-score";

function base(overrides: Partial<PrivacyInput> = {}): PrivacyInput {
  return {
    cookieCount: 100,
    historyHosts: 50,
    protectionsEnabled: 1,
    protectionsTotal: 3,
    vaultProtected: false,
    ...overrides
  };
}

describe("privacy score", () => {
  it("grades on the 0-100 curve", () => {
    expect(gradeFor(95)).toBe("A");
    expect(gradeFor(80)).toBe("B");
    expect(gradeFor(60)).toBe("C");
    expect(gradeFor(40)).toBe("D");
    expect(gradeFor(10)).toBe("F");
  });

  it("scores a clean setup as A", () => {
    const result = computePrivacyScore(
      base({ cookieCount: 5, historyHosts: 5, protectionsEnabled: 3, vaultProtected: true })
    );
    expect(result.grade).toBe("A");
    expect(result.recommendations.length).toBe(1);
  });

  it("scores a heavy footprint lower with actionable tips", () => {
    const result = computePrivacyScore(
      base({ cookieCount: 4000, historyHosts: 800, protectionsEnabled: 0 })
    );
    expect(result.grade).toBe("F");
    expect(result.recommendations.some((r) => r.includes("cookies"))).toBe(true);
    expect(result.recommendations.some((r) => r.includes("history"))).toBe(true);
    expect(result.recommendations.some((r) => r.includes("master password"))).toBe(true);
  });

  it("keeps the score inside bounds", () => {
    const low = computePrivacyScore(base({ cookieCount: 999999, historyHosts: 99999 }));
    const high = computePrivacyScore(base({ cookieCount: 0, historyHosts: 0, protectionsEnabled: 3, vaultProtected: true }));
    expect(low.score).toBeGreaterThanOrEqual(0);
    expect(high.score).toBeLessThanOrEqual(100);
    expect(high.grade).toBe("A");
  });

  it("returns a summary with the grade embedded", () => {
    const result = computePrivacyScore(base());
    expect(result.summary).toContain(result.grade);
  });
});
