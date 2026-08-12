import { describe, expect, it } from "vitest";
import { encodeVoc, isVoc, parseVoc } from "../src/core/converter/voc";
import {
  difToRecords,
  gnumericToRecords,
  htmlToAsciidoc,
  htmlToMediawiki,
  htmlToOrg,
  htmlToTextile,
  htmlToHtmlz,
  htmlToTxtz,
  psvToRecords,
  ssvToRecords,
  recordsToSql,
  recordsToProperties,
  cuesToAss,
  cuesToSbv,
  cuesToTtml,
} from "../src/core/converter/documents";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, TARGET_LABELS } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";

const toText = (b: Uint8Array): string => new TextDecoder().decode(b);
const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("VOC audio codec", () => {
  const makeSamples = (): Float32Array => {
    const s = new Float32Array(32);
    for (let i = 0; i < s.length; i++) s[i] = Math.sin((i / s.length) * Math.PI * 4) * 0.8;
    return s;
  };

  it("encodes a recognizable VOC container", () => {
    const bytes = encodeVoc(8000, 1, makeSamples());
    expect(isVoc(bytes)).toBe(true);
    // ASCII "Creative Voice File"
    expect(new TextDecoder().decode(bytes.slice(0, 19))).toBe("Creative Voice File");
  });

  it("round-trips 8-bit samples through parse+encode", () => {
    const samples = makeSamples();
    const bytes = encodeVoc(11025, 1, samples);
    const parsed = parseVoc(bytes);
    // 8-bit time-constant: rate = 1_000_000 / (256 - tc) ≈ 11025.
    expect(parsed.sampleRate).toBeGreaterThan(10000);
    expect(parsed.sampleRate).toBeLessThan(12000);
    expect(parsed.channels).toBe(1);
    expect(parsed.samples.length).toBe(samples.length);
    // Approximate: 8-bit quantization tolerance.
    for (let i = 0; i < samples.length; i++) {
      expect(Math.abs(parsed.samples[i]! - samples[i]!)).toBeLessThan(0.05);
    }
  });

  it("detects VOC by magic bytes", () => {
    const bytes = encodeVoc(8000, 1, makeSamples());
    const det = detectFile(new Uint8Array(bytes), "clip.voc");
    expect(det.type).toBe("audio-voc");
    expect(det.reliable).toBe(true);
  });
});

describe("new record sources", () => {
  it("parses semicolon-separated values", () => {
    const records = ssvToRecords("name;age;city\nAlice;30;London\nBob;25;Paris");
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ name: "Alice", age: "30", city: "London" });
    expect(records[1]).toMatchObject({ city: "Paris" });
  });

  it("parses pipe-separated values", () => {
    const records = psvToRecords("name|role\nAlice|admin\nBob|user");
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ name: "Alice", role: "admin" });
    expect(records[1]).toMatchObject({ role: "user" });
  });

  it("parses DIF (Data Interchange Format) into records", () => {
    const dif = [
      "TABLE",
      "0,1",
      '"EXCEL"',
      "VECTORS",
      "0,8",
      '""',
      "TUPLES",
      "0,3",
      '""',
      "DATA",
      "0,0",
      '""',
      "-1,0",
      "BOT",
      "1,0",
      '"Name"',
      "1,0",
      '"Age"',
      "-1,0",
      "BOT",
      "1,0",
      '"Alice"',
      "1,0",
      '"30"',
      "-1,0",
      "BOT",
      "1,0",
      '"Bob"',
      "1,0",
      '"25"',
      "-1,0",
      "EOD",
    ].join("\n");
    const records = difToRecords(dif);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ Name: "Alice", Age: "30" });
    expect(records[1]).toMatchObject({ Name: "Bob", Age: "25" });
  });

  it("parses GNumeric XML into records", () => {
    const xml = `<?xml version="1.0"?>
<gnm:Workbook xmlns:gnm="http://www.gnumeric.org/v10.dtd">
  <gnm:Sheets>
    <gnm:Sheet gnm:Name="Sheet1">
      <gnm:Rows>
        <gnm:Row gnm:r="0">
          <gnm:Cells>
            <gnm:Cell gnm:r="0" gnm:c="0" gnm:Text="Name"/>
            <gnm:Cell gnm:r="0" gnm:c="1" gnm:Text="Age"/>
          </gnm:Cells>
        </gnm:Row>
        <gnm:Row gnm:r="1">
          <gnm:Cells>
            <gnm:Cell gnm:r="1" gnm:c="0" gnm:Text="Alice"/>
            <gnm:Cell gnm:r="1" gnm:c="1" gnm:Text="30"/>
          </gnm:Cells>
        </gnm:Row>
        <gnm:Row gnm:r="2">
          <gnm:Cells>
            <gnm:Cell gnm:r="2" gnm:c="0" gnm:Text="Bob"/>
            <gnm:Cell gnm:r="2" gnm:c="1" gnm:Text="25"/>
          </gnm:Cells>
        </gnm:Row>
      </gnm:Rows>
    </gnm:Sheet>
  </gnm:Sheets>
</gnm:Workbook>`;
    const records = gnumericToRecords(xml);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ Name: "Alice", Age: "30" });
    expect(records[1]).toMatchObject({ Name: "Bob", Age: "25" });
  });
});

