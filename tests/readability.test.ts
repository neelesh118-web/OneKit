// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  countSentences,
  countSyllables,
  fleschKincaidGrade,
  gradeLevelLabel,
  readingMetrics
} from "../src/core/readability";

describe("countSyllables", () => {
  it("counts vowel groups", () => {
    expect(countSyllables("hello")).toBe(2);
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("table")).toBe(2);
    expect(countSyllables("make")).toBe(1); // silent e
  });
});

describe("countSentences", () => {
  it("splits on terminal punctuation", () => {
    expect(countSentences("Hello world. This is two. And three!")).toBe(3);
    expect(countSentences("One sentence")).toBe(1);
    expect(countSentences("")).toBe(0);
  });
});

describe("fleschKincaidGrade", () => {
  it("is 0 for too little text", () => {
    expect(fleschKincaidGrade(5, 1, 10)).toBe(0);
  });

  it("is bounded to 1–18", () => {
    const g = fleschKincaidGrade(200, 2, 700);
    expect(g).toBeGreaterThanOrEqual(1);
    expect(g).toBeLessThanOrEqual(18);
  });
});

describe("readingMetrics", () => {
  it("computes words, minutes and grade for a real paragraph", () => {
    const text =
      "The quick brown fox jumps over the lazy dog. " +
      "This is a second, longer sentence that carries on for a while to give us more words to count. " +
      "A third sentence finishes the paragraph.";
    const m = readingMetrics(text);
    expect(m.words).toBeGreaterThan(30);
    expect(m.sentences).toBe(3);
    expect(m.minutes).toBeGreaterThanOrEqual(1);
    expect(m.gradeLevel).toBeGreaterThan(0);
    expect(m.characters).toBeGreaterThan(0);
  });

  it("handles empty input honestly", () => {
    const m = readingMetrics("   ");
    expect(m.words).toBe(0);
    expect(m.minutes).toBe(1);
    expect(m.gradeLevel).toBe(0);
    expect(gradeLevelLabel(0)).toBe("—");
  });
});
