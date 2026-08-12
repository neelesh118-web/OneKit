// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { odpToSlides } from "../src/core/converter/odf";
import { buildPptx } from "../src/core/converter/pptx";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";

describe("round 2 batch 16: PPTX to ODP", () => {
  it("advertises the pair and matrix milestone", () => {
    expect(targetsFor("pptx")).toContain("odp");
    expect(Object.values(MATRIX).reduce((n, targets) => n + targets.length, 0)).toBeGreaterThanOrEqual(1322);
  });

  it("writes a standards-shaped ODP preserving slide text and order", async () => {
    const pptx = buildPptx([
      { title: "First slide", lines: ["Alpha detail", "Beta detail"] },
      { title: "Second slide", lines: ["Gamma detail"] }
    ]);
    const result = await convertFile({ bytes: pptx, name: "deck.pptx" }, "odp");
    expect(result).toMatchObject({ name: "deck.odp", mime: "application/vnd.oasis.opendocument.presentation" });
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const files = unzipSync(result.bytes);
    expect(strFromU8(files.mimetype!)).toBe("application/vnd.oasis.opendocument.presentation");
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["META-INF/manifest.xml", "content.xml", "styles.xml", "meta.xml"]));
    const content = strFromU8(files["content.xml"]!);
    expect(content).toContain("<office:presentation>");
    expect(content).toContain("First slide");
    expect(content).toContain("Gamma detail");
    const slides = odpToSlides(result.bytes);
    expect(slides.map((slide) => slide.title)).toEqual(["First slide", "Second slide"]);
    expect(slides[0]!.lines).toEqual(["Alpha detail", "Beta detail"]);
  });

  it("rejects corrupt PPTX instead of writing an ODP shell", async () => {
    await expect(convertFile({ bytes: new Uint8Array([0x50, 0x4b, 3]), name: "bad.pptx" }, "odp"))
      .rejects.toThrow(/Could not read this .pptx/);
  });
});
