// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageMetaFromDocument, pageMetaToMarkdown } from "../src/core/page-meta";

describe("page meta inspector", () => {
  it("reads title, description, og tags and canonical", () => {
    document.head.innerHTML = [
      '<title>My Page</title>',
      '<meta name="description" content="A description">',
      '<meta property="og:title" content="OG Title">',
      '<meta property="og:description" content="OG Desc">',
      '<meta property="og:image" content="https://cdn.example.com/img.png">',
      '<link rel="canonical" href="/canonical">'
    ].join("");
    document.body.innerHTML = "<h1>First heading</h1><h1>Second</h1>";
    document.documentElement.lang = "en";

    const meta = pageMetaFromDocument(document, "https://example.com/page");
    expect(meta.title).toBe("My Page");
    expect(meta.description).toBe("A description");
    expect(meta.ogTitle).toBe("OG Title");
    expect(meta.ogImage).toBe("https://cdn.example.com/img.png");
    expect(meta.canonical).toBe("https://example.com/canonical");
    expect(meta.language).toBe("en");
    expect(meta.h1s).toEqual(["First heading", "Second"]);
    expect(meta.missing).toEqual([]);
  });

  it("flags missing pieces", () => {
    document.head.innerHTML = "<title>Only title</title>";
    document.body.innerHTML = "";
    const meta = pageMetaFromDocument(document, "https://example.com");
    expect(meta.missing).toContain("meta description");
    expect(meta.missing).toContain("og:title");
    expect(meta.missing).toContain("og:image");
    expect(meta.missing).toContain("canonical");
  });

  it("renders a markdown summary", () => {
    document.head.innerHTML = '<title>T</title><meta name="description" content="D">';
    document.body.innerHTML = "<h1>H</h1>";
    const md = pageMetaToMarkdown(pageMetaFromDocument(document, "https://example.com"));
    expect(md).toContain("# T");
    expect(md).toContain("**Description:** D");
    expect(md).toContain("- H");
    expect(md).toContain("**Missing:**");
  });
});
