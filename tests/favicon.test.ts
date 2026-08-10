// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { faviconExtension, faviconFilename, faviconUrlFromDocument } from "../src/core/favicon";

describe("favicon extractor", () => {
  it("finds the icon link, resolving relative hrefs", () => {
    document.head.innerHTML = '<link rel="icon" type="image/png" href="/assets/favicon.png">';
    expect(faviconUrlFromDocument(document, "https://example.com/page")).toBe("https://example.com/assets/favicon.png");
  });

  it("prefers shortcut icon and apple-touch-icon", () => {
    document.head.innerHTML = [
      '<link rel="shortcut icon" href="/a.ico">',
      '<link rel="apple-touch-icon" href="/apple.png">'
    ].join("");
    const url = faviconUrlFromDocument(document, "https://example.com/");
    expect(url).toBe("https://example.com/a.ico");
  });

  it("falls back to /favicon.ico", () => {
    document.head.innerHTML = "";
    expect(faviconUrlFromDocument(document, "https://example.com/x")).toBe("https://example.com/favicon.ico");
  });

  it("handles absolute icon urls and extension extraction", () => {
    document.head.innerHTML = '<link rel="icon" href="https://cdn.example.com/favicon.ico">';
    const url = faviconUrlFromDocument(document, "https://example.com/");
    expect(url).toBe("https://cdn.example.com/favicon.ico");
    expect(faviconExtension(url!)).toBe("ico");
    expect(faviconExtension("https://x.com/i.png")).toBe("png");
  });

  it("builds a safe filename from a host", () => {
    expect(faviconFilename("example.com")).toBe("example.com-icon");
    expect(faviconFilename("weird_host.io")).toContain("-icon");
  });
});
