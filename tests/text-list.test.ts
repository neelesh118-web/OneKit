// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyListOp, dedupe, splitAny, splitLines, toCsv } from "../src/core/text-list";

describe("splitLines", () => {
  it("splits, trims and drops empties", () => {
    expect(splitLines("a\n  b \r\n\nc")).toEqual(["a", "b", "c"]);
  });
});

describe("splitAny", () => {
  it("splits on commas and semicolons too", () => {
    expect(splitAny("a,b; c\n d")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("dedupe", () => {
  it("removes duplicates preserving first order", () => {
    expect(dedupe(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });
});

describe("toCsv", () => {
  it("quotes and escapes", () => {
    expect(toCsv(['a"b', "c"])).toBe('"a""b"\n"c"');
  });
});

describe("applyListOp", () => {
  const input = "banana\napple\nbanana\ncherry";
  it("dedupes", () => {
    expect(applyListOp(input, "dedupe")).toBe("banana\napple\ncherry");
  });
  it("sorts", () => {
    expect(applyListOp(input, "sort")).toBe("apple\nbanana\nbanana\ncherry");
  });
  it("reverses", () => {
    expect(applyListOp(input, "reverse").split("\n")[0]).toBe("cherry");
  });
  it("converts to csv", () => {
    expect(applyListOp(input, "csv").split("\n")).toHaveLength(4);
  });
  it("splits commas into lines", () => {
    expect(applyListOp("x, y ,z", "splitComma")).toBe("x\ny\nz");
  });
});
