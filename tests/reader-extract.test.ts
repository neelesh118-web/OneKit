import { describe, expect, it } from "vitest";
import { countWords, extractArticle, readingMinutes } from "../src/core/reader-extract";

const PAGE = `<!doctype html>
<html><head><title>Test Article</title></head><body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<header><h1>My Great Article</h1><p class="byline">By Someone</p></header>
<aside class="advertisement"><p>BUY NOW</p></aside>
<article>
  <p>The first paragraph of a genuinely interesting article about local processing.</p>
  <p>The second paragraph continues the thought with more details and examples.</p>
  <p>A third paragraph rounds it out with a conclusion and a call to action.</p>
</article>
<footer><p>Copyright 2026</p></footer>
</body></html>`;

describe("reader-extract", () => {
  it("extracts the article title, strips nav/ad/footer", () => {
    const article = extractArticle(PAGE, "https://example.com/story");
    expect(article.title).toBe("My Great Article");
    expect(article.text).toContain("first paragraph");
    expect(article.text).toContain("third paragraph");
    expect(article.text).not.toContain("BUY NOW");
    expect(article.text).not.toContain("Copyright");
    expect(article.text).not.toContain("About");
  });

  it("counts words and reading minutes honestly", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(readingMinutes(100)).toBe(1);
    expect(readingMinutes(500)).toBe(3);
  });

  it("falls back to body text on a bare page", () => {
    const article = extractArticle("<html><body><p>Just a paragraph of body content with nothing else.</p></body></html>", "https://x.com/");
    expect(article.text.length).toBeGreaterThan(10);
  });
});
