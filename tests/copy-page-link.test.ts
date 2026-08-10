import { describe, expect, it } from "vitest";
import {
  buildPageLinkFormats,
  pageLinkHtml,
  pageLinkMarkdown,
  pageLinkPlain
} from "../src/core/copy-page-link";

describe("copy page link", () => {
  it("builds markdown with title and url", () => {
    expect(pageLinkMarkdown("My Page", "https://example.com/x")).toBe("[My Page](https://example.com/x)");
    expect(pageLinkMarkdown("", "https://example.com")).toBe("[https://example.com](https://example.com)");
  });

  it("builds HTML with escaped title and url", () => {
    expect(pageLinkHtml('A "quoted" <title>', "https://example.com/?a=1&b=2")).toBe(
      '<a href="https://example.com/?a=1&amp;b=2">A &quot;quoted&quot; &lt;title&gt;</a>'
    );
  });

  it("builds plain text title - url", () => {
    expect(pageLinkPlain("My Page", "https://example.com")).toBe("My Page - https://example.com");
  });

  it("returns all three formats together", () => {
    const formats = buildPageLinkFormats("Doc", "https://d.com");
    expect(formats.markdown).toContain("Doc");
    expect(formats.html).toContain("<a href=");
    expect(formats.plain).toContain(" - ");
  });
});
