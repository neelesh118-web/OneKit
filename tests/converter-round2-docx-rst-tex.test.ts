// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { htmlToDocx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

describe("round 2: DOCX to RST and TeX", () => {
  it("advertises ranks 2937 and 2939", () => {
    expect(targetsFor("docx")).toEqual(expect.arrayContaining(["rst", "tex"]));
  });

  it("extracts readable DOCX content as valid plain reStructuredText", async () => {
    const input = await htmlToDocx("<h1>Local report</h1><p>Readable content.</p>");
    const result = await convertFile({ bytes: input, name: "report.docx" }, "rst");
    const text = new TextDecoder().decode(result.bytes);
    expect(result).toMatchObject({ name: "report.rst", mime: "text/x-rst" });
    expect(text).toContain("Local report"); expect(text).toContain("Readable content.");
  });

  it("writes a standalone TeX document and escapes reserved characters", async () => {
    const input = await htmlToDocx("<p>Revenue &amp; margin: 50% #1</p>");
    const result = await convertFile({ bytes: input, name: "finance.docx" }, "tex");
    const text = new TextDecoder().decode(result.bytes);
    expect(result).toMatchObject({ name: "finance.tex", mime: "application/x-tex" });
    expect(text).toContain("\\documentclass{article}"); expect(text).toContain("Revenue \\& margin: 50\\% \\#1");
    expect(text).toContain("\\end{document}");
  });

  it("rejects corrupt DOCX for both text-markup targets", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]);
    await expect(convertFile({ bytes: corrupt, name: "bad.docx" }, "rst")).rejects.toThrow();
    await expect(convertFile({ bytes: corrupt, name: "bad.docx" }, "tex")).rejects.toThrow();
  });
});
