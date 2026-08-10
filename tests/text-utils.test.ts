import { describe, expect, it } from "vitest";
import {
  countChars,
  countCharsNoSpaces,
  countLines,
  countWords,
  htmlToPlainText,
  textStats
} from "../src/core/text-utils";

describe("text-utils", () => {
  it("counts words including unicode and contractions", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("")).toBe(0);
    expect(countWords("don't stop — café")).toBe(3);
    expect(countWords("   spaced   out   ")).toBe(2);
  });

  it("counts characters and lines", () => {
    expect(countChars("héllo")).toBe(5);
    expect(countCharsNoSpaces("a b c")).toBe(3);
    expect(countLines("one\ntwo\nthree")).toBe(3);
  });

  it("computes full stats", () => {
    const stats = textStats("two words");
    expect(stats).toEqual({ words: 2, chars: 9, charsNoSpaces: 8, lines: 1 });
  });

  it("converts html to plain text via DOM", () => {
    expect(htmlToPlainText("<p>Hello <b>world</b> &amp; friends</p>")).toBe("Hello world & friends");
  });
});
