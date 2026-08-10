// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pageToPdfUrl, pdfFilename } from "../src/core/page-to-pdf";

describe("pageToPdfUrl", () => {
  it("builds a reader print URL", () => {
    const url = pageToPdfUrl("https://example.com/article?x=1", "chrome-extension://abc/reader.html");
    expect(url).toContain("reader.html?url=");
    expect(url).toContain("&print=1");
    expect(url).toContain(encodeURIComponent("https://example.com/article?x=1"));
  });
  it("rejects non-http pages", () => {
    expect(pageToPdfUrl("chrome://settings", "x")).toBeNull();
  });
});

describe("pdfFilename", () => {
  it("sanitizes and dates", () => {
    const name = pdfFilename("My Page: The Best!", 1_800_000_000_000);
    expect(name).toMatch(/\.pdf$/);
    expect(name).toMatch(/^My-Page-The-Best/);
  });
  it("falls back for empty titles", () => {
    expect(pdfFilename("!!!", 1_800_000_000_000)).toMatch(/^page-/);
  });
});
