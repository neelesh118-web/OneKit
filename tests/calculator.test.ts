import { describe, expect, it } from "vitest";
import { calculate, CalculatorError, formatResult, tokenize } from "../src/core/calculator";

describe("calculator", () => {
  it("evaluates basic arithmetic", () => {
    expect(calculate("2 + 3")).toBe(5);
    expect(calculate("10 - 4")).toBe(6);
    expect(calculate("6 * 7")).toBe(42);
    expect(calculate("20 / 5")).toBe(4);
  });

  it("respects operator precedence", () => {
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("(2 + 3) * 4")).toBe(20);
    expect(calculate("2 ^ 3 ^ 2")).toBe(512); // right-assoc via shunting yard
  });

  it("supports modulo and decimals", () => {
    expect(calculate("10 % 3")).toBe(1);
    expect(calculate("0.1 + 0.2")).toBeCloseTo(0.3, 10);
    expect(calculate(".5 * 2")).toBe(1);
  });

  it("handles unary minus", () => {
    expect(calculate("-5 + 3")).toBe(-2);
    expect(calculate("2 * -3")).toBe(-6);
    expect(calculate("-(2 + 3)")).toBe(-5);
  });

  it("rejects division by zero", () => {
    expect(() => calculate("1 / 0")).toThrow(CalculatorError);
  });

  it("rejects unknown words and characters", () => {
    expect(() => calculate("2 + foo")).toThrow(CalculatorError);
    expect(() => calculate("2 @ 3")).toThrow(CalculatorError);
  });

  it("rejects unbalanced parentheses", () => {
    expect(() => calculate("(2 + 3")).toThrow(CalculatorError);
    expect(() => calculate("2 + 3)")).toThrow(CalculatorError);
  });

  it("tokenizes numbers and operators", () => {
    const tokens = tokenize("1.5+2");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ kind: "number", value: 1.5 });
    expect(tokens[1]).toEqual({ kind: "op", value: "+" });
  });

  it("formats results without float noise", () => {
    expect(formatResult(0.1 + 0.2)).toBe("0.3");
    expect(formatResult(42)).toBe("42");
    expect(formatResult(1 / 3)).toBe("0.3333333333");
  });
});
