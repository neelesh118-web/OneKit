// @vitest-environment node
// Round 17: twenty-nine new sources — Photoshop Large (PSB), the whole
// OpenDocument family (ott/otp/ots/otg templates, flat fodt/fods/fodp,
// OpenOffice 1.x sxw/sxc/sxi), Garmin TCX, dBASE, Scribus, Xfig, HPGL,
// WPL/XSPF playlists, M4B/Opus/WebA audio, 3GP/3G2/OGV video and the
// app-package ZIP variants (apk/jar/war/ear/ipa).
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { detectFile, detectFromBytes } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { decodePsd } from "../src/core/converter/psd";
import { canvasOptions } from "./canvas-options";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const zipMagic = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const pngMagic = (b: Uint8Array): boolean => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

async function conv(
  input: Parameters<typeof convertFile>[0],
  target: Parameters<typeof convertFile>[1],
  opts?: Parameters<typeof convertFile>[2]
): Promise<Uint8Array> {
  const r = await convertFile(input, target, opts);
  return r.bytes;
}

/* ---- fixtures ---------------------------------------------------------- */

const ODF_TEXT_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">
<office:body><office:text>
<text:h text:outline-level="1">Chapter one</text:h>
<text:p>Hello from OpenDocument</text:p>
<text:list><text:list-item><text:p>Item A</text:p></text:list-item></text:list>
</office:text></office:body></office:document-content>`;

const ODF_TABLE_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:spreadsheet><table:table table:name="Sheet1">
<table:table-row><table:table-cell><text:p>name</text:p></table:table-cell><table:table-cell><text:p>role</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell><text:p>Ada</text:p></table:table-cell><table:table-cell><text:p>dev</text:p></table:table-cell></table:table-row>
</table:table></office:spreadsheet></office:body></office:document-content>`;

const ODF_PRES_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:presentation><draw:page draw:name="Slide 1"><draw:frame><draw:text-box><text:p>Slide title</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>`;

function odfZip(content: string): Uint8Array {
  return zipSync({ "mimetype": enc("application/octet-stream"), "content.xml": enc(content) });
}

const TCX = enc(
  `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="Running"><Lap><Track>
<Trackpoint><Time>2026-01-01T10:00:00Z</Time><Position><LatitudeDegrees>51.5</LatitudeDegrees><LongitudeDegrees>-0.12</LongitudeDegrees></Position><AltitudeMeters>20</AltitudeMeters></Trackpoint>
<Trackpoint><Time>2026-01-01T10:01:00Z</Time><Position><LatitudeDegrees>51.51</LatitudeDegrees><LongitudeDegrees>-0.13</LongitudeDegrees></Position><AltitudeMeters>22</AltitudeMeters></Trackpoint>
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
);

const WPL = enc(`<?wpl version="1.0"?><smil><body><seq><media src="song1.mp3" title="Song One"/><media src="song2.mp3" title="Song Two"/></seq></body></smil>`);
const XSPF = enc(`<?xml version="1.0" encoding="UTF-8"?><playlist version="1" xmlns="http://xspf.org/ns/0/"><trackList><track><title>Song One</title><creator>Artist</creator><location>file:///song1.mp3</location></track></trackList></playlist>`);

const SLA = zipSync({ "document.xml": enc(`<SCRIBUSUTF8NEW><DOCUMENT><STORY><ITEXT CH="Hello from Scribus"/></STORY></DOCUMENT></SCRIBUSUTF8NEW>`) });

const FIG = enc("#FIG 3.2\nLandscape\n1 1 1 0 0\n4 0 50 -1 0 0 12 0.000 1 180 0 0 0 0\nHello fig text\x01\n");

const PLT = enc("IN;SP1;\nPU0,0;\nPA100,100;\nLBHello plotter\x03\n");

/** dBASE III table: header + field descriptors + two records. */
function buildDbf(): Uint8Array {
  const fields = [
    { name: "NAME", len: 10 },
    { name: "ROLE", len: 6 },
  ];
  const headerLen = 32 + fields.length * 32 + 1;
  const recordLen = 1 + 10 + 6;
  const out = new Uint8Array(headerLen + recordLen * 2);
  out[0] = 0x03; // dBASE III
  const view = new DataView(out.buffer);
  view.setUint32(4, 2, true); // record count
  view.setUint16(8, headerLen, true);
  view.setUint16(10, recordLen, true);
  fields.forEach((f, i) => {
    const at = 32 + i * 32;
    out.set(enc(f.name), at);
    out[at + 16] = f.len;
  });
  out[headerLen - 1] = 0x0d; // field terminator
  // record 1: "Ada", "dev"
  let pos = headerLen + 1;
  out[pos - 1] = 0x20;
  out.set(enc("Ada"), pos);
  pos += 10;
  out.set(enc("dev"), pos);
  // record 2: "Grace", "adm"
  pos = headerLen + recordLen + 1;
  out[pos - 1] = 0x20;
  out.set(enc("Grace"), pos);
  pos += 10;
  out.set(enc("adm"), pos);
  return out;
}

