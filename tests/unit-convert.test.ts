// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addDays,
  convertUnit,
  dateDiffDays,
  formatConverted,
  formatInTimeZone,
  isKnownUnit,
  unitsFor
} from "../src/core/unit-convert";

describe("unit conversion", () => {
  it("converts length", () => {
    expect(convertUnit("length", 1, "km", "m")).toBeCloseTo(1000, 6);
    expect(convertUnit("length", 1, "mi", "km")).toBeCloseTo(1.609344, 5);
    expect(convertUnit("length", 12, "in", "ft")).toBeCloseTo(1, 6);
  });

  it("converts weight", () => {
    expect(convertUnit("weight", 1, "kg", "lb")).toBeCloseTo(2.20462262185, 5);
    expect(convertUnit("weight", 14, "st", "lb")).toBeCloseTo(196, 6);
    expect(convertUnit("weight", 1000, "g", "kg")).toBeCloseTo(1, 6);
  });

  it("converts temperature with offsets", () => {
    expect(convertUnit("temperature", 0, "c", "f")).toBeCloseTo(32, 6);
    expect(convertUnit("temperature", 100, "c", "k")).toBeCloseTo(373.15, 5);
    expect(convertUnit("temperature", 32, "f", "c")).toBeCloseTo(0, 6);
    expect(convertUnit("temperature", 0, "k", "c")).toBeCloseTo(-273.15, 5);
  });

  it("converts data (decimal vs binary)", () => {
    expect(convertUnit("data", 1, "gb", "mb")).toBeCloseTo(1000, 6);
    expect(convertUnit("data", 1, "gib", "mib")).toBeCloseTo(1024, 6);
    expect(convertUnit("data", 1, "gb", "gib")).toBeCloseTo(0.9313225746, 5);
  });

  it("converts volume and time", () => {
    expect(convertUnit("volume", 1, "gal", "l")).toBeCloseTo(3.785411784, 5);
    expect(convertUnit("volume", 16, "tbsp", "cup")).toBeCloseTo(1, 6);
    expect(convertUnit("time", 1, "day", "h")).toBeCloseTo(24, 6);
    expect(convertUnit("time", 90, "min", "h")).toBeCloseTo(1.5, 6);
  });

  it("rejects unknown units and non-finite values honestly", () => {
    expect(() => convertUnit("length", 1, "km", "parsec")).toThrow(/unknown unit/i);
    expect(() => convertUnit("length", Number.NaN, "km", "m")).toThrow(/number/);
  });

  it("lists units per category and validates symbols", () => {
    expect(unitsFor("temperature").length).toBe(3);
    expect(isKnownUnit("length", "km")).toBe(true);
    expect(isKnownUnit("length", "k")).toBe(false);
  });

  it("formats results sanely", () => {
    expect(formatConverted(1000)).toBe("1000");
    expect(formatConverted(0.0000005)).toBe("5.0000e-7");
  });
});

describe("date & time utilities", () => {
  it("computes whole-day differences", () => {
    expect(dateDiffDays("2026-08-10", "2026-08-01")).toBe(9);
    expect(dateDiffDays("2026-08-01", "2026-08-10")).toBe(-9);
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("formats instants in named time zones", () => {
    const london = formatInTimeZone("2026-08-10T12:00:00Z", "Europe/London");
    expect(london).toContain("2026");
    expect(() => formatInTimeZone("2026-08-10T12:00:00Z", "Not/AZone")).toThrow(/time zone/i);
  });
});
