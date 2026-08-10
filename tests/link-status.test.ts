// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inspectLink } from "../src/core/link-status";

describe("inspectLink", () => {
  it("accepts a clean URL", () => {
    const r = inspectLink("https://acme.test/blog/post-1");
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.parsed?.host).toBe("acme.test");
  });
  it("flags spaces", () => {
    const r = inspectLink("https://example.com/a b");
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("spaces"))).toBe(true);
  });
  it("flags placeholder links", () => {
    const r = inspectLink("https://www.yourdomain.com/");
    expect(r.problems.some((p) => p.includes("placeholder"))).toBe(true);
  });
  it("flags missing scheme", () => {
    const r = inspectLink("example.com/page");
    expect(r.problems.some((p) => p.includes("scheme"))).toBe(true);
  });
  it("flags broken encoding", () => {
    const r = inspectLink("https://example.com/%zz");
    expect(r.problems.some((p) => p.includes("percent-encoding"))).toBe(true);
  });
  it("treats mailto honestly as a contact link", () => {
    const r = inspectLink("mailto:hi@example.com");
    expect(r.problems.some((p) => p.includes("contact link"))).toBe(true);
  });
  it("flags localhost", () => {
    const r = inspectLink("http://localhost:3000/");
    expect(r.problems.some((p) => p.includes("Local-only"))).toBe(true);
  });
  it("flags empty links", () => {
    const r = inspectLink("   ");
    expect(r.ok).toBe(false);
  });
});
