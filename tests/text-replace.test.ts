// @vitest-environment node
import { describe, expect, it } from "vitest";
import { replaceInText } from "../src/core/text-replace";

describe("replaceInText", () => {
  it("replaces all occurrences case-insensitively by default", () => {
    const r = replaceInText("Foo foo FOO", "foo", "bar");
    expect(r.output).toBe("bar bar bar");
    expect(r.count).toBe(3);
  });
  it("respects case-sensitive matching", () => {
    const r = replaceInText("Foo foo", "Foo", "bar", true);
    expect(r.output).toBe("bar foo");
    expect(r.count).toBe(1);
  });
  it("treats the find term as literal (no regex injection)", () => {
    const r = replaceInText("a.b a.b", "a.b", "x");
    expect(r.output).toBe("x x");
  });
  it("returns input unchanged with count 0 when nothing matches", () => {
    const r = replaceInText("hello", "zzz", "x");
    expect(r.output).toBe("hello");
    expect(r.count).toBe(0);
  });
  it("empty find is a no-op", () => {
    const r = replaceInText("hello", "", "x");
    expect(r.output).toBe("hello");
    expect(r.count).toBe(0);
  });
});
