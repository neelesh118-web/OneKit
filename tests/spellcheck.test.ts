// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSpellChecker, editVariants, normalizeForCheck, tokenizeWords } from "../src/core/spellcheck";

const SMALL = ["the", "receive", "hello", "world", "their", "there", "they're", "friend", "separate", "definitely", "tomorrow"];

describe("tokenizeWords", () => {
  it("splits words with positions", () => {
    const tokens = tokenizeWords("hello world");
    expect(tokens).toEqual([
      { word: "hello", start: 0, end: 5 },
      { word: "world", start: 6, end: 11 }
    ]);
  });
  it("skips URLs, emails, hashtags, mentions and numbers", () => {
    const tokens = tokenizeWords("visit https://example.com/x or email me@site.com #tag @user 12345");
    expect(tokens).toEqual([
      { word: "visit", start: 0, end: 5 },
      { word: "or", start: 28, end: 30 },
      { word: "email", start: 31, end: 36 }
    ]);
  });
  it("handles apostrophes", () => {
    const tokens = tokenizeWords("don't worry 'quoted'");
    expect(tokens.map((t) => t.word)).toEqual(["don't", "worry", "quoted"]);
  });
});

describe("normalizeForCheck", () => {
  it("lowercases and strips possessives", () => {
    expect(normalizeForCheck("THE")).toBe("the");
    expect(normalizeForCheck("John's")).toBe("john");
    expect(normalizeForCheck("Boss'")).toBe("boss");
    expect(normalizeForCheck("they're")).toBe("they're");
  });
});

describe("editVariants", () => {
  it("produces transposition variants", () => {
    expect(editVariants("recieve")).toContain("receive");
  });
  it("produces replacement and insertion variants", () => {
    expect(editVariants("the")).toContain("they");
    expect(editVariants("helo")).toContain("hello");
  });
});

describe("createSpellChecker", () => {
  const checker = createSpellChecker(SMALL);

  it("flags unknown words and ignores known ones", () => {
    const result = checker.check("the recieve world");
    expect(result.map((m) => m.word)).toEqual(["recieve"]);
  });

  it("suggests corrections for common misspellings", () => {
    expect(checker.suggest("recieve")).toContain("receive");
    expect(checker.suggest("teh")).toContain("the");
    expect(checker.suggest("helo")).toContain("hello");
    expect(checker.suggest("thier")).toContain("their");
  });

  it("skips URLs, emails, numbers and short tokens", () => {
    const result = checker.check("hello https://badurl.com the 12345");
    expect(result).toEqual([]);
  });

  it("handles possessives of known words", () => {
    const result = checker.check("the friend's hello");
    expect(result).toEqual([]);
  });

  it("ignores short all-caps acronyms", () => {
    const result = checker.check("the API the HTML");
    expect(result).toEqual([]);
  });

  it("returns no suggestions for known words", () => {
    expect(checker.suggest("hello")).toEqual([]);
  });

  it("reports positions", () => {
    const miss = checker.check("the recieve world")[0]!;
    expect(miss.start).toBe(4);
    expect(miss.end).toBe(11);
  });
});

describe("real wordlist", () => {
  it("checks against the bundled 274k-word list", async () => {
    const words = (await import("an-array-of-english-words")).default as string[];
    expect(words.length).toBeGreaterThan(100_000);
    const checker = createSpellChecker(words);
    const result = checker.check("this is a recieve test with definitly");
    const flagged = result.map((m) => m.word);
    expect(flagged).toContain("recieve");
    expect(flagged).toContain("definitly");
    expect(checker.suggest("recieve")).toContain("receive");
  });
});
