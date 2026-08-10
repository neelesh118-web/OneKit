// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatBytes, formatSizeDelta } from "../src/core/converter/util";

describe("formatBytes", () => {
  it("formats KB and MB honestly", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(1)).toBe("1 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("formatSizeDelta", () => {
  it("reports a shrink with the saved percentage", () => {
    const delta = formatSizeDelta(1024 * 1024, 1024 * 256); // 1.0 MB → 256 KB
    expect(delta).toContain("1.0 MB");
    expect(delta).toContain("256 KB");
    expect(delta).toContain("−75%");
  });

  it("reports a grow honestly (conversions can get bigger)", () => {
    const delta = formatSizeDelta(1000, 2000);
    expect(delta).toContain("+100%");
  });

  it("reports same size inside the ±0.5% band", () => {
    expect(formatSizeDelta(10_000, 10_010)).toContain("same size");
    expect(formatSizeDelta(10_000, 9_990)).toContain("same size");
  });

  it("never claims a percentage when the original is unknown", () => {
    expect(formatSizeDelta(0, 512)).toBe("0 KB → 1 KB");
    expect(formatSizeDelta(-1, 512)).not.toMatch(/[−+]\d+%/);
  });
});
