import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  cssForHostname,
  hostnameOf,
  listCssRules,
  removeCssRule,
  toggleCssRule,
  upsertCssRule
} from "../src/core/custom-css";

describe("custom css", () => {
  it("normalizes hostnames", () => {
    expect(hostnameOf("https://WWW.Example.com/path?q=1")).toBe("example.com");
    expect(hostnameOf("https://sub.example.com/")).toBe("sub.example.com");
  });

  it("upserts, lists and returns enabled CSS", async () => {
    const storage = createMemoryStorage();
    await upsertCssRule(storage, "Example.com", "body { background: pink; }", 1000);
    await upsertCssRule(storage, "example.com", "body { background: blue; }", 2000); // same host, updates

    const rules = await listCssRules(storage);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.css).toContain("blue");
    expect(await cssForHostname(storage, "example.com")).toContain("blue");
  });

  it("respects the enabled flag", async () => {
    const storage = createMemoryStorage();
    await upsertCssRule(storage, "example.com", "body { x: 1 }", 1000);
    await toggleCssRule(storage, "example.com", false);
    expect(await cssForHostname(storage, "example.com")).toBeNull();
    await toggleCssRule(storage, "example.com", true);
    expect(await cssForHostname(storage, "example.com")).toBeTruthy();
  });

  it("removes rules and rejects empty hostnames", async () => {
    const storage = createMemoryStorage();
    await upsertCssRule(storage, "example.com", "a{}", 1000);
    await expect(upsertCssRule(storage, "   ", "a{}", 1000)).rejects.toThrow();
    expect(await removeCssRule(storage, "example.com")).toBe(true);
    expect(await removeCssRule(storage, "example.com")).toBe(false);
    expect(await listCssRules(storage)).toHaveLength(0);
  });
});
