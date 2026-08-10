import { describe, expect, it } from "vitest";
import {
  buildVaultHealthReport,
  gradePassword,
  healthSummary,
  type VaultEntryLike
} from "../src/core/vault-health";

describe("vault health", () => {
  it("grades strong passwords as level 4", () => {
    const grade = gradePassword("Tr0ub4dor&3");
    expect(grade.level).toBe(4);
    expect(grade.label).toBe("Strong");
    expect(grade.issues).toEqual([]);
  });

  it("flags common passwords as instantly guessable", () => {
    const grade = gradePassword("password");
    expect(grade.level).toBe(0);
    expect(grade.label).toBe("Very weak");
    expect(grade.issues[0]).toContain("common");
  });

  it("lists issues for short lowercase-only passwords", () => {
    const grade = gradePassword("abc");
    expect(grade.level).toBe(0);
    expect(grade.issues.length).toBeGreaterThanOrEqual(3);
  });

  it("reports weak, reused, and common passwords from entries", () => {
    const entries: VaultEntryLike[] = [
      { site: "a.com", username: "u", password: "Tr0ub4dor&3" },
      { site: "b.com", username: "u", password: "password" },
      { site: "c.com", username: "u", password: "password" },
      { site: "d.com", username: "u", password: "123456" }
    ];
    const report = buildVaultHealthReport(entries);
    expect(report.total).toBe(4);
    expect(report.strong).toBe(1);
    expect(report.weak).toHaveLength(3);
    expect(report.reused).toHaveLength(1);
    expect(report.reused[0]!.sites).toEqual(["b.com", "c.com"]);
    expect(report.common.map((c) => c.site).sort()).toEqual(["b.com", "c.com", "d.com"]);
  });

  it("counts short passwords separately", () => {
    const report = buildVaultHealthReport([
      { site: "x.com", username: "u", password: "a1" },
      { site: "y.com", username: "u", password: "LongEnough1!" }
    ]);
    expect(report.short).toHaveLength(1);
    expect(report.short[0]!.site).toBe("x.com");
  });

  it("sorts reused groups by size", () => {
    const report = buildVaultHealthReport([
      { site: "a.com", username: "u", password: "dup" },
      { site: "b.com", username: "u", password: "dup" },
      { site: "c.com", username: "u", password: "dup" },
      { site: "d.com", username: "u", password: "twice" },
      { site: "e.com", username: "u", password: "twice" }
    ]);
    expect(report.reused[0]!.sites).toHaveLength(3);
    expect(report.reused[1]!.sites).toHaveLength(2);
  });

  it("summarizes an empty vault and a healthy one", () => {
    expect(healthSummary(buildVaultHealthReport([]))).toContain("No passwords");
    const healthy = buildVaultHealthReport([
      { site: "a.com", username: "u", password: "Tr0ub4dor&3" },
      { site: "b.com", username: "u", password: "Different&3" }
    ]);
    expect(healthSummary(healthy)).toContain("Healthy");
  });

  it("summarizes problems with counts", () => {
    const report = buildVaultHealthReport([
      { site: "a.com", username: "u", password: "password" },
      { site: "b.com", username: "u", password: "Tr0ub4dor&3" }
    ]);
    const summary = healthSummary(report);
    expect(summary).toContain("1 weak");
    expect(summary).toContain("1 common");
  });
});
