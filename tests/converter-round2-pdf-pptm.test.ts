// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { textToPdf } from "../src/core/converter/documents";
import { pptxToSlides } from "../src/core/converter/pptx";
import { targetsFor } from "../src/core/converter/matrix";

describe("round 2: PDF to macro-enabled PowerPoint", () => {
  it("advertises PDF to PPTM", () => {
    expect(targetsFor("pdf")).toContain("pptm");
  });

  it("extracts PDF text into a genuine macro-enabled OOXML presentation", async () => {
    const pdf = await textToPdf("Quarterly report\nRevenue grew locally.");
    const result = await convertFile({ bytes: pdf, name: "report.pdf" }, "pptm");
    expect(result.name).toBe("report.pptm");
    expect(result.mime).toBe("application/vnd.ms-powerpoint.presentation.macroEnabled.12");
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const files = unzipSync(result.bytes);
    const contentTypes = strFromU8(files["[Content_Types].xml"]!);
    expect(contentTypes).toContain("application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml");
    expect(files["ppt/presentation.xml"]).toBeDefined();
    expect(files["ppt/vbaProject.bin"]).toBeUndefined();
    const slideText = pptxToSlides(result.bytes).flatMap((slide) => [slide.title, ...slide.lines]).join(" ");
    expect(slideText).toContain("Quarterly report");
    expect(slideText).toContain("Revenue grew locally.");
  });

  it("rejects corrupt PDF instead of emitting a presentation shell", async () => {
    await expect(convertFile({ bytes: new TextEncoder().encode("not a PDF"), name: "bad.pdf" }, "pptm"))
      .rejects.toThrow();
  });
});
