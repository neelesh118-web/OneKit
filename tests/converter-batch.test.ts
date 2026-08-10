// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planBatch } from "../src/core/converter/batch";

const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe("converter batch planner", () => {
  it("converts everything when all files share the detected type", () => {
    const decision = planBatch([
      { name: "a.png", bytes: png },
      { name: "b.png", bytes: png },
      { name: "c.png", bytes: png }
    ]);
    expect(decision.sourceType).toBe("image-png");
    expect(decision.allSame).toBe(true);
    expect(decision.convert).toHaveLength(3);
    expect(decision.skipped).toHaveLength(0);
  });

  it("converts the dominant type and skips outliers with honest reasons", () => {
    const decision = planBatch([
      { name: "a.png", bytes: png },
      { name: "b.png", bytes: png },
      { name: "photo.jpg", bytes: jpeg },
      { name: "blob.xyz", bytes: toBytes("hello") }
    ]);
    expect(decision.sourceType).toBe("image-png");
    expect(decision.convert.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(decision.skipped).toHaveLength(2);
    expect(decision.skipped[0]!.reason).toMatch(/JPEG image/);
    expect(decision.skipped[1]!.reason).toMatch(/couldn't be detected/);
  });

  it("handles a single file like the single-file path", () => {
    const decision = planBatch([{ name: "doc.pdf", bytes: toBytes("%PDF-1.7 fake") }]);
    expect(decision.sourceType).toBe("pdf");
    expect(decision.convert).toHaveLength(1);
    expect(decision.skipped).toHaveLength(0);
  });

  it("reports an all-unknown batch as unknown", () => {
    const decision = planBatch([{ name: "a.zzz", bytes: toBytes("x") }, { name: "b.zzz", bytes: toBytes("y") }]);
    expect(decision.sourceType).toBe("unknown");
    expect(decision.convert).toHaveLength(2);
    expect(decision.allSame).toBe(true);
  });

  it("throws honestly for an empty selection", () => {
    expect(() => planBatch([])).toThrow(/No files selected/);
  });
});
