// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatCitation, siteNameFromUrl, type CitationSource } from "../src/core/citation";

const src: CitationSource = {
  title: "The Future of Local Browsing",
  url: "https://example.org/guides/future",
  siteName: "Example Org",
  authors: ["Ada Lovelace"],
  accessedDate: "2026-08-10"
};

describe("citation generator", () => {
  it("formats APA with an author", () => {
    const c = formatCitation(src, "apa");
    expect(c).toContain("Lovelace, Ada.");
    expect(c).toContain("The Future of Local Browsing");
    expect(c).toContain("Example Org");
    expect(c).toContain("Retrieved August 10, 2026, from https://example.org/guides/future");
  });

  it("formats MLA with an author", () => {
    const c = formatCitation(src, "mla");
    expect(c).toContain('Lovelace, Ada. "The Future of Local Browsing." Example Org, 10 August 2026,');
  });

  it("formats Chicago with an author", () => {
    const c = formatCitation(src, "chicago");
    expect(c).toContain('Lovelace, Ada. "The Future of Local Browsing." Example Org. Accessed August 10, 2026.');
  });

  it("falls back to the site name when there are no authors", () => {
    const noAuthor: CitationSource = { ...src, authors: [] };
    const apa = formatCitation(noAuthor, "apa");
    expect(apa.startsWith("Example Org.")).toBe(true);
    const mla = formatCitation(noAuthor, "mla");
    expect(mla.startsWith('"The Future of Local Browsing."')).toBe(true);
  });

  it("derives a site name from the hostname", () => {
    expect(siteNameFromUrl("https://www.reddit.com/r/chrome_extensions/")).toBe("Reddit");
    expect(siteNameFromUrl("https://en.wikipedia.org/wiki/Chrome")).toBe("En");
  });

  it("rejects missing title or url honestly", () => {
    expect(() => formatCitation({ ...src, title: " " }, "apa")).toThrow(/title and URL/);
    expect(() => formatCitation({ ...src, url: "" }, "mla")).toThrow(/title and URL/);
  });
});
