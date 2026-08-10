import { describe, expect, it } from "vitest";
import { DICTIONARY, lookupWord, singleWordFromSelection } from "../src/core/dictionary";

describe("dictionary", () => {
  it("looks up common words case-insensitively", () => {
    expect(lookupWord("able")?.definition.length).toBeGreaterThan(5);
    expect(lookupWord("ABLE")?.word).toBe("able");
    expect(lookupWord("  Knowledge  ")?.word).toBe("knowledge");
  });

  it("returns null for unknown or non-word input", () => {
    expect(lookupWord("zzzqqq")).toBeNull();
    expect(lookupWord("")).toBeNull();
    expect(lookupWord("hello world")).toBeNull();
  });

  it("strips punctuation from the lookup key", () => {
    expect(lookupWord("knowledge.")?.word).toBe("knowledge");
  });

  it("extracts a single word from a selection", () => {
    expect(singleWordFromSelection("able")).toBe("able");
    expect(singleWordFromSelection("able ")).toBe("able");
    expect(singleWordFromSelection("able and willing")).toBeNull();
    expect(singleWordFromSelection("")).toBeNull();
  });

  it("has a non-empty starter bundle with well-formed entries", () => {
    expect(DICTIONARY.length).toBeGreaterThan(150);
    for (const entry of DICTIONARY) {
      expect(entry.word.length).toBeGreaterThan(0);
      expect(entry.partOfSpeech.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(3);
    }
  });
});
