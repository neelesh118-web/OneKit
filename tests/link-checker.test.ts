import { describe, expect, it } from "vitest";
import {
  summarizeLinkResults,
  urlsFromList,
  verdictFor,
  type LinkCheckResult
} from "../src/core/link-checker";

describe("link checker", () => {
  it("classifies results into verdicts", () => {
    const ok: LinkCheckResult = { url: "https://a.com", status: 200, ok: true };
    const redirect: LinkCheckResult = { url: "https://b.com", status: 301, ok: true };
    const missing: LinkCheckResult = { url: "https://c.com", status: 404, ok: true };
    const serverError: LinkCheckResult = { url: "https://d.com", status: 500, ok: true };
    const failed: LinkCheckResult = { url: "https://e.com", status: 0, ok: false, error: "timeout" };
    expect(verdictFor(ok)).toBe("ok");
    expect(verdictFor(redirect)).toBe("redirect");
    expect(verdictFor(missing)).toBe("not-found");
    expect(verdictFor(serverError)).toBe("server-error");
    expect(verdictFor(failed)).toBe("error");
  });

  it("parses a pasted list into http(s) urls, deduped", () => {
    const urls = urlsFromList("example.com\nhttps://example.com\nexample.org/page\nmailto:x@y.com\nnot a url\n\n");
    expect(urls).toEqual(["https://example.com/", "https://example.org/page"]);
  });

  it("summarizes counts", () => {
    const results: LinkCheckResult[] = [
      { url: "a", status: 200, ok: true },
      { url: "b", status: 200, ok: true },
      { url: "c", status: 404, ok: true },
      { url: "d", status: 0, ok: false }
    ];
    expect(summarizeLinkResults(results)).toContain("2 ok");
    expect(summarizeLinkResults(results)).toContain("2 broken");
    expect(summarizeLinkResults([{ url: "a", status: 200, ok: true }])).toContain("All 1 links are reachable");
    expect(summarizeLinkResults([])).toBe("Nothing checked.");
  });
});
