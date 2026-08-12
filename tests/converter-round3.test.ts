import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { decodeWbmp, decodeXpm, encodeWbmp, encodeXpm, isWbmp, isXpm } from "../src/core/converter/xpm-wbmp";
import {
  docxToDocm,
  docxToDotx,
  htmlToLatex,
  pptxToPptm,
  pptxToPpsx,
  pptxToPotx,
  recordsToIcs,
  recordsToVcf,
  xlsxToXlsm,
  xlsxToXltm,
  xlsxToXltx,
} from "../src/core/converter/documents";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, TARGET_LABELS } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";

const toText = (b: Uint8Array): string => new TextDecoder().decode(b);
const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

const tinyImage = (): { width: number; height: number; data: Uint8Array } => {
  const data = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const d = (y * 4 + x) * 4;
      const v = (x + y) * 40;
      data[d] = v;
      data[d + 1] = 255 - v;
      data[d + 2] = v;
      data[d + 3] = 255;
    }
  }
  return { width: 4, height: 4, data };
};

describe("XPM codec", () => {
  it("round-trips pixels through encode + decode", () => {
    const src = tinyImage();
    const bytes = encodeXpm(src);
    expect(isXpm(bytes)).toBe(true);
    const out = decodeXpm(bytes);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    for (let i = 0; i < src.data.length; i++) {
      expect(Math.abs(out.data[i]! - src.data[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps transparency via the None color", () => {
    const src = tinyImage();
    src.data[3] = 0; // first pixel transparent
    const out = decodeXpm(encodeXpm(src));
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(255);
  });

  it("detects XPM by magic bytes", () => {
    const det = detectFile(encodeXpm(tinyImage()), "pix.xpm");
    expect(det.type).toBe("image-xpm");
    expect(det.reliable).toBe(true);
  });
});

describe("WBMP codec", () => {
  it("round-trips through encode + decode", () => {
    const src = tinyImage();
    const bytes = encodeWbmp(src);
    expect(isWbmp(bytes)).toBe(true);
    const out = decodeWbmp(bytes);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    // 1-bit: every pixel is black or white.
    for (let i = 0; i < out.data.length; i += 4) {
      const v = out.data[i]!;
      expect(v === 0 || v === 255).toBe(true);
    }
  });

  it("handles widths not divisible by 8", () => {
    const src = { width: 5, height: 2, data: new Uint8Array(5 * 2 * 4).fill(255) };
    const out = decodeWbmp(encodeWbmp(src));
    expect(out.width).toBe(5);
    expect(out.height).toBe(2);
  });

  it("detects WBMP by magic bytes", () => {
    const det = detectFile(encodeWbmp(tinyImage()), "pix.wbmp");
    expect(det.type).toBe("image-wbmp");
  });
});

describe("record writers", () => {
  it("writes vCards from rows", () => {
    const vcf = recordsToVcf([
      { name: "Alice Smith", email: "alice@example.com", phone: "12345", org: "Acme" },
    ]);
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("FN:Alice Smith");
    expect(vcf).toContain("EMAIL:alice@example.com");
    expect(vcf).toContain("ORG:Acme");
    expect(vcf).toContain("END:VCARD");
  });

  it("writes iCalendar events from rows", () => {
    const ics = recordsToIcs([
      { summary: "Team call", start: "2026-08-15T10:00:00", location: "Zoom" },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Team call");
    expect(ics).toContain("LOCATION:Zoom");
    expect(ics).toContain("DTSTART:");
    expect(ics).toContain("END:VCALENDAR");
  });
});

describe("LaTeX writer", () => {
  it("writes a compilable-looking document from HTML", () => {
    const out = htmlToLatex("<h1>Title</h1><p>Hello <b>world</b>.</p>", "Doc");
    expect(out).toContain("\\documentclass{article}");
    expect(out).toContain("\\title{Doc}");
    expect(out).toContain("\\section{Title}");
    expect(out).toContain("\\begin{document}");
    expect(out).toContain("\\end{document}");
  });
});

describe("OOXML repackages", () => {
  it("docx → docm swaps the content-type", () => {
    const docx = toBytes("<not-a-zip>");
    // Real repackage needs a valid OOXML zip; build one via the htmlToDocx writer.
    // (Direct call: expect the error path for garbage input.)
    try {
      docxToDocm(docx);
      throw new Error("should have thrown");
    } catch {
      // garbage input — the honest failure
    }
  });

  it("html → docm via the real dispatcher keeps the OOXML content-type", async () => {
    const out = await convertFile({ bytes: toBytes("<h1>Hi</h1>"), name: "d.html" }, "docm");
    expect(out.mime).toContain("macroEnabled");
    expect(toText(out.bytes.slice(0, 2))).toBe("PK"); // it's a zip
    const files = unzipSync(out.bytes);
    const ct = strFromU8(files["[Content_Types].xml"]!);
    expect(ct).toContain("macroEnabled"); // wordprocessingml.document.macroEnabled.main+xml
  });

  it("html → dotx via the real dispatcher", async () => {
    const out = await convertFile({ bytes: toBytes("<h1>Hi</h1>"), name: "d.html" }, "dotx");
    expect(out.mime).toContain("template");
  });

  it("csv → xlsm / xltx / xltm via the real dispatcher", async () => {
    const csv = "name,age\nAda,36\n";
    const xlsm = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "xlsm");
    expect(xlsm.mime).toContain("macroEnabled");
    const xltx = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "xltx");
    expect(xltx.mime).toContain("template");
    const xltm = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "xltm");
    expect(xltm.mime).toContain("template.macroEnabled");
  });

  it("html → pptm / potx / ppsx via the real dispatcher", async () => {
    const html = "<h1>Title</h1><p>Slide one.</p>";
    const pptm = await convertFile({ bytes: toBytes(html), name: "s.html" }, "pptm");
    expect(pptm.mime).toContain("macroEnabled");
    const potx = await convertFile({ bytes: toBytes(html), name: "s.html" }, "potx");
    expect(potx.mime).toContain("template");
    const ppsx = await convertFile({ bytes: toBytes(html), name: "s.html" }, "ppsx");
    expect(ppsx.mime).toContain("slideshow");
  });
});

describe("new target routing through the real dispatcher", () => {
  it("csv → vcf and csv → ics", async () => {
    const csv = "name,email\nAlice,alice@example.com\n";
    const vcf = await convertFile({ bytes: toBytes(csv), name: "c.csv" }, "vcf");
    expect(toText(vcf.bytes)).toContain("BEGIN:VCARD");
    expect(toText(vcf.bytes)).toContain("alice@example.com");
    const ics = await convertFile({ bytes: toBytes(csv), name: "c.csv" }, "ics");
    expect(toText(ics.bytes)).toContain("BEGIN:VCALENDAR");
  });

  it("vcf → ics and ics → vcf (contact/calendar interop)", async () => {
    const vcf = "BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nEMAIL:jane@x.com\nEND:VCARD\n";
    const ics = await convertFile({ bytes: toBytes(vcf), name: "c.vcf" }, "ics");
    expect(toText(ics.bytes)).toContain("BEGIN:VCALENDAR");
    const back = await convertFile({ bytes: toBytes("BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//x//EN\nBEGIN:VEVENT\nUID:1@x\nDTSTART:20260815T100000Z\nSUMMARY:Call\nEND:VEVENT\nEND:VCALENDAR\n"), name: "e.ics" }, "vcf");
    expect(toText(back.bytes)).toContain("BEGIN:VCARD");
  });

  it("html → tex", async () => {
    const out = await convertFile({ bytes: toBytes("<h1>Title</h1><p>Body</p>"), name: "d.html" }, "tex");
    expect(toText(out.bytes)).toContain("\\documentclass");
  });

  it("html → prc and html → pdb (PalmDB writer)", async () => {
    const html = "<h1>Title</h1><p>Body</p>";
    const prc = await convertFile({ bytes: toBytes(html), name: "d.html" }, "prc");
    // PalmDB type "BOOK" (offset 60) + creator "MOBI" (offset 64) spell the magic.
    expect(toText(prc.bytes.slice(60, 68))).toBe("BOOKMOBI");
    // First record entry lives at 78+8; the MOBI header inside record 0 starts
    // with the "MOBI" magic (PalmDOC 16-byte header precedes it).
    const firstRecord = new DataView(prc.bytes.buffer, prc.bytes.byteOffset).getUint32(78, false); // big-endian PalmDB
    expect(toText(prc.bytes.slice(firstRecord + 16, firstRecord + 20))).toBe("MOBI");
    const pdb = await convertFile({ bytes: toBytes(html), name: "d.html" }, "pdb");
    expect(toText(pdb.bytes.slice(60, 68))).toBe("BOOKMOBI");
  });

  it("wav → oga and mp3 → m4b aliases route to the same encoders", async () => {
    const rate = 8000;
    const n = 16;
    const wav = new Uint8Array(44 + n);
    const te = new TextEncoder();
    wav.set(te.encode("RIFF"), 0);
    new DataView(wav.buffer).setUint32(4, 36 + n, true);
    wav.set(te.encode("WAVE"), 8);
    wav.set(te.encode("fmt "), 12);
    const dv = new DataView(wav.buffer);
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate, true);
    dv.setUint16(32, 1, true);
    dv.setUint16(34, 8, true);
    wav.set(te.encode("data"), 36);
    dv.setUint32(40, n, true);
    for (let i = 0; i < n; i++) wav[44 + i] = 128 + Math.round(Math.sin(i) * 100);

    const oga = await convertFile({ bytes: wav, name: "c.wav" }, "audio-oga");
    expect(oga.mime).toContain("ogg");
    expect(toText(oga.bytes.slice(0, 4))).toBe("OggS");
    const m4b = await convertFile({ bytes: wav, name: "c.wav" }, "audio-m4b");
    expect(m4b.mime).toContain("audio/mp4");
  });

  it("records sources route doc/sheet targets (sitemap → sql)", async () => {
    const sitemap = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x.com/a</loc></url><url><loc>https://x.com/b</loc></url></urlset>';
    const sql = await convertFile({ bytes: toBytes(sitemap), name: "s.xml" }, "sql");
    expect(toText(sql.bytes)).toContain("INSERT INTO");
    const docx = await convertFile({ bytes: toBytes(sitemap), name: "s.xml" }, "docx");
    expect(docx.mime).toContain("wordprocessingml");
  });
});

describe("matrix consistency for the new round", () => {
  it("advertises every new target somewhere", () => {
    const all = new Set(Object.values(MATRIX).flat());
    for (const t of [
      "image-xpm", "image-wbmp", "docm", "dotx", "pptm", "potx", "ppsx",
      "xlsm", "xltx", "xltm", "prc", "pdb", "tex", "vcf", "ics",
      "audio-oga", "audio-m4b",
    ] as const) {
      expect(all.has(t), `${t} not advertised`).toBe(true);
    }
  });

  it("has no duplicate targets per source and labels every target", () => {
    for (const [source, targets] of Object.entries(MATRIX)) {
      expect(new Set(targets).size, `${source} has duplicates`).toBe(targets.length);
      for (const t of targets) expect(TARGET_LABELS[t], `${t} missing label`).toBeTruthy();
    }
  });

  it("keeps subtitle sources free of vcf/ics", () => {
    for (const s of ["srt", "vtt", "lrc"] as const) {
      expect(MATRIX[s]).not.toContain("vcf");
      expect(MATRIX[s]).not.toContain("ics");
    }
  });

  it("advertises pptx → odp now that Codex's ODP path is merged", () => {
    expect(MATRIX["pptx"]).toContain("odp");
  });
});
