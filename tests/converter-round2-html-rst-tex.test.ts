// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("round 2: HTML to RST and TeX", () => {
  it("advertises ranks 3084 and 3086", () => expect(targetsFor("html")).toEqual(expect.arrayContaining(["rst", "tex"])));
  it("converts semantic HTML to escaped structured RST", async () => {
    const result = await convertFile({ bytes: encode("<!doctype html><html><body><h1>Report</h1><p>A_B * draft.</p></body></html>"), name: "page.html" }, "rst");
    const text = new TextDecoder().decode(result.bytes);
    expect(result.name).toBe("page.rst"); expect(result.mime).toBe("text/x-rst");
    expect(text).toMatch(/^HTML document\n=============\n/); expect(text).toContain("A\\_B \\* draft.");
  });
  it("converts semantic HTML to standalone escaped TeX", async () => {
    const result = await convertFile({ bytes: encode("<html><body><p>Budget #1 costs $50 &amp; tax_2026.</p></body></html>"), name: "page.html" }, "tex");
    const text = new TextDecoder().decode(result.bytes);
    expect(result.name).toBe("page.tex"); expect(result.mime).toBe("application/x-tex");
    expect(text).toContain("\\begin{document}"); expect(text).toContain("Budget \\#1 costs \\$50 \\& tax\\_2026."); expect(text).toContain("\\end{document}");
  });
  it.each(["rst", "tex"] as const)("rejects blank HTML for %s", async (target) => {
    await expect(convertFile({ bytes: encode("<html><body> </body></html>"), name: "empty.html" }, target)).rejects.toThrow(/no readable text/);
  });
});