describe("text-markup doc targets", () => {
  const html = "<h1>Title</h1><p>Hello <b>world</b>.</p><ul><li>One</li><li>Two</li></ul>";

  it("writes Org-mode", () => {
    const out = htmlToOrg(html, "Doc");
    expect(out).toContain("#+TITLE: Doc");
    expect(out).toContain("* Title");
    expect(out).toContain("Hello world");
    expect(out).toContain("One");
    expect(out).toContain("Two");
  });

  it("writes Textile", () => {
    const out = htmlToTextile(html, "Doc");
    expect(out).toContain("h1. Doc");
    expect(out).toContain("h2. Title");
    expect(out).toContain("* Hello world");
    expect(out).toContain("* One");
  });

  it("writes MediaWiki", () => {
    const out = htmlToMediawiki(html, "Doc");
    expect(out).toContain("== Doc ==");
    expect(out).toContain("== Title ==");
    expect(out).toContain("* Hello world");
    expect(out).toContain("* One");
  });

  it("writes AsciiDoc", () => {
    const out = htmlToAsciidoc(html, "Doc");
    expect(out).toContain("= Doc");
    expect(out).toContain(":toc:");
    expect(out).toContain("== Title");
    expect(out).toContain("Two");
  });

  it("wraps HTML into htmlz and txtz zip containers", () => {
    const htmlz = htmlToHtmlz(html, "Doc");
    const txtz = htmlToTxtz(html, "Doc");
    // Both are ZIP archives — PK header.
    expect(String.fromCharCode(htmlz[0]!, htmlz[1]!)).toBe("PK");
    expect(String.fromCharCode(txtz[0]!, txtz[1]!)).toBe("PK");
    expect(htmlz.length).toBeGreaterThan(0);
    expect(txtz.length).toBeGreaterThan(0);
  });
});

describe("table/subtitle writers", () => {
  it("renders records as SQL INSERTs", () => {
    const sql = recordsToSql([{ name: "Alice", age: "30" }], "people");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("INSERT INTO");
    expect(sql).toContain("'Alice'");
  });

  it("renders records as .properties", () => {
    const out = recordsToProperties([{ name: "Alice", age: "30" }]);
    expect(out).toContain("name=Alice");
    expect(out).toContain("age=30");
  });

  it("converts cues to ASS / SBV / TTML", () => {
    const cues = [
      { index: "1", start: "00:00:00,000", end: "00:00:01,000", text: "Hello" },
      { index: "2", start: "00:00:01,000", end: "00:00:02,000", text: "World" },
    ];
    expect(cuesToAss(cues)).toContain("[Events]");
    expect(cuesToSbv(cues)).toContain("Hello");
    expect(cuesToTtml(cues)).toContain("<tt");
  });
});

describe("matrix consistency", () => {
  it("has no duplicate targets per source", () => {
    for (const [source, targets] of Object.entries(MATRIX)) {
      expect(new Set(targets).size, `${source} has duplicate targets`).toBe(targets.length);
      for (const t of targets) {
        expect(TARGET_LABELS[t], `${t} missing label`).toBeTruthy();
      }
    }
  });

  it("advertises the new targets somewhere", () => {
    const all = new Set(Object.values(MATRIX).flat());
    for (const t of ["org", "textile", "mediawiki", "asciidoc", "htmlz", "txtz", "sql", "properties", "ini", "jsonl", "toml", "audio-voc"] as const) {
      expect(all.has(t), `${t} not advertised`).toBe(true);
    }
  });
});

describe("e2e dispatch through convertFile", () => {
  it("converts ssv → sql through the real dispatcher", async () => {
    const out = await convertFile({ bytes: toBytes("name;age\nAlice;30"), name: "data.ssv" }, "sql");
    expect(toText(out.bytes)).toContain("INSERT INTO");
    expect(toText(out.bytes)).toContain("Alice");
  });

  it("converts wav → voc through the real dispatcher", async () => {
    // Build a minimal WAV (44-byte header + 8-bit PCM).
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

    const out = await convertFile({ bytes: wav, name: "clip.wav" }, "audio-voc");
    expect(isVoc(out.bytes)).toBe(true);
  });

  it("converts html → org through the real dispatcher", async () => {
    const out = await convertFile({ bytes: toBytes("<h1>Title</h1><p>Hello</p>"), name: "doc.html" }, "org");
    expect(toText(out.bytes)).toContain("* Title");
  });

  it("converts vcf → fb2 through the real dispatcher", async () => {
    const vcf = "BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nEND:VCARD\n";
    const out = await convertFile({ bytes: toBytes(vcf), name: "contact.vcf" }, "fb2");
    expect(out.mime).toContain("fictionbook");
    const text = toText(out.bytes);
    expect(text).toContain("<FictionBook");
    expect(text).toContain("Jane Doe");
  });

  it("converts plist → mediawiki through the real dispatcher", async () => {
    const plist =
      '<?xml version="1.0"?><plist version="1.0"><dict><key>name</key><string>Alice</string></dict></plist>';
    const out = await convertFile({ bytes: toBytes(plist), name: "data.plist" }, "mediawiki");
    expect(toText(out.bytes)).toContain("* name");
    expect(toText(out.bytes)).toContain("Alice");
  });
});
