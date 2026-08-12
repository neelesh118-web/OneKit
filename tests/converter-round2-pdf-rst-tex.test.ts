// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

async function realPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([500, 300]);
  page.drawText(text, { x: 40, y: 240, size: 14, font });
  return pdf.save();
}

describe("round 2: PDF to RST and TeX", () => {
  it("advertises both demand-ranked targets", () => {
    expect(targetsFor("pdf")).toEqual(expect.arrayContaining(["rst", "tex"]));
  });

  it("extracts a real PDF into escaped, structured reStructuredText", async () => {
    const pdf = await realPdf("Revenue_2026 * draft | local");
    const result = await convertFile({ bytes: pdf, name: "report.pdf" }, "rst");
    const output = new TextDecoder().decode(result.bytes);
    expect(result.name).toBe("report.rst");
    expect(result.mime).toBe("text/x-rst");
    expect(output).toMatch(/^PDF text\n========\n/m);
    expect(output).toContain("Revenue\\_2026 \\* draft \\| local");
  });

  it("extracts a real PDF into a standalone TeX document with escaped reserved characters", async () => {
    const pdf = await realPdf("Budget #1 costs $50 & tax_2026 is 5%");
    const result = await convertFile({ bytes: pdf, name: "budget.pdf" }, "tex");
    const output = new TextDecoder().decode(result.bytes);
    expect(result.name).toBe("budget.tex");
    expect(result.mime).toBe("application/x-tex");
    expect(output).toContain("\\documentclass{article}");
    expect(output).toContain("Budget \\#1 costs \\$50 \\& tax\\_2026 is 5\\%");
    expect(output).toMatch(/\\begin\{document\}[\s\S]*\\end\{document\}\n$/);
  });

  it.each(["rst", "tex"] as const)("rejects corrupt PDF input for %s", async (target) => {
    await expect(convertFile({ bytes: new TextEncoder().encode("not a PDF"), name: "broken.pdf" }, target))
      .rejects.toThrow(/Could not read this PDF/);
  });
});
