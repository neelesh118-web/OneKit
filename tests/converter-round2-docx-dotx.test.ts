// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { htmlToDocx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

describe("round 2 rank 2933: DOCX to DOTX", () => {
  it("advertises the pair", () => expect(targetsFor("docx")).toContain("dotx"));

  it("writes a genuine Word template package with readable source text", async () => {
    const input = await htmlToDocx("<h1>Reusable report</h1><p>Local template content.</p>");
    const result = await convertFile({ bytes: input, name: "report.docx" }, "dotx");
    expect(result).toMatchObject({ name: "report.dotx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.template" });
    const files = unzipSync(result.bytes);
    expect(strFromU8(files["[Content_Types].xml"]!)).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml");
    const document = strFromU8(files["word/document.xml"]!);
    expect(document).toContain("Reusable report"); expect(document).toContain("Local template content.");
    expect(files["word/vbaProject.bin"]).toBeUndefined();
  });

  it("rejects corrupt DOCX instead of emitting a template shell", async () => {
    await expect(convertFile({ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]), name: "bad.docx" }, "dotx"))
      .rejects.toThrow();
  });
});
