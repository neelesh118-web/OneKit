import { describe, expect, it } from "vitest";
import {
  extractLinks,
  linkToMarkdown,
  linksToMarkdown,
  selectionToMarkdown,
  tabsToMarkdown
} from "../src/core/markdown";

describe("linkToMarkdown", () => {
  it("formats title + url, falling back to the url", () => {
    expect(linkToMarkdown("Example", "https://example.com/")).toBe("[Example](https://example.com/)");
    expect(linkToMarkdown("  ", "https://example.com/")).toBe("[https://example.com/](https://example.com/)");
  });

  it("escapes brackets in titles", () => {
    expect(linkToMarkdown("a]b", "https://x.com")).toBe("[a\\]b](https://x.com)");
  });
});

describe("selectionToMarkdown", () => {
  it("returns a single line as-is and multi-lines as bullets", () => {
    expect(selectionToMarkdown("  hello  ")).toBe("hello");
    expect(selectionToMarkdown("one\ntwo\n\nthree")).toBe("- one\n- two\n- three");
    expect(selectionToMarkdown("   ")).toBe("");
  });
});

describe("tabsToMarkdown", () => {
  it("writes one markdown link per http(s) tab", () => {
    const out = tabsToMarkdown([
      { title: "A", url: "https://a.com/" },
      { title: "B", url: "https://b.com/" },
      { title: "Settings", url: "chrome://settings" },
      { title: "Bad", url: "not a url" }
    ]);
    expect(out).toBe("[A](https://a.com/)\n[B](https://b.com/)");
  });
});

describe("extractLinks", () => {
  it("extracts http(s) anchors, deduped by href", () => {
    const links = extractLinks([
      { href: "https://example.com/a", text: "A" },
      { href: "https://example.com/a", text: "A again" },
      { href: "/relative", text: "relative" },
      { href: "javascript:void(0)", text: "js" },
      { href: "mailto:x@y.com", text: "mail" },
      { href: "https://example.com/b", text: "B" }
    ]);
    expect(links).toEqual([
      { href: "https://example.com/a", text: "A" },
      { href: "https://example.com/b", text: "B" }
    ]);
  });

  it("falls back to the href as text for empty anchors", () => {
    const links = extractLinks([{ href: "https://example.com/c", text: "  " }]);
    expect(links[0]!.text).toBe("https://example.com/c");
  });
});

describe("linksToMarkdown", () => {
  it("renders a bullet list", () => {
    const out = linksToMarkdown([{ href: "https://a.com", text: "A" }]);
    expect(out).toBe("- [A](https://a.com)");
  });
});
