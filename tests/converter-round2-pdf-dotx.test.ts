// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
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

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("round 2: PDF to DOTX", () => {
  it("advertises the demand-ranked template target", () => {
    expect(targetsFor("pdf")).toContain("dotx");
  });

  it("extracts real PDF text into a standards-correct editable Word template", async () => {
    const result = await convertFile({ bytes: await realPdf("Editable local template text"), name: "source.pdf" }, "dotx");
    expect(result.name).toBe("source.dotx");
    expect(result.mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.template");
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]));
    const contentTypes = decode(files["[Content_Types].xml"]!);
    expect(contentTypes).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml");
    expect(contentTypes).not.toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");

    const relationships = decode(files["_rels/.rels"]!);
    expect(relationships).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"');
    expect(relationships).toContain('Target="word/document.xml"');
    expect(decode(files["word/document.xml"]!)).toContain("Editable local template text");
  });

  it("rejects corrupt PDF input instead of creating an empty template", async () => {
    await expect(convertFile({ bytes: new TextEncoder().encode("not a PDF"), name: "broken.pdf" }, "dotx"))
      .rejects.toThrow(/Could not read this PDF/);
  });
});
