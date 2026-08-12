import { describe, it, expect } from "vitest";
import { encodeAu, parseAu } from "../src/core/converter/au";
import { MATRIX, targetsFor } from "../src/core/converter/matrix";
import {
  cuesToAss,
  cuesToSbv,
  cuesToTtml,
  htmlToOpml,
  jsonToIni,
  opmlToRecords,
  plistToRecords,
  recordsToProperties,
  recordsToSql
} from "../src/core/converter/documents";
import { detectFile } from "../src/core/converter/detect";

describe("Sun AU audio", () => {
  it("round-trips 16-bit PCM", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const bytes = encodeAu(44100, 2, samples);
    const parsed = parseAu(bytes);
    expect(parsed.sampleRate).toBe(44100);
    expect(parsed.channels).toBe(2);
    for (let i = 0; i < samples.length; i++) {
      expect(parsed.samples[i]!).toBeCloseTo(samples[i]!, 3);
    }
  });

  it("rejects non-AU bytes", () => {
    expect(() => parseAu(new TextEncoder().encode("RIFF....WAVE"))).toThrow(/AU/);
  });

  it("is detected by magic", () => {
    const bytes = encodeAu(22050, 1, new Float32Array([0, 0.1]));
    const det = detectFile(bytes, "audio");
    expect(det.type).toBe("audio-au");
  });
});

