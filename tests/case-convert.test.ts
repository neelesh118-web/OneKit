// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertCase, splitWords, toSentenceCase, toTitleCase } from "../src/core/case-convert";

describe("case converter", () => {
  it("splits mixed-format text into words", () => {
    expect(splitWords("helloWorld")).toEqual(["hello", "world"]);
    expect(splitWords("  Hello,   WORLD! ")).toEqual(["hello", "world"]);
    expect(splitWords("kebab-case_text.dot")).toEqual(["kebab", "case", "text", "dot"]);
  });

  it("applies every style", () => {
    const input = "the quick brown fox";
    expect(convertCase(input, "upper")).toBe("THE QUICK BROWN FOX");
    expect(convertCase(input, "lower")).toBe("the quick brown fox");
    expect(convertCase(input, "title")).toBe("The Quick Brown Fox");
    expect(convertCase(input, "sentence")).toBe("The quick brown fox");
    expect(convertCase(input, "camel")).toBe("theQuickBrownFox");
    expect(convertCase(input, "pascal")).toBe("TheQuickBrownFox");
    expect(convertCase(input, "kebab")).toBe("the-quick-brown-fox");
    expect(convertCase(input, "snake")).toBe("the_quick_brown_fox");
    expect(convertCase(input, "constant")).toBe("THE_QUICK_BROWN_FOX");
    expect(convertCase(input, "dot")).toBe("the.quick.brown.fox");
  });

  it("keeps small words lower in titles unless first", () => {
    expect(toTitleCase("a tale of two cities")).toBe("A Tale of Two Cities");
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
  });

  it("handles camelCase input and empty strings", () => {
    expect(convertCase("someVarName", "snake")).toBe("some_var_name");
    expect(convertCase("", "upper")).toBe("");
    expect(toSentenceCase("   ")).toBe("");
  });
});
