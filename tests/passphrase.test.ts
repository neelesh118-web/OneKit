// @vitest-environment node
import { describe, expect, it } from "vitest";
import { estimatePassphraseEntropy, generatePassphrase, pickWords } from "../src/core/passphrase";

const RAND = (): number => 0.42; // deterministic

describe("pickWords", () => {
  it("returns the requested count", () => {
    expect(pickWords(4, RAND)).toHaveLength(4);
    expect(pickWords(4, RAND)[0]).toBeTruthy();
  });
  it("clamps to the list", () => {
    expect(pickWords(0, RAND)).toHaveLength(0);
  });
});

describe("generatePassphrase", () => {
  it("joins words with the separator", () => {
    const p = generatePassphrase({ words: 4, separator: "-", addNumber: false, capitalize: false }, RAND);
    expect(p.split("-")).toHaveLength(4);
    expect(p).not.toMatch(/[0-9]$/);
  });
  it("adds a number when asked", () => {
    const p = generatePassphrase({ words: 3, separator: ".", addNumber: true, capitalize: false }, RAND);
    expect(p).toMatch(/\.\d{2}$/);
  });
  it("capitalizes when asked", () => {
    const p = generatePassphrase({ words: 2, separator: "-", addNumber: false, capitalize: true }, RAND);
    for (const w of p.split("-")) expect(w.charAt(0)).toBe(w.charAt(0).toUpperCase());
  });
  it("clamps word count to a sane range", () => {
    expect(generatePassphrase({ words: 99, separator: "-", addNumber: false, capitalize: false }, RAND).split("-")).toHaveLength(8);
  });
});

describe("estimatePassphraseEntropy", () => {
  it("grows with words", () => {
    const four = estimatePassphraseEntropy({ words: 4, separator: "-", addNumber: false, capitalize: false }, 4);
    const six = estimatePassphraseEntropy({ words: 6, separator: "-", addNumber: false, capitalize: false }, 6);
    expect(six).toBeGreaterThan(four);
  });
});
