// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeFolder } from "../src/core/converter/output-folder";

describe("sanitizeFolder", () => {
  it("normalizes backslashes and strips outer slashes", () => {
    expect(sanitizeFolder("converted\\photos")).toBe("converted/photos");
    expect(sanitizeFolder("/converted/photos/")).toBe("converted/photos");
    expect(sanitizeFolder("  converted  ")).toBe("converted");
  });

  it("blocks parent traversal and dot segments", () => {
    expect(sanitizeFolder("../../evil")).toBe("evil");
    expect(sanitizeFolder("a/../b")).toBe("a/b");
    expect(sanitizeFolder("./a")).toBe("a");
  });

  it("strips characters the OS won't accept in a path", () => {
    expect(sanitizeFolder('conv:eter"d?')).toBe("conveterd");
    expect(sanitizeFolder("C:\\Users\\neele")).toBe("Users/neele"); // drive letter dropped
  });

  it("returns an empty string for empty or unsafe-only input", () => {
    expect(sanitizeFolder("")).toBe("");
    expect(sanitizeFolder("   ")).toBe("");
    expect(sanitizeFolder("..")).toBe("");
    expect(sanitizeFolder("/../")).toBe("");
  });

  it("keeps multi-level paths intact", () => {
    expect(sanitizeFolder("one/two/three")).toBe("one/two/three");
  });
});
