import { describe, expect, it } from "vitest";
import {
  endsWithPunctuation,
  msPerWord,
  normalizeWpm,
  planReading,
  tokenizeForReading
} from "../src/core/speed-reader";

describe("speed reader", () => {
  it("normalizes wpm into the valid range", () => {
    expect(normalizeWpm(300)).toBe(300);
    expect(normalizeWpm(10)).toBe(100);
    expect(normalizeWpm(5000)).toBe(900);
    expect(normalizeWpm(Number.NaN)).toBe(300);
  });

  it("computes ms per word from wpm", () => {
    expect(msPerWord(300)).toBe(200);
    expect(msPerWord(600)).toBe(100);
  });

  it("detects sentence punctuation", () => {
    expect(endsWithPunctuation("Hello.")).toBe(true);
    expect(endsWithPunctuation("Hello!")).toBe(true);
    expect(endsWithPunctuation("Hello")).toBe(false);
  });

  it("tokenizes with length-based pacing", () => {
    const tokens = tokenizeForReading("a verylongwordend", 300);
    const short = tokens.find((t) => t.word === "a")!;
    const long = tokens.find((t) => t.word === "verylongwordend")!;
    expect(short.durationMs).toBe(200);
    expect(long.durationMs).toBeGreaterThan(short.durationMs);
  });

  it("adds a pause after punctuation when enabled", () => {
    const base = tokenizeForReading("Done. Next", 300);
    const withPause = tokenizeForReading("Done. Next", 300, { pauseAfterPunctuation: true });
    const doneBase = base.find((t) => t.word === "Done.")!;
    const donePause = withPause.find((t) => t.word === "Done.")!;
    expect(donePause.durationMs).toBeGreaterThan(doneBase.durationMs);
  });

  it("builds a reading plan with totals", () => {
    // 3 words at 300wpm = 3 × 200ms = 600ms → rounds to 1 second.
    const plan = planReading("one two three", 300);
    expect(plan.tokens).toHaveLength(3);
    expect(plan.estimatedSeconds).toBe(1);
  });
});
