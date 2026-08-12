// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { canvasOptions } from "./canvas-options";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, type TargetFormat } from "../src/core/converter/matrix";
import { csvToXlsx, textToDocx } from "../src/core/converter/documents";

const dec = new TextDecoder();

function assertOutput(target: TargetFormat, bytes: Uint8Array): void {
  expect(bytes.length, `${target} output must not be empty`).toBeGreaterThan(0);
  if (target === "pdf") expect(dec.decode(bytes.subarray(0, 5))).toBe("%PDF-");
  if (["docx", "epub", "xlsx", "odt", "pptx", "ods"].includes(target)) {
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(Object.keys(unzipSync(bytes)).length).toBeGreaterThan(1);
  }
  if (target === "rtf") expect(dec.decode(bytes.subarray(0, 5))).toBe("{\\rtf");
  if (target === "xls") expect(bytes.subarray(0, 8)).toEqual(
    new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  );
}

describe("converter batch 1 - OOXML variants", () => {
  const word = textToDocx("Quarterly report\nRevenue grew by 12 percent.");
  let sheet: Uint8Array;

  beforeAll(async () => {
    sheet = await csvToXlsx("name,total\nAlpha,12\nBeta,34");
  });

  for (const source of ["docm", "dotx"] as const) {
    it(`detects ${source} without collapsing it to docx`, () => {
      expect(detectFile(word, `report.${source}`).type).toBe(source);
    });

    for (const target of MATRIX[source]) {
      it(`${source} -> ${target} produces a real output`, async () => {
        const result = await convertFile({ bytes: word, name: `report.${source}` }, target, canvasOptions());
        assertOutput(target, result.bytes);
        if (["html", "markdown", "text"].includes(target)) {
          expect(dec.decode(result.bytes)).toContain("Quarterly report");
        }
      });
    }
  }

  it("detects xlsm without collapsing it to xlsx", () => {
    expect(detectFile(sheet, "totals.xlsm").type).toBe("xlsm");
  });

  for (const target of MATRIX.xlsm) {
    it(`xlsm -> ${target} produces a real output`, async () => {
      const result = await convertFile({ bytes: sheet, name: "totals.xlsm" }, target, canvasOptions());
      assertOutput(target, result.bytes);
      if (["csv", "tsv", "json", "yaml", "xml", "html", "markdown", "text"].includes(target)) {
        expect(dec.decode(result.bytes)).toContain("Alpha");
      }
    });
  }

  it("rejects corrupt OOXML variants honestly", async () => {
    const garbage = new TextEncoder().encode("not an OOXML package");
    await expect(convertFile({ bytes: garbage, name: "bad.docm" }, "pdf")).rejects.toThrow();
    await expect(convertFile({ bytes: garbage, name: "bad.xlsm" }, "csv")).rejects.toThrow();
  });
});
