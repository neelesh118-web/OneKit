// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeOcrLines, ocrErrorText, sanitizeOcrText } from "../src/core/ocr";

describe("sanitizeOcrText", () => {
  it("trims lines and collapses blank runs", () => {
    const input = "\n  Hello   world  \n\n\n\n  Second line  \n\n";
    expect(sanitizeOcrText(input)).toBe("Hello world\n\nSecond line");
  });

  it("collapses internal whitespace per line", () => {
    expect(sanitizeOcrText("a   b\t\tc")).toBe("a b c");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeOcrText("   \n  \n ")).toBe("");
  });
});

describe("normalizeOcrLines", () => {
  it("returns non-empty trimmed lines", () => {
    expect(normalizeOcrLines("one\n\ntwo\n  ")).toEqual(["one", "two"]);
  });
});

describe("ocrErrorText", () => {
  it("is honest about missing engine files", () => {
    const msg = ocrErrorText(new Error("worker load failed: tesseract-core.wasm"));
    expect(msg).toContain("offline engine files");
  });
  it("passes through other errors", () => {
    expect(ocrErrorText(new Error("boom"))).toContain("boom");
    expect(ocrErrorText("junk")).toContain("OCR failed");
  });
});
