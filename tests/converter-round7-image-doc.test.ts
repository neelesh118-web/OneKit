// @vitest-environment node
// Round 7 — OCR image → document targets, .doc/.et content sniffing,
// Apple Numbers, and GeoJSON as source + target.
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { canvasOptions } from "./canvas-options";
import { zipText } from "../src/core/converter/zip-realm";
import { zipSync, gzipSync } from "fflate/browser";
import { gunzipToText } from "../src/core/converter/archives";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

const SVG = enc('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="5" y="20">Hello SVG text</text></svg>');

const GPX = enc(
  '<?xml version="1.0"?><gpx version="1.1"><trk><name>Loop</name><trkseg>' +
    '<trkpt lat="51.5" lon="-0.1"><ele>10</ele><name>P1</name></trkpt>' +
    '<trkpt lat="51.6" lon="-0.2"><ele>12</ele><name>P2</name></trkpt>' +
    "</trkseg></trk></gpx>"
);

const ocrOpts = {
  ocr: { recognize: async (): Promise<string> => "Hello OCR world" }
};

describe("round 7: OCR image → document targets", () => {
  it("advertises the OCR prose targets on raster sources", () => {
    for (const source of ["image-png", "image-jpeg", "image-gif", "raw-dng"] as const) {
      expect(targetsFor(source)).toEqual(expect.arrayContaining(["rst", "abw", "xhtml", "odg", "azw3", "ps"]));
    }
  });

  it("png → rst / abw / xhtml / odg / azw3 carry the recognised text", async () => {
    for (const target of ["rst", "abw", "xhtml", "odg", "azw3"] as const) {
      const out = await convertFile({ name: "photo.png", bytes: PIXEL }, target, { ...canvasOptions(), ...ocrOpts });
      expect(out.bytes.length).toBeGreaterThan(0);
      const back = await convertFile({ name: `out.${out.name.split(".").pop()}`, bytes: out.bytes }, "text");
      expect(dec(back.bytes)).toContain("Hello OCR world");
    }
  });

  it("png → ps / eps are PostScript with the recognised text", async () => {
    const ps = await convertFile({ name: "photo.png", bytes: PIXEL }, "ps", { ...canvasOptions(), ...ocrOpts });
    expect(dec(ps.bytes)).toContain("%!PS-Adobe-3.0");
    expect(dec(ps.bytes)).toContain("Hello OCR world");
    const eps = await convertFile({ name: "photo.png", bytes: PIXEL }, "eps", { ...canvasOptions(), ...ocrOpts });
    expect(dec(eps.bytes)).toContain("%%BoundingBox:");
  });

  it("png → svgz is a gzipped SVG; png → cbz is a single-page comic zip", async () => {
    const svgz = await convertFile({ name: "photo.png", bytes: PIXEL }, "svgz", canvasOptions());
    expect(gunzipToText(svgz.bytes)).toContain("<svg");
    const cbz = await convertFile({ name: "photo.png", bytes: PIXEL }, "cbz", canvasOptions());
    expect(detectFile(cbz.bytes, "comic.cbz").type).toBe("cbz");
  });

  it("svg → rst uses the SVG's own text (no OCR needed)", async () => {
    const rst = await convertFile({ name: "draw.svg", bytes: SVG }, "rst");
    expect(dec(rst.bytes)).toContain("Hello SVG text");
    const svgz = await convertFile({ name: "draw.svg", bytes: SVG }, "svgz");
    expect(gunzipToText(svgz.bytes)).toContain("Hello SVG text");
  });
});

describe("round 7: .doc content sniffing", () => {
  it("converts text-payload .doc files", async () => {
    const out = await convertFile({ name: "letter.doc", bytes: enc("Hello DOC sniffer") }, "html");
    expect(dec(out.bytes)).toContain("Hello DOC sniffer");
  });

  it("converts RTF-payload .doc through the RTF path", async () => {
    const rtf = enc("{\\rtf1 Hello from RTF doc}");
    const detected = detectFile(rtf, "letter.doc");
    expect(typeof detected === "string" ? detected : detected.type).toBe("rtf");
    const out = await convertFile({ name: "letter.doc", bytes: rtf }, "text");
    expect(dec(out.bytes)).toContain("Hello from RTF");
  });

  it("throws an honest error for binary OLE2 containers", async () => {
    const binary = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(64).fill(0)]);
    await expect(convertFile({ name: "legacy.doc", bytes: binary }, "html")).rejects.toThrow();
  });
});

