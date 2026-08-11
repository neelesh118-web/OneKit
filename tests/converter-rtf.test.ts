// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isRtf, rtfToHtml, rtfToText, textToRtf } from "../src/core/converter/rtf";

/** A document shaped like what Word and WordPad actually write. */
const wordish = String.raw`{\rtf1\ansi\ansicpg1252\deff0\nouicompat\deflang1033
{\fonttbl{\f0\fnil\fcharset0 Calibri;}{\f1\fnil\fcharset2 Symbol;}}
{\colortbl ;\red255\green0\blue0;}
{\*\generator Riched20 10.0.19041}{\info{\title Quarterly report}{\author A. Writer}}
\viewkind4\uc1
\pard\sa200\sl276\slmult1\f0\fs22\lang9 Quarterly report\par
This line has \b bold\b0  and \i italic\i0  and \ul underlined\ulnone  words.\par
Unicode: caf\'e9 ${"\\u8212?"} ${"\\u9731?"} done.\par
\pard Tabbed:\tab after tab\par
}`;

describe("converter RTF reading", () => {
  it("recognises RTF bytes", () => {
    expect(isRtf(new TextEncoder().encode(wordish))).toBe(true);
    expect(isRtf(new TextEncoder().encode("{not rtf}"))).toBe(false);
  });

  it("keeps the prose and drops the markup tables", () => {
    const text = rtfToText(wordish);
    expect(text.startsWith("Quarterly report")).toBe(true);
    expect(text).not.toContain("Calibri");
    expect(text).not.toContain("red255");
    expect(text).not.toContain("Riched20");
    expect(text).not.toContain("A. Writer");
  });

  it("decodes escaped characters", () => {
    const text = rtfToText(wordish);
    expect(text).toContain("café"); // hex escape in the ANSI code page
    expect(text).toContain("—"); // decimal unicode escape
    expect(text).toContain("☃"); // decimal unicode escape past latin-1
    expect(text).toContain("Tabbed:\tafter tab");
  });

  it("turns paragraphs into lines", () => {
    expect(rtfToText(wordish).split("\n").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps bold, italic and underline in HTML", () => {
    const html = rtfToHtml(wordish);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<u>underlined</u>");
    expect((html.match(/<p>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("refuses non-RTF input honestly", () => {
    expect(() => rtfToText("just some text")).toThrow(/doesn't look like an RTF/);
    expect(() => rtfToHtml("<html></html>")).toThrow(/doesn't look like an RTF/);
  });
});

describe("converter RTF writing", () => {
  const written = textToRtf("First line\nSecond \\ line {with} braces\nCafé ☃ 😀");

  it("writes a well-formed RTF header and balanced groups", () => {
    expect(written.startsWith("{\\rtf1\\ansi")).toBe(true);
    expect((written.match(/{/g) ?? []).length).toBe((written.match(/}/g) ?? []).length);
  });

  it("escapes backslashes, braces and non-ASCII", () => {
    expect(written).toContain("\\\\ line");
    expect(written).toContain("\\{with\\}");
    expect(written).toContain("\\u233?"); // é
    expect(written).toContain("\\u55357?\\u56832?"); // 😀 as a surrogate pair
  });

  it("round-trips back through the reader", () => {
    const text = rtfToText(written);
    expect(text).toContain("First line");
    expect(text).toContain("Second \\ line {with} braces");
    expect(text).toContain("Café ☃ 😀");
  });
});
