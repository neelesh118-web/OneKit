import { describe, expect, it } from "vitest";
import { analyzeKeywords, keywordReport, phraseFrequency, tokenize, wordFrequency } from "../src/core/keyword-analysis";

const TEXT =
  "OneKit is a local browser toolbox. OneKit keeps everything on your device. " +
  "OneKit never uploads your data. The toolbox runs entirely offline. " +
  "OneKit is free and open. Everything stays on your device.";

describe("keyword analysis", () => {
  it("tokenizes words and drops one-letter tokens", () => {
    expect(tokenize("Hello World! 123 a b")).toEqual(["hello", "world", "123"]);
  });

  it("counts word frequency and excludes stopwords", () => {
    const words = wordFrequency(TEXT);
    expect(words[0]!.word).toBe("onekit");
    expect(words[0]!.count).toBe(4);
    expect(words.some((w) => w.word === "your")).toBe(false);
  });

  it("finds repeated phrases (only when they repeat)", () => {
    const repeated = phraseFrequency(
      "OneKit keeps everything local. OneKit keeps everything safe. OneKit keeps everything private."
    );
    expect(repeated.some((p) => p.phrase === "onekit keeps everything")).toBe(true);
    expect(repeated.every((p) => p.count >= 2)).toBe(true);
    // A single occurrence is noise, not a phrase — never reported.
    expect(phraseFrequency(TEXT)).toEqual([]);
  });

  it("reports total words and reading minutes", () => {
    const analysis = analyzeKeywords(TEXT);
    expect(analysis.totalWords).toBeGreaterThan(30);
    expect(analysis.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(analysis.words.length).toBeGreaterThan(0);
  });

  it("builds a copyable markdown report", () => {
    const report = keywordReport(analyzeKeywords(TEXT));
    expect(report).toContain("# Keyword analysis");
    expect(report).toContain("onekit");
  });
});