/** PSB (large-document Photoshop): version 2, 8-byte layer section length. */
function buildPsb(): Uint8Array {
  const width = 2;
  const height = 2;
  const channels = 3;
  const planeSize = width * height;
  const layerLenBytes = 8;
  const out = new Uint8Array(26 + 4 + 4 + (8 + layerLenBytes) + 2 + planeSize * channels);
  const view = new DataView(out.buffer);
  out.set(enc("8BPS"), 0);
  view.setUint16(4, 2, false); // PSB version
  view.setUint16(12, channels, false);
  view.setUint32(14, height, false);
  view.setUint32(18, width, false);
  view.setUint16(22, 8, false);
  view.setUint16(24, 3, false); // RGB
  view.setUint32(26, 0, false); // color mode data
  view.setUint32(30, 0, false); // image resources
  view.setUint32(34, 0, false); // layer/mask length hi
  view.setUint32(38, 0, false); // layer/mask length lo (8-byte total)
  view.setUint16(42, 0, false); // raw compression
  let pos = 44;
  for (let c = 0; c < channels; c++) {
    const plane = new Uint8Array(planeSize);
    plane[0] = 200;
    out.set(plane, pos);
    pos += planeSize;
  }
  return out;
}

/* ---- detection --------------------------------------------------------- */

describe("round-17 detection", () => {
  it("distinguishes PSB from PSD by the header version", () => {
    expect(detectFromBytes(buildPsb(), "unknown")).toBe("image-psb");
    const psd = new Uint8Array(buildPsb());
    psd[5] = 1; // version 1 → PSD
    expect(detectFromBytes(psd, "unknown")).toBe("image-psd");
  });

  it("spots flat ODF, TCX, playlists, dBASE, Xfig and HPGL by content", () => {
    expect(detectFromBytes(enc(ODF_TEXT_CONTENT), "unknown")).toBe("fodt");
    expect(detectFromBytes(enc(ODF_TABLE_CONTENT), "unknown")).toBe("fods");
    expect(detectFromBytes(TCX, "unknown")).toBe("tcx");
    expect(detectFromBytes(WPL, "unknown")).toBe("wpl");
    expect(detectFromBytes(XSPF, "unknown")).toBe("xspf");
    expect(detectFromBytes(FIG, "unknown")).toBe("fig");
    expect(detectFromBytes(PLT, "unknown")).toBe("plt");
    expect(detectFromBytes(buildDbf(), "unknown")).toBe("dbf");
  });

  it("routes Opus and 3GP by their magic", () => {
    // OggS + OpusHead at offset 28
    const opus = new Uint8Array(40);
    opus.set(enc("OggS"), 0);
    opus.set(enc("OpusHead"), 28);
    expect(detectFromBytes(opus, "unknown")).toBe("audio-opus");
    // ftyp3gp brand
    const gp = new Uint8Array(16);
    gp.set(enc("....ftyp3gp4"), 0);
    expect(detectFromBytes(gp, "unknown")).toBe("video-3gp");
    expect(detectFile(gp, "clip.3gpp").type).toBe("video-3gp");
    // extensions
    expect(detectFile(enc("x"), "book.m4b").type).toBe("audio-m4b");
    expect(detectFile(enc("x"), "track.weba").type).toBe("audio-weba");
    expect(detectFile(enc("x"), "shot.3g2").type).toBe("video-3g2");
    expect(detectFile(zipSync({}), "app.apk").type).toBe("apk");
  });
});

/* ---- behavior ---------------------------------------------------------- */

describe("round-17 ODF family", () => {
  it("reads OpenDocument templates and OpenOffice 1.x text as documents", async () => {
    for (const [name, type] of [["doc.ott", "ott"], ["doc.otg", "otg"], ["doc.sxw", "sxw"]] as const) {
      const docx = await conv({ name, bytes: odfZip(ODF_TEXT_CONTENT) }, "docx");
      expect(zipMagic(docx)).toBe(true);
      expect(dec(docx)).toContain("word/document.xml");
      const text = await conv({ name, bytes: odfZip(ODF_TEXT_CONTENT) }, "text");
      expect(dec(text)).toContain("Hello from OpenDocument");
    }
  });

  it("reads presentation templates and OOo 1.x decks as presentations", async () => {
    for (const [name, type] of [["deck.otp", "otp"], ["deck.sxi", "sxi"]] as const) {
      const pptx = await conv({ name, bytes: odfZip(ODF_PRES_CONTENT) }, "pptx");
      expect(zipMagic(pptx)).toBe(true);
      expect(dec(pptx)).toContain("ppt/presentation.xml");
    }
  });

  it("reads flat ODF text (fodt/fodp) and spreadsheets (fods)", async () => {
    const docx = await conv({ name: "doc.fodt", bytes: enc(ODF_TEXT_CONTENT) }, "docx");
    expect(dec(docx)).toContain("word/document.xml");
    const csv = await conv({ name: "sheet.fods", bytes: enc(ODF_TABLE_CONTENT) }, "csv");
    expect(dec(csv)).toContain("Ada");
    expect(dec(csv)).toContain("role");
    const xlsx = await conv({ name: "sheet.fods", bytes: enc(ODF_TABLE_CONTENT) }, "xlsx");
    expect(zipMagic(xlsx)).toBe(true);
  });

  it("reads ODF spreadsheet templates (ots/sxc) through the table walker", async () => {
    for (const [name, type] of [["sheet.ots", "ots"], ["sheet.sxc", "sxc"]] as const) {
      const csv = await conv({ name, bytes: odfZip(ODF_TABLE_CONTENT) }, "csv");
      expect(dec(csv)).toContain("Ada");
    }
  });
});

