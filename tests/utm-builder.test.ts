import { describe, expect, it } from "vitest";
import { buildUtmUrl, utmParams, validateBaseUrl } from "../src/core/utm-builder";

describe("utm builder", () => {
  it("appends utm params and preserves existing query", () => {
    const result = buildUtmUrl("https://example.com/page?id=5", {
      source: "newsletter",
      medium: "email",
      campaign: "launch"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const url = new URL(result.url);
      expect(url.searchParams.get("id")).toBe("5");
      expect(url.searchParams.get("utm_source")).toBe("newsletter");
      expect(url.searchParams.get("utm_medium")).toBe("email");
      expect(url.searchParams.get("utm_campaign")).toBe("launch");
    }
  });

  it("replaces stale utm params", () => {
    const result = buildUtmUrl("https://example.com/?utm_source=old&utm_campaign=x", {
      source: "new",
      medium: "social",
      campaign: "y"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const url = new URL(result.url);
      expect(url.searchParams.get("utm_source")).toBe("new");
      expect(url.searchParams.get("utm_campaign")).toBe("y");
      expect(url.searchParams.get("utm_medium")).toBe("social");
    }
  });

  it("rejects invalid or non-http urls", () => {
    expect(validateBaseUrl("not a url").ok).toBe(false);
    expect(validateBaseUrl("ftp://example.com").ok).toBe(false);
    expect(validateBaseUrl("").ok).toBe(false);
  });

  it("requires the three core fields", () => {
    const result = buildUtmUrl("https://example.com", { source: "", medium: "email", campaign: "" });
    expect(result.ok).toBe(false);
  });

  it("drops empty optional fields", () => {
    const params = utmParams({ source: "a", medium: "b", campaign: "c", term: "", content: "x" });
    expect(params.utm_term).toBeUndefined();
    expect(params.utm_content).toBe("x");
  });
});