describe("round 7: .et (WPS Spreadsheet) content sniffing", () => {
  it("reads an OOXML-zip .et as a spreadsheet", async () => {
    const xlsx = await convertFile({ name: "data.csv", bytes: enc("name,qty\nAlpha,12") }, "xlsx");
    const out = await convertFile({ name: "sheet.et", bytes: xlsx.bytes }, "csv");
    expect(dec(out.bytes)).toContain("Alpha");
  });

  it("reads CSV-text .et files as a table", async () => {
    const out = await convertFile({ name: "sheet.et", bytes: enc("name,qty\nBeta,34") }, "json");
    expect(dec(out.bytes)).toContain("Beta");
  });

  it("throws an honest error for unknown binary containers", async () => {
    const binary = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, ...Array(64).fill(0xaa)]);
    await expect(convertFile({ name: "sheet.et", bytes: binary }, "csv")).rejects.toThrow();
  });
});

describe("round 7: Apple Numbers", () => {
  it("reads the sheet strings from an XML-based .numbers package", async () => {
    const numbers = zipSync({
      "Index/Document.xml": zipText("<document>Quarterly revenue numbers</document>"),
      "Metadata/BuildVersionHistory.plist": zipText("<plist/>")
    });
    expect(detectFile(numbers, "sheet.numbers").type).toBe("numbers");
    const out = await convertFile({ name: "sheet.numbers", bytes: numbers }, "text");
    expect(dec(out.bytes)).toContain("Quarterly revenue");
  });
});

describe("round 7: GeoJSON source + target", () => {
  it("gpx → geojson builds a FeatureCollection", async () => {
    const out = await convertFile({ name: "track.gpx", bytes: GPX }, "geojson");
    expect(out.mime).toBe("application/geo+json");
    const data = JSON.parse(dec(out.bytes));
    expect(data.type).toBe("FeatureCollection");
    expect(data.features.length).toBeGreaterThan(0);
    expect(data.features[0].properties).toBeDefined();
  });

  it("detects and reads a geojson source back into a table", async () => {
    const geojson = enc(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          { type: "Feature", id: "f1", properties: { name: "Alpha", qty: "12" }, geometry: null }
        ]
      })
    );
    expect(detectFile(geojson, "map.geojson").type).toBe("geojson");
    const out = await convertFile({ name: "map.geojson", bytes: geojson }, "csv");
    expect(dec(out.bytes)).toContain("Alpha");
    const json = await convertFile({ name: "map.geojson", bytes: geojson }, "json");
    expect(dec(json.bytes)).toContain("Alpha");
  });

  it("round-trips records → geojson → records", async () => {
    const csv = enc("city,pop\nLondon,9\n");
    const geojson = await convertFile({ name: "c.csv", bytes: csv }, "geojson");
    const back = await convertFile({ name: "m.geojson", bytes: geojson.bytes }, "csv");
    expect(dec(back.bytes)).toContain("London");
  });

  it("writes abw/zabw from a document and reads them back", async () => {
    const abw = await convertFile({ name: "doc.html", bytes: enc("<p>AbiWord target</p>") }, "abw");
    expect(dec(abw.bytes)).toContain("<abiword");
    const back = await convertFile({ name: "doc.abw", bytes: abw.bytes }, "text");
    expect(dec(back.bytes)).toContain("AbiWord target");
    const zabw = await convertFile({ name: "doc.html", bytes: enc("<p>ZABW target</p>") }, "zabw");
    expect(gunzipToText(zabw.bytes)).toContain("<abiword");
  });
});