describe("round-17 records", () => {
  it("turns Garmin TCX trackpoints into a spreadsheet", async () => {
    const csv = await conv({ name: "run.tcx", bytes: TCX }, "csv");
    expect(dec(csv)).toContain("51.5");
    const json = await conv({ name: "run.tcx", bytes: TCX }, "json");
    expect(dec(json)).toContain("\"lat\"");
    expect(dec(json)).toContain("51.5");
  });

  it("reads dBASE tables into rows", async () => {
    const csv = await conv({ name: "people.dbf", bytes: buildDbf() }, "csv");
    expect(dec(csv)).toContain("Ada");
    expect(dec(csv)).toContain("Grace");
    const xlsx = await conv({ name: "people.dbf", bytes: buildDbf() }, "xlsx");
    expect(zipMagic(xlsx)).toBe(true);
  });

  it("reads WPL and XSPF playlists", async () => {
    const wplCsv = await conv({ name: "list.wpl", bytes: WPL }, "csv");
    expect(dec(wplCsv)).toContain("Song One");
    const xspfCsv = await conv({ name: "list.xspf", bytes: XSPF }, "csv");
    expect(dec(xspfCsv)).toContain("Song One");
  });
});

describe("round-17 prose sources", () => {
  it("reads Scribus documents", async () => {
    const docx = await conv({ name: "book.sla", bytes: SLA }, "docx");
    expect(zipMagic(docx)).toBe(true);
    const text = await conv({ name: "book.sla", bytes: SLA }, "text");
    expect(dec(text)).toContain("Hello from Scribus");
  });

  it("reads Xfig drawing text", async () => {
    const text = await conv({ name: "draw.fig", bytes: FIG }, "text");
    expect(dec(text)).toContain("Hello fig text");
  });

  it("reads HPGL plotter labels", async () => {
    const text = await conv({ name: "plot.plt", bytes: PLT }, "text");
    expect(dec(text)).toContain("Hello plotter");
  });
});

describe("round-17 PSB", () => {
  it("decodes the PSB flattened composite like PSD", () => {
    const img = decodePsd(buildPsb());
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(200);
  });

  it("converts PSB through the raster pipeline", async () => {
    const png = await conv({ name: "photo.psb", bytes: buildPsb() }, "image-png", canvasOptions());
    expect(pngMagic(png)).toBe(true);
    expect(targetsFor("image-psb")).toContain("epub");
  });
});

describe("round-17 audio/video additions", () => {
  it("advertises the full audio reach for M4B/Opus/WebA sources", () => {
    for (const s of ["audio-m4b", "audio-opus", "audio-weba"] as const) {
      expect(targetsFor(s)).toContain("audio-mp3");
      expect(targetsFor(s)).toContain("audio-flac");
      expect(targetsFor(s)).toContain("audio-m4b");
    }
  });

  it("advertises the video reach for 3GP/3G2/OGV without a fake MOV", () => {
    for (const s of ["video-3gp", "video-3g2", "video-ogv"] as const) {
      expect(targetsFor(s)).toContain("video-mp4");
      expect(targetsFor(s)).toContain("video-webm");
      expect(targetsFor(s)).toContain("image-gif");
      expect(targetsFor(s)).not.toContain("video-mov");
    }
  });
});

describe("round-17 app packages", () => {
  it("converts an APK-like zip to zip/tar/json", async () => {
    const apk = zipSync({ "AndroidManifest.xml": enc("x"), "classes.dex": enc("y") });
    const z = await conv({ name: "app.apk", bytes: apk }, "zip");
    expect(zipMagic(z)).toBe(true);
    const json = await conv({ name: "app.apk", bytes: apk }, "json");
    expect(dec(json)).toContain("AndroidManifest.xml");
    const text = await conv({ name: "app.jar", bytes: apk }, "text");
    expect(dec(text)).toContain("classes.dex");
  });
});
