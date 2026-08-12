// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";
import { parseAsciiDxf } from "../src/core/converter/vector";

const encoder = new TextEncoder();

const drawing = encoder.encode(`0
SECTION
2
ENTITIES
0
LINE
10
0
20
0
11
100
21
50
0
LWPOLYLINE
70
1
10
10
20
10
10
40
20
10
10
70
0
CIRCLE
10
50
20
25
40
12
0
ARC
10
75
20
25
40
10
50
0
51
180
0
TEXT
10
5
20
55
40
5
1
OneKit DXF
0
ENDSEC
0
EOF
`);

describe("round 2 batch 3: ASCII DXF to PDF", () => {
  it("detects DXF by filename and advertises the PDF pair", () => {
    expect(detectFile(drawing, "drawing.dxf").type).toBe("dxf");
    // Round 5 extended dxf beyond pdf → svg/raster/html/text.
    expect(targetsFor("dxf")).toContain("pdf");
    expect(targetsFor("dxf").length).toBeGreaterThan(3);
    expect(Object.values(MATRIX).reduce((total, targets) => total + targets.length, 0)).toBeGreaterThanOrEqual(1280);
  });

  it("parses supported vector and text entities", () => {
    expect(parseAsciiDxf(drawing)).toHaveLength(5);
  });

  it("renders drawing geometry into a real one-page PDF", async () => {
    const result = await convertFile({ bytes: drawing, name: "plan.dxf" }, "pdf");
    expect(result.name).toBe("plan.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
    expect(result.bytes.length).toBeGreaterThan(700);
  });

  it("rejects binary DXF with an actionable message", async () => {
    const binary = encoder.encode("AutoCAD Binary DXF\r\n\u001a\0");
    await expect(convertFile({ bytes: binary, name: "binary.dxf" }, "pdf")).rejects.toThrow(/Binary DXF.*ASCII/);
  });

  it("rejects drawings with no supported entities instead of emitting a blank PDF", async () => {
    const empty = encoder.encode("0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n1\n20\n2\n0\nENDSEC\n0\nEOF\n");
    await expect(convertFile({ bytes: empty, name: "point-only.dxf" }, "pdf")).rejects.toThrow(/no supported drawing entities/);
  });
});
