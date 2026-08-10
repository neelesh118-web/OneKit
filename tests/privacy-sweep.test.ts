// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildSweepPlan,
  filterSweepHosts,
  hasSweepWork,
  sanitizeSweepQuery
} from "../src/core/privacy-sweep";

describe("privacy sweep plan", () => {
  it("merges history and cookie hosts into one ranked list", () => {
    const plan = buildSweepPlan(
      [
        { host: "news.example.com", visits: 42 },
        { host: "mail.example.com", visits: 7 }
      ],
      ["news.example.com", "ads.example.net"]
    );
    expect(plan.totalHosts).toBe(3);
    expect(plan.totalHistoryVisits).toBe(49);
    expect(plan.totalCookies).toBe(2);
    expect(plan.hosts[0]!.host).toBe("news.example.com"); // ranked by combined weight
    expect(plan.hosts[0]!.historyVisits).toBe(42);
    expect(plan.hosts[0]!.cookieCount).toBe(1);
  });

  it("includes cookie-only and history-only hosts", () => {
    const plan = buildSweepPlan([], ["only-cookies.example"]);
    expect(plan.hosts[0]!.historyVisits).toBe(0);
    expect(plan.hosts[0]!.cookieCount).toBe(1);
    const plan2 = buildSweepPlan([{ host: "only-history.example", visits: 3 }], []);
    expect(plan2.hosts[0]!.cookieCount).toBe(0);
  });

  it("detects when there is nothing to clear", () => {
    expect(hasSweepWork(buildSweepPlan([], []))).toBe(false);
    expect(hasSweepWork(buildSweepPlan([{ host: "x.example", visits: 1 }], []))).toBe(true);
  });

  it("filters by query and sanitizes it", () => {
    const plan = buildSweepPlan(
      [
        { host: "news.example.com", visits: 5 },
        { host: "shop.example.net", visits: 5 }
      ],
      []
    );
    expect(filterSweepHosts(plan.hosts, "NEWS")).toHaveLength(1);
    expect(filterSweepHosts(plan.hosts, "")).toHaveLength(2);
    expect(sanitizeSweepQuery("  ABC  ")).toBe("abc");
  });
});
