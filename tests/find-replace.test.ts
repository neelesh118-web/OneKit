// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  countOccurrences,
  replaceAllMatches,
  replaceSummary
} from "../src/core/find-replace";

describe("find & replace", () => {
  it("counts non-overlapping occurrences, case-insensitively by default", () => {
    expect(countOccurrences("the cat and the dog", "the")).toBe(2);
    expect(countOccurrences("The cat and the dog", "the")).toBe(2);
    expect(countOccurrences("aaaa", "aa")).toBe(2); // non-overlapping
    expect(countOccurrences("nothing here", "xyz")).toBe(0);
    expect(countOccurrences("anything", "")).toBe(0);
  });

  it("respects case sensitivity", () => {
    expect(countOccurrences("The cat", "the", true)).toBe(0);
    expect(countOccurrences("the cat", "the", true)).toBe(1);
  });

  it("replaces all or up to a limit", () => {
    const result = replaceAllMatches("one two one two one", "one", "1");
    expect(result.text).toBe("1 two 1 two 1");
    expect(result.replaced).toBe(3);

    const limited = replaceAllMatches("one two one two", "one", "1", { limit: 1 });
    expect(limited.text).toBe("1 two one two");
    expect(limited.replaced).toBe(1);
  });

  it("escapes regex metacharacters in the query", () => {
    const result = replaceAllMatches("cost $5 and $5", "$5", "€5");
    expect(result.text).toBe("cost €5 and €5");
  });

  it("summarizes honestly", () => {
    expect(replaceSummary(0)).toBe("No matches found.");
    expect(replaceSummary(1)).toBe("Replaced 1 occurrence.");
    expect(replaceSummary(7)).toBe("Replaced 7 occurrences.");
  });
});
