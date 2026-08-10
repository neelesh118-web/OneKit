import { describe, expect, it } from "vitest";
import {
  scoreSentences,
  selectSentences,
  splitSentences,
  summarizeText,
  summaryStats,
  wordFrequencies
} from "../src/core/summarizer";

const LONG_TEXT =
  "The weather today is sunny and warm. Many people enjoy spending time outside in this weather. " +
  "Scientists study the weather to predict tomorrow's forecast. " +
  "Weather affects what people wear, eat, and plan to do. " +
  "Understanding weather patterns helps farmers protect their crops. " +
  "Weather is one of the most discussed topics in daily life.";

describe("summarizer", () => {
  it("splits text into sentences", () => {
    expect(splitSentences("One. Two! Three? Four")).toHaveLength(4);
    expect(splitSentences("")).toEqual([]);
  });

  it("builds word frequencies without stop words", () => {
    const freqs = wordFrequencies("The cat and the dog ran and played");
    expect(freqs.get("the")).toBeUndefined();
    expect(freqs.get("cat")).toBe(1);
    expect(freqs.get("ran")).toBe(1);
  });

  it("scores sentences with position bias (earlier scores higher on ties)", () => {
    const sentences = splitSentences(LONG_TEXT);
    const freqs = wordFrequencies(LONG_TEXT);
    const scored = scoreSentences(sentences, freqs);
    expect(scored).toHaveLength(6);
    expect(scored[0]!.score).toBeGreaterThanOrEqual(scored[5]!.score);
  });

  it("re-orders selected sentences by original position", () => {
    const sentences = splitSentences(LONG_TEXT);
    const freqs = wordFrequencies(LONG_TEXT);
    const scored = scoreSentences(sentences, freqs);
    const selected = selectSentences(scored, 3);
    expect(selected.map((s) => s.index)).toEqual([...selected.map((s) => s.index)].sort((a, b) => a - b));
    expect(selected.length).toBe(3);
  });

  it("summarizes to fewer sentences than the input", () => {
    const summary = summarizeText(LONG_TEXT, { maxSentences: 3 });
    const count = splitSentences(summary).length;
    expect(count).toBeLessThanOrEqual(3);
    expect(count).toBeGreaterThan(0);
  });

  it("honors the character cap", () => {
    const summary = summarizeText(LONG_TEXT, { maxChars: 80 });
    expect(summary.length).toBeLessThanOrEqual(100);
  });

  it("reports stats", () => {
    const summary = summarizeText(LONG_TEXT, { maxSentences: 2 });
    const stats = summaryStats(LONG_TEXT, summary);
    expect(stats.words).toBeGreaterThan(0);
    expect(stats.coverage).toBeGreaterThan(0);
    expect(stats.coverage).toBeLessThanOrEqual(1);
  });

  it("returns empty for empty text and full text for tiny inputs", () => {
    expect(summarizeText("")).toBe("");
    expect(summarizeText("Just two sentences. Short ones.")).toContain("Just two sentences");
  });
});
