// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { csvToXls, csvToXlsx, xlsxToCsv } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

describe("round 2: XLS and XLSX to macro-enabled OOXML", () => {
  it("advertises both XLSM output pairs", () => {
    expect(targetsFor("xls")).toContain("xlsm");
    expect(targetsFor("xlsx")).toContain("xlsm");
  });

  const csv = "name,score\nAda,99\nBob,42";
  const sources = [
    ["xls", () => csvToXls(csv), "scores.xls"],
    ["xlsx", () => csvToXlsx(csv), "scores.xlsx"]
  ] as const;

  for (const [source, makeBytes, name] of sources) {
    it(`${source} emits a standards-correct macro-enabled workbook with intact data`, async () => {
      const result = await convertFile({ bytes: await makeBytes(), name }, "xlsm");
      expect(result.name).toBe("scores.xlsm");
      expect(result.mime).toBe("application/vnd.ms-excel.sheet.macroEnabled.12");
      expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

      const files = unzipSync(result.bytes);
      const contentTypes = strFromU8(files["[Content_Types].xml"]!);
      expect(contentTypes).toContain("application/vnd.ms-excel.sheet.macroEnabled.main+xml");
      expect(files["xl/workbook.xml"]).toBeDefined();
      expect(files["xl/vbaProject.bin"]).toBeUndefined();
      expect(await xlsxToCsv(result.bytes)).toContain("Ada,99");
      expect(await xlsxToCsv(result.bytes)).toContain("Bob,42");
    });
  }
});