describe("OPML", () => {
  it("extracts headings into a nested outline", () => {
    const opml = htmlToOpml("<h1>One</h1><p>x</p><h2>Two</h2><h3>Three</h3><h2>Four</h2>", "Doc");
    expect(opml).toContain("<opml version=\"2.0\">");
    expect(opml).toContain("<outline text=\"One\"/>");
    expect(opml).toContain("<outline text=\"Two\"/>");
    expect(opml).toContain("<outline text=\"Three\"/>");
    // The h2 lines sit one indent level deeper than the h1 line.
    const lines = opml.split("\n");
    const one = lines.find((l) => l.includes('text="One"'))!;
    const two = lines.find((l) => l.includes('text="Two"'))!;
    const three = lines.find((l) => l.includes('text="Three"'))!;
    const indent = (l: string): number => l.length - l.trimStart().length;
    expect(indent(two) - indent(one)).toBe(4);
    expect(indent(three) - indent(two)).toBe(4);
  });

  it("round-trips OPML back to records", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>L</title></head>
  <body>
    <outline text="A"><outline text="A1" url="https://a/1"/></outline>
    <outline text="B" type="rss"/>
  </body>
</opml>`;
    const records = opmlToRecords(opml);
    expect(records.length).toBe(3);
    expect(records[0]!.title).toBe("A");
    expect(records[0]!.depth).toBe("0");
    expect(records[1]!.url).toBe("https://a/1");
    expect(records[1]!.depth).toBe("1");
    expect(records[2]!.type).toBe("rss");
  });

  it("is a matrix target for document sources", () => {
    expect(targetsFor("html")).toContain("opml");
    expect(targetsFor("docx")).toContain("opml");
    expect(targetsFor("pdf")).toContain("opml");
  });
});

describe("SQL / properties / INI writers", () => {
  const records = [
    { name: "Ada", age: "36" },
    { name: "Bob", age: "41" }
  ];

  it("writes a CREATE TABLE + INSERT per row", () => {
    const sql = recordsToSql(records, "people");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "people"');
    expect(sql).toContain("INSERT INTO");
    expect(sql.match(/INSERT INTO/g)!.length).toBe(2);
    expect(sql).toContain("'Ada'");
  });

  it("escapes quotes in SQL values", () => {
    const sql = recordsToSql([{ name: "O'Brien", age: "1" }], "t");
    expect(sql).toContain("'O''Brien'");
  });

  it("writes Java properties with escaping", () => {
    const props = recordsToProperties(records);
    expect(props).toContain("name=Ada");
    expect(props).toContain("age=36");
  });

  it("writes INI with sections for nested JSON", () => {
    const ini = jsonToIni(JSON.stringify({ server: { host: "x", port: 8080 } }));
    expect(ini).toContain("[server]");
    expect(ini).toContain("host = x");
    expect(ini).toContain("port = 8080");
  });

  it("are matrix targets for table sources", () => {
    expect(targetsFor("csv")).toContain("sql");
    expect(targetsFor("csv")).toContain("properties");
    expect(targetsFor("json")).toContain("ini");
    expect(targetsFor("vcf")).toContain("sql");
  });
});

describe("Subtitle writers", () => {
  const cues = [
    { index: "1", start: "00:00:01,000", end: "00:00:02,500", text: "Hello" },
    { index: "2", start: "00:00:03,000", end: "00:00:04,000", text: "World" }
  ];

  it("writes ASS with Dialogue lines", () => {
    const ass = cuesToAss(cues);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("[Events]");
    expect(ass).toContain("Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Hello");
  });

  it("writes YouTube SBV", () => {
    const sbv = cuesToSbv(cues);
    expect(sbv).toContain("00:00:01.000,00:00:02.500");
    expect(sbv).toContain("Hello");
  });

  it("writes TTML with begin/end", () => {
    const ttml = cuesToTtml(cues);
    expect(ttml).toContain("<tt xmlns=\"http://www.w3.org/ns/ttml\"");
    expect(ttml).toContain('begin="00:00:01.000"');
    expect(ttml).toContain(">Hello</p>");
  });

  it("are matrix targets for subtitle sources", () => {
    expect(targetsFor("srt")).toContain("ass");
    expect(targetsFor("vtt")).toContain("sbv");
    expect(targetsFor("lrc")).toContain("ttml");
  });
});

describe("plist parser", () => {
  it("parses a dict into a record", () => {
    const plist = `<?xml version="1.0"?>
<plist version="1.0"><dict>
  <key>name</key><string>Ada</string>
  <key>count</key><integer>3</integer>
  <key>ok</key><true/>
  <key>ratio</key><real>1.5</real>
</dict></plist>`;
    const records = plistToRecords(plist);
    expect(records.length).toBe(1);
    expect(records[0]!.name).toBe("Ada");
    expect(records[0]!.count).toBe("3");
    expect(records[0]!.ok).toBe("true");
    expect(records[0]!.ratio).toBe("1.5");
  });

  it("parses an array of dicts into multiple records", () => {
    const plist = `<plist version="1.0"><array>
      <dict><key>k</key><string>1</string></dict>
      <dict><key>k</key><string>2</string></dict>
    </array></plist>`;
    const records = plistToRecords(plist);
    expect(records.length).toBe(2);
  });

  it("throws on a plist with no dicts", () => {
    expect(() => plistToRecords("<plist><string>x</string></plist>")).toThrow(/dict/);
  });

  it("is a detected source with table targets", () => {
    expect(targetsFor("plist")).toContain("csv");
    expect(targetsFor("plist")).toContain("json");
    expect(targetsFor("opml")).toContain("xlsx");
  });
});

describe("matrix consistency", () => {
  it("has no duplicate targets per source", () => {
    for (const [source, targets] of Object.entries(MATRIX)) {
      const seen = new Set<string>();
      for (const t of targets) {
        expect(seen.has(t), `${source} lists ${t} twice`).toBe(false);
        seen.add(t);
      }
    }
  });

  it("has no self-targets (image re-encodes excepted)", () => {
    // image-png → image-png & co. are intentional re-encodes through the
    // canvas pipeline (same as tiff → tiff) — a real conversion, not a
    // no-op. Everything else must never list itself.
    const reencode = new Set(["image-png", "image-jpeg", "image-webp", "image-gif", "image-bmp", "image-avif", "image-tiff", "image-svg", "image-qoi", "image-farbfeld", "image-pcx", "audio-wav", "audio-aiff", "audio-au", "audio-voc", "audio-ogg", "audio-mp3", "audio-mp4", "audio-flac", "audio-midi", "video-mp4", "video-webm", "video-mov"]);
    for (const [source, targets] of Object.entries(MATRIX)) {
      if (reencode.has(source)) continue;
      expect(targets, `${source} must not list itself`).not.toContain(source);
    }
  });

  it("every image source can reach the new codecs", () => {
    for (const s of ["image-png", "image-tiff", "image-pbm", "raw-cr2", "eps"] as const) {
      expect(targetsFor(s)).toContain("image-qoi");
      expect(targetsFor(s)).toContain("image-farbfeld");
      expect(targetsFor(s)).toContain("image-pcx");
    }
  });

  it("new image sources reach the raster pipeline", () => {
    expect(targetsFor("image-qoi")).toContain("image-png");
    expect(targetsFor("image-farbfeld")).toContain("image-jpeg");
    expect(targetsFor("image-pcx")).toContain("image-bmp");
  });
});
