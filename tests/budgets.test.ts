import { describe, expect, it } from "vitest";
import {
  budgetForHostname,
  clearBudgets,
  isValidBudgetHostname,
  listBudgets,
  normalizeBudgetHostname,
  removeBudget,
  saveBudget
} from "../src/core/budgets";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("budgets", () => {
  it("normalizes hostnames (URLs, www, case, protocol)", () => {
    expect(normalizeBudgetHostname("  Facebook.COM ")).toBe("facebook.com");
    expect(normalizeBudgetHostname("https://www.facebook.com/feed")).toBe("facebook.com");
    expect(normalizeBudgetHostname("www.reddit.com")).toBe("reddit.com");
    expect(isValidBudgetHostname("facebook.com")).toBe(true);
    expect(isValidBudgetHostname("a")).toBe(false);
    expect(isValidBudgetHostname("not a host")).toBe(false);
  });

  it("saves, updates, lists, and removes budget rules", async () => {
    const s = storage();
    const rule = await saveBudget(s, "Facebook.com", 30, 100);
    expect(rule?.hostname).toBe("facebook.com");
    expect(rule?.minutesPerDay).toBe(30);
    // Same hostname → update, not duplicate.
    const updated = await saveBudget(s, "facebook.com", 15, 200);
    expect(updated?.minutesPerDay).toBe(15);
    expect(await listBudgets(s)).toHaveLength(1);
    await removeBudget(s, updated!.id);
    expect(await listBudgets(s)).toHaveLength(0);
  });

  it("rejects invalid hostnames and clamps minutes", async () => {
    const s = storage();
    expect(await saveBudget(s, "!!!", 30, 1)).toBeNull();
    const rule = await saveBudget(s, "youtube.com", 99999, 1);
    expect(rule?.minutesPerDay).toBe(24 * 60);
    const rule2 = await saveBudget(s, "x.com", 0, 1);
    expect(rule2?.minutesPerDay).toBe(1);
  });

  it("matches exact hostnames and subdomains", async () => {
    const s = storage();
    await saveBudget(s, "facebook.com", 30, 1);
    const budgets = await listBudgets(s);
    expect(budgetForHostname(budgets, "facebook.com")?.hostname).toBe("facebook.com");
    expect(budgetForHostname(budgets, "www.facebook.com")?.hostname).toBe("facebook.com");
    expect(budgetForHostname(budgets, "m.facebook.com")?.hostname).toBe("facebook.com");
    // Not a subdomain — no match.
    expect(budgetForHostname(budgets, "facebook.com.evil.net")).toBeNull();
    expect(budgetForHostname(budgets, "twitter.com")).toBeNull();
  });

  it("clears all budgets", async () => {
    const s = storage();
    await saveBudget(s, "a.com", 10, 1);
    await clearBudgets(s);
    expect(await listBudgets(s)).toHaveLength(0);
  });
});
