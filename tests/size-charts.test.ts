import { describe, expect, it } from "vitest";
import {
  allSizeRows,
  convertSize,
  lookupSize,
  SIZE_CATEGORIES,
  SIZE_CHARTS
} from "../src/core/size-charts";

describe("size charts", () => {
  it("has all four categories with rows", () => {
    expect(SIZE_CATEGORIES).toHaveLength(4);
    for (const category of SIZE_CATEGORIES) {
      expect(SIZE_CHARTS[category].rows.length).toBeGreaterThan(5);
    }
  });

  it("looks up a row by label", () => {
    const row = lookupSize("clothing", "m");
    expect(row?.label).toBe("M");
    expect(row?.eu).toBe("40–42");
    expect(lookupSize("men-shoes", "10")?.uk).toBe("9.5");
  });

  it("converts between systems", () => {
    const converted = convertSize("women-shoes", "us", "8");
    expect(converted?.eu).toBe("39");
    expect(convertSize("clothing", "eu", "38–40")?.label).toBe("S");
    expect(convertSize("clothing", "us", "99")).toBeNull();
  });

  it("lists everything for pickers", () => {
    const all = allSizeRows();
    expect(all).toHaveLength(4);
    expect(all[0]!.rows.length).toBeGreaterThan(0);
  });

  it("handles unknown categories safely", () => {
    expect(lookupSize("men-shoes", "nope")).toBeUndefined();
    expect(convertSize("men-shoes", "eu", "nope")).toBeNull();
  });
});
