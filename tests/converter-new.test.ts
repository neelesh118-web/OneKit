// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { detectFromBytes, detectFile } from "../src/core/converter/detect";
import { targetsFor } from "../src/core/converter/matrix";
import { samplesToWav } from "../src/core/converter/audio";
import { icoFromPng } from "../src/core/converter/images";
import { unzipSync, strFromU8 } from "fflate/browser";
import { csvToXlsx, epubToHtml } from "../src/core/converter/documents";
import { PDFDocument, StandardFonts } from "pdf-lib";

const encoder = new TextEncoder();
const toBytes = (s: string): Uint8Array => encoder.encode(s);

describe("new converter pairs", () => {
  it("text → DOCX produces a valid OOXML package", async () => {
    const result = await convertFile({ bytes: toBytes("Line one\nLine two"), name: "notes.txt" }, "docx");
    expect(result.name).toBe("notes.docx");
    expect(result.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    const files = unzipSync(result.bytes);
    const doc = strFromU8(files["word/document.xml"]!);
    expect(doc).toContain("Line one");
    expect(doc).toContain("Line two");
  });

  it("markdown → DOCX renders headings to paragraphs", async () => {
    const result = await convertFile(
      { bytes: toBytes("# Hello\n\nSome **bold** body."), name: "page.md" },
      "docx"
    );
    const doc = strFromU8(unzipSync(result.bytes)["word/document.xml"]!);
    expect(doc).toContain("Hello");
    expect(doc).toContain("bold");
  });

  it("html → DOCX flattens to text", async () => {
    const result = await convertFile(
      {
        bytes: toBytes("<!doctype html><html><body><h1>Title</h1><p>Body <b>here</b>.</p></body></html>"),
        name: "page.html"
      },
      "docx"
    );
    const doc = strFromU8(unzipSync(result.bytes)["word/document.xml"]!);
    expect(doc).toContain("Title");
    expect(doc).toContain("Body here");
  });

  it("csv → HTML table", async () => {
    const result = await convertFile({ bytes: toBytes("name,age\nAna,30\nBob,25"), name: "data.csv" }, "html");
    const html = new TextDecoder().decode(result.bytes);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>name</th>");
    expect(html).toContain("<td>Ana</td>");
  });

  it("json → HTML table", async () => {
    const result = await convertFile(
      { bytes: toBytes('[{"a":1,"b":"x"},{"a":2,"b":"y"}]'), name: "data.json" },
      "html"
    );
    const html = new TextDecoder().decode(result.bytes);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("xlsx → HTML table (first sheet)", async () => {
    // Build a real workbook with the vendored xlsx (avoids the CSV→PRN quirk).
    const { default: XLSX } = await import("../src/vendor/xlsx.mjs");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["name", "age"], ["Ana", 30], ["Bob", 25]]),
      "Sheet1"
    );
    const xlsx = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
    const { xlsxToHtml } = await import("../src/core/converter/documents");
    const html = await xlsxToHtml(xlsx);
    expect(html).toContain("<table>");
    expect(html).toContain("Ana");
  });

  it("pdf → DOCX extracts the text into a Word file (text-based)", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([300, 300]);
    page.drawText("Editable text from PDF", { x: 40, y: 260, size: 12, font });
    const pdf = await doc.save();
    const result = await convertFile({ bytes: pdf, name: "report.pdf" }, "docx");
    expect(result.name).toBe("report.docx");
    const word = strFromU8(unzipSync(result.bytes)["word/document.xml"]!);
    expect(word).toContain("Editable text from PDF");
  });

  it("json → PDF", async () => {
    const result = await convertFile({ bytes: toBytes('{"a":1,"b":2}'), name: "data.json" }, "pdf");
    expect(result.name).toBe("data.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(result.bytes[0]).toBe(0x25); // %PDF magic
  });

  it("tsv → csv (tab delimiters swapped)", async () => {
    const result = await convertFile({ bytes: toBytes("name\tage\nAna\t30"), name: "data.tsv" }, "csv");
    expect(result.name).toBe("data.csv");
    expect(new TextDecoder().decode(result.bytes)).toBe("name,age\nAna,30");
  });

  it("tsv → json", async () => {
    const result = await convertFile({ bytes: toBytes("name\tage\nAna\t30"), name: "data.tsv" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes)) as Array<Record<string, string>>;
    expect(parsed[0]!.name).toBe("Ana");
    expect(parsed[0]!.age).toBe("30");
  });

  it("video → JPEG grabs the first frame (fake extractor + canvas)", async () => {
    const frames = [
      { width: 4, height: 2, delayMs: 100, data: new Uint8ClampedArray(4 * 2 * 4) }
    ];
    let captured: Uint8ClampedArray | null = null;
    const ctx = {
      createImageData(w: number, h: number) {
        return { data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img: { data: Uint8ClampedArray }) {
        captured = img.data;
      }
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: (k: string) => (k === "2d" ? ctx : null),
      toBlob(cb: (b: Blob | null) => void): void {
        cb(new Blob([new Uint8Array([1, 2, 3])]));
      }
    };
    const origDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { createElement: () => canvas };
    try {
      const result = await convertFile(
        { bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0]), name: "clip.webm" },
        "image-jpeg",
        { videoFrames: async () => frames as never }
      );
      expect(result.name).toBe("clip.jpg");
      expect(result.mime).toBe("image/jpeg");
      expect(captured).not.toBeNull();
      expect(canvas.width).toBe(4);
      expect(canvas.height).toBe(2);
    } finally {
      (globalThis as { document?: unknown }).document = origDoc;
    }
  });

  it("markdown → EPUB is a valid package our own reader can open", async () => {
    const result = await convertFile(
      { bytes: toBytes("# Chapter One\n\nSome body text."), name: "book.md" },
      "epub"
    );
    expect(result.name).toBe("book.epub");
    expect(result.mime).toBe("application/epub+zip");
    const files = unzipSync(result.bytes);
    expect(strFromU8(files["mimetype"]!)).toBe("application/epub+zip");
    expect(files["META-INF/container.xml"]).toBeDefined();
    expect(files["OEBPS/chapter-01.xhtml"]).toBeDefined();
    // Round-trip through our own EPUB reader.
    const { epubToHtml } = await import("../src/core/converter/documents");
    const html = epubToHtml(result.bytes);
    expect(html).toContain("Chapter One");
    expect(html).toContain("Some body text");
  });

  it("ini → json nests sections", async () => {
    const result = await convertFile(
      { bytes: toBytes("[server]\nport = 8080\nhost = \"localhost\"\n; comment\n# another\n[log]\nlevel = debug"), name: "app.ini" },
      "json"
    );
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes)) as Record<string, Record<string, string>>;
    expect(parsed.server!.port).toBe("8080");
    expect(parsed.server!.host).toBe("localhost");
    expect(parsed.log!.level).toBe("debug");
  });

  it("video → MP3 routes to the audio extractor (honest error without a browser)", async () => {
    const origDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = undefined;
    try {
      // No <video> element in this environment → the extractor throws honestly.
      await expect(
        convertFile({ bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0]), name: "clip.webm" }, "audio-mp3")
      ).rejects.toThrow(/browser <video>/);
    } finally {
      (globalThis as { document?: unknown }).document = origDoc;
    }
  });

  it("epub → DOCX reuses the HTML pipeline", async () => {
    const { epubFromHtml } = await import("../src/core/converter/documents");
    const epub = epubFromHtml("Book", "<h1>Chapter</h1><p>Some text</p>");
    const result = await convertFile({ bytes: epub, name: "book.epub" }, "docx");
    expect(result.name).toBe("book.docx");
    const doc = strFromU8(unzipSync(result.bytes)["word/document.xml"]!);
    expect(doc).toContain("Chapter");
    expect(doc).toContain("Some text");
  });

  it("docx → EPUB produces a readable package", async () => {
    const { epubFromHtml } = await import("../src/core/converter/documents");
    // Build a DOCX with our own writer, then convert it back to EPUB.
    const epub = epubFromHtml("Book", "<p>Source</p>");
    const { buildDocx } = await import("../src/core/converter/documents");
    const docx = buildDocx(["Line one", "Line two"]);
    const result = await convertFile({ bytes: docx, name: "notes.docx" }, "epub");
    expect(result.name).toBe("notes.epub");
    expect(strFromU8(unzipSync(result.bytes)["mimetype"]!)).toBe("application/epub+zip");
    const html = epubToHtml(result.bytes);
    expect(html).toContain("Line one");
  });

  it("json → xlsx via CSV", async () => {
    const result = await convertFile(
      { bytes: toBytes('[{"name":"Ana","age":30}]'), name: "data.json" },
      "xlsx"
    );
    expect(result.name).toBe("data.xlsx");
    expect(result.mime).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("text → html wraps in a pre block", async () => {
    const result = await convertFile({ bytes: toBytes("a < b & c"), name: "note.txt" }, "html");
    const html = new TextDecoder().decode(result.bytes);
    expect(html).toContain("<pre>");
    expect(html).toContain("a &lt; b &amp; c"); // escaped, not raw
  });

  it("tsv → xlsx produces a real workbook (not HTML)", async () => {
    const result = await convertFile({ bytes: toBytes("name\tage\nAna\t30"), name: "data.tsv" }, "xlsx");
    expect(result.name).toBe("data.xlsx");
    // Must start with a ZIP magic — catches the HTML-bytes regression.
    expect(result.bytes[0]).toBe(0x50);
    expect(result.bytes[1]).toBe(0x4b);
  });

  it("tsv → pdf", async () => {
    const result = await convertFile({ bytes: toBytes("a\tb\n1\t2"), name: "data.tsv" }, "pdf");
    expect(result.name).toBe("data.pdf");
    expect(result.bytes[0]).toBe(0x25);
  });

  it("svg → pdf rasterizes through the image pipeline (fake canvas)", async () => {
    // A real 1x1 PNG so pdf-lib can embed it.
    const bin = atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    );
    const tinyPng = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) tinyPng[i] = bin.charCodeAt(i);
    const pngBlob = new Blob([tinyPng]);
    const ctx = { drawImage(): void {}, translate(): void {}, rotate(): void {}, scale(): void {} };
    let w = 0;
    let h = 0;
    const deps = {
      canvasFactory: () =>
        ({
          get width() { return w; },
          set width(v: number) { w = v; },
          get height() { return h; },
          set height(v: number) { h = v; },
          getContext: (k: string) => (k === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void, mime?: string): void {
            cb(mime === "image/png" ? pngBlob : null);
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 16, height: 16, close(): void {} }) as unknown as ImageBitmap
    };
    const result = await convertFile(
      { bytes: toBytes("<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect width='16' height='16' fill='red'/></svg>"), name: "shape.svg" },
      "pdf",
      { canvas: deps }
    );
    expect(result.name).toBe("shape.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(result.bytes[0]).toBe(0x25); // %PDF
  });

  it("yaml → xml", async () => {
    const result = await convertFile({ bytes: toBytes("name: Ana\nage: 30"), name: "data.yaml" }, "xml");
    const xml = new TextDecoder().decode(result.bytes);
    expect(xml).toContain("<name>Ana</name>");
  });

  it("xml → yaml", async () => {
    const result = await convertFile(
      { bytes: toBytes("<root><name>Ana</name></root>"), name: "data.xml" },
      "yaml"
    );
    const yamlText = new TextDecoder().decode(result.bytes);
    expect(yamlText.toLowerCase()).toContain("ana");
  });

  it("yaml → csv (via JSON)", async () => {
    const result = await convertFile(
      { bytes: toBytes("- name: Ana\n  age: 30\n- name: Bob\n  age: 25"), name: "data.yaml" },
      "csv"
    );
    const csv = new TextDecoder().decode(result.bytes);
    expect(csv).toContain("name,age");
    expect(csv).toContain("Ana,30");
  });

  it("yaml → html table", async () => {
    const result = await convertFile(
      { bytes: toBytes("- name: Ana\n  age: 30"), name: "data.yaml" },
      "html"
    );
    expect(new TextDecoder().decode(result.bytes)).toContain("<table>");
  });

  it("ini → yaml and ini → xml", async () => {
    const ini = "[server]\nport = 8080";
    const y = await convertFile({ bytes: toBytes(ini), name: "app.ini" }, "yaml");
    expect(new TextDecoder().decode(y.bytes).toLowerCase()).toContain("server:");
    const x = await convertFile({ bytes: toBytes(ini), name: "app.ini" }, "xml");
    expect(new TextDecoder().decode(x.bytes)).toContain("<server>");
  });

  it("csv → yaml and csv → xml", async () => {
    const csv = "name,age\nAna,30";
    const y = await convertFile({ bytes: toBytes(csv), name: "d.csv" }, "yaml");
    expect(new TextDecoder().decode(y.bytes).toLowerCase()).toContain("name: ana");
    const x = await convertFile({ bytes: toBytes(csv), name: "d.csv" }, "xml");
    expect(new TextDecoder().decode(x.bytes)).toContain("<name>Ana</name>");
  });

  it("tsv → yaml", async () => {
    const result = await convertFile({ bytes: toBytes("name\tage\nAna\t30"), name: "d.tsv" }, "yaml");
    expect(new TextDecoder().decode(result.bytes).toLowerCase()).toContain("name: ana");
  });

  it("text → markdown is a passthrough", async () => {
    const result = await convertFile({ bytes: toBytes("plain lines"), name: "note.txt" }, "markdown");
    expect(new TextDecoder().decode(result.bytes)).toBe("plain lines");
  });

  it("yaml → xlsx (list of maps)", async () => {
    const result = await convertFile(
      { bytes: toBytes("- name: Ana\n  age: 30"), name: "data.yaml" },
      "xlsx"
    );
    expect(result.name).toBe("data.xlsx");
    expect(result.bytes[0]).toBe(0x50); // ZIP magic
    expect(result.bytes[1]).toBe(0x4b);
  });

  it("json → docx", async () => {
    const result = await convertFile({ bytes: toBytes('{"a":1}'), name: "data.json" }, "docx");
    const doc = strFromU8(unzipSync(result.bytes)["word/document.xml"]!);
    expect(doc).toContain("a");
  });

  it("base64 text → pdf (decode then render)", async () => {
    const b64 = "aGVsbG8gd29ybGQ="; // "hello world"
    const result = await convertFile({ bytes: toBytes(b64), name: "data.b64" }, "pdf");
    expect(result.name).toBe("data.pdf");
    expect(result.bytes[0]).toBe(0x25); // %PDF
  });

  it("vcf → csv extracts contacts", async () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:Ana Silva", "TEL;TYPE=CELL:555-0100", "EMAIL:ana@x.com", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:Bob Jones", "TEL;TYPE=CELL:555-0101", "END:VCARD"
    ].join("\n");
    const result = await convertFile({ bytes: toBytes(vcf), name: "contacts.vcf" }, "csv");
    const csv = new TextDecoder().decode(result.bytes);
    expect(csv).toContain("Ana Silva");
    expect(csv).toContain("555-0101");
  });

  it("vcf → json", async () => {
    const vcf = "BEGIN:VCARD\nFN:Ana Silva\nEND:VCARD";
    const result = await convertFile({ bytes: toBytes(vcf), name: "c.vcf" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes)) as Array<Record<string, string>>;
    expect(parsed[0]!.FN).toBe("Ana Silva");
  });

  it("ics → csv extracts events", async () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Team standup", "DTSTART:20260101T090000Z", "LOCATION:Zoom", "END:VEVENT", "END:VCALENDAR"
    ].join("\n");
    const result = await convertFile({ bytes: toBytes(ics), name: "cal.ics" }, "csv");
    const csv = new TextDecoder().decode(result.bytes);
    expect(csv).toContain("Team standup");
  });

  it("srt → vtt converts timestamps and adds the WEBVTT header", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\nBye now";
    const result = await convertFile({ bytes: toBytes(srt), name: "sub.srt" }, "vtt");
    const vtt = new TextDecoder().decode(result.bytes);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.500");
    expect(vtt).toContain("Hello there");
    expect(vtt).not.toMatch(/\n1\n/); // cue numbers dropped
  });

  it("vtt → srt round-trips timestamps and numbers cues", async () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello there";
    const result = await convertFile({ bytes: toBytes(vtt), name: "sub.vtt" }, "srt");
    const srt = new TextDecoder().decode(result.bytes);
    expect(srt).toContain("1\n");
    expect(srt).toContain("00:00:01,000 --> 00:00:02,500");
    expect(srt).toContain("Hello there");
  });

  it("srt → text keeps only the dialogue", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello there";
    const result = await convertFile({ bytes: toBytes(srt), name: "sub.srt" }, "text");
    expect(new TextDecoder().decode(result.bytes)).toBe("Hello there");
  });

  it("binary file → base64 text round-trips the raw bytes", async () => {
    const raw = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const result = await convertFile({ bytes: raw, name: "img.png" }, "txt-base64");
    expect(result.name).toBe("img.txt");
    const b64 = new TextDecoder().decode(result.bytes);
    // Decode back and compare byte-for-byte.
    const bin = atob(b64);
    const back = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) back[i] = bin.charCodeAt(i);
    expect(Array.from(back)).toEqual(Array.from(raw));
  });

  it("binary file → hex text", async () => {
    const result = await convertFile(
      { bytes: new Uint8Array([0xde, 0xad, 0xbe, 0xef]), name: "data.zip" },
      "txt-hex"
    );
    expect(new TextDecoder().decode(result.bytes)).toBe("deadbeef");
  });

  it("gpx → csv extracts track points", async () => {
    const gpx =
      '<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>' +
      '<trkpt lat="51.5" lon="-0.1"><ele>10</ele><time>2026-01-01T00:00:00Z</time></trkpt>' +
      '<trkpt lat="51.6" lon="-0.2"><ele>20</ele></trkpt>' +
      "</trkseg></trk></gpx>";
    const result = await convertFile({ bytes: toBytes(gpx), name: "track.gpx" }, "csv");
    const csv = new TextDecoder().decode(result.bytes);
    expect(csv).toContain("lat,lon,ele,time");
    expect(csv).toContain("51.5");
    expect(csv).toContain("51.6");
  });

  it("lrc → srt converts lyric timestamps to cues", async () => {
    const lrc = "[00:01.00]First line\n[00:03.50]Second line";
    const result = await convertFile({ bytes: toBytes(lrc), name: "song.lrc" }, "srt");
    const srt = new TextDecoder().decode(result.bytes);
    expect(srt).toContain("00:00:01,000 --> 00:00:03,500");
    expect(srt).toContain("First line");
    expect(srt).toContain("Second line");
  });

  it("lrc → text keeps only lyrics", async () => {
    const result = await convertFile(
      { bytes: toBytes("[00:01.00]Hello"), name: "song.lrc" },
      "text"
    );
    expect(new TextDecoder().decode(result.bytes)).toBe("Hello");
  });

  it("sitemap.xml → csv extracts URLs", async () => {
    const xml =
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      "<url><loc>https://a.com/</loc><lastmod>2026-01-01</lastmod></url>" +
      "<url><loc>https://a.com/about</loc></url></urlset>";
    const result = await convertFile({ bytes: toBytes(xml), name: "sitemap.xml" }, "csv");
    const csv = new TextDecoder().decode(result.bytes);
    expect(csv).toContain("https://a.com/");
    expect(csv).toContain("https://a.com/about");
  });

  it("rss feed → json extracts items", async () => {
    const rss =
      '<rss version="2.0"><channel><item><title>Post one</title><link>https://a.com/1</link></item>' +
      '<item><title>Post two</title></item></channel></rss>';
    const result = await convertFile({ bytes: toBytes(rss), name: "feed.xml" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes)) as Array<Record<string, string>>;
    expect(parsed[0]!.title).toBe("Post one");
    expect(parsed[1]!.title).toBe("Post two");
  });

  it("csv → markdown table", async () => {
    const result = await convertFile({ bytes: toBytes("name,age\nAna,30"), name: "d.csv" }, "markdown");
    const md = new TextDecoder().decode(result.bytes);
    expect(md).toContain("| name | age |");
    expect(md).toContain("| Ana | 30 |");
    expect(md).toContain("| --- | --- |");
  });

  it("csv → base64 text encodes raw bytes", async () => {
    const result = await convertFile({ bytes: toBytes("a,b\n1,2"), name: "d.csv" }, "txt-base64");
    const b64 = new TextDecoder().decode(result.bytes);
    expect(b64).toBe("YSxiCjEsMg==");
  });

  it("base64 text → plain text", async () => {
    const b64 = "aGVsbG8gd29ybGQ="; // base64 of "hello world"
    const result = await convertFile({ bytes: toBytes(b64), name: "data.b64" }, "text");
    expect(new TextDecoder().decode(result.bytes)).toBe("hello world");
  });

  it("hex text → plain text", async () => {
    const result = await convertFile({ bytes: toBytes("68656c6c6f"), name: "data.hex" }, "text");
    expect(new TextDecoder().decode(result.bytes)).toBe("hello");
  });

  it("url-encoded text → plain text", async () => {
    const result = await convertFile({ bytes: toBytes("hello%20world"), name: "data.uri" }, "text");
    expect(new TextDecoder().decode(result.bytes)).toBe("hello world");
  });

  it("wav → FLAC writes a valid fLaC stream", async () => {
    const rate = 8000;
    const samples = new Float32Array(rate);
    for (let i = 0; i < rate; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3;
    const wav = samplesToWav(rate, 1, samples);
    const result = await convertFile({ bytes: wav, name: "tone.wav" }, "audio-flac");
    expect(result.name).toBe("tone.flac");
    expect(result.mime).toBe("audio/flac");
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe("fLaC");
  });

  it("image → ICO wraps a PNG payload with the icon header", async () => {
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
    const ico = icoFromPng(fakePng, 128);
    // ICONDIR: reserved 0, type 1, count 1
    expect(ico[0]).toBe(0);
    expect(ico[1]).toBe(0);
    expect(ico[2]).toBe(1);
    expect(ico[3]).toBe(0);
    expect(ico[4]).toBe(1);
    expect(ico[5]).toBe(0);
    // Entry width/height = 128
    expect(ico[6]).toBe(128);
    expect(ico[7]).toBe(128);
    // Payload offset = 22, size = png length
    expect((ico[18]! | (ico[19]! << 8) | (ico[20]! << 16) | (ico[21]! << 24))).toBe(22);
    // PNG payload follows the header intact.
    expect(ico[22]).toBe(0x89);
    expect(ico[22 + 8]).toBe(9);
  });

  it("image → ICO via the orchestrator (fake canvas)", async () => {
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 1, 1])]);
    const ctx = { drawImage(): void {}, translate(): void {}, rotate(): void {}, scale(): void {} };
    let w = 0;
    let h = 0;
    const deps = {
      canvasFactory: () =>
        ({
          get width() { return w; },
          set width(v: number) { w = v; },
          get height() { return h; },
          set height(v: number) { h = v; },
          getContext: (k: string) => (k === "2d" ? ctx : null),
          toBlob(cb: (b: Blob | null) => void, mime?: string): void {
            cb(mime === "image/png" ? pngBlob : null);
          }
        }) as unknown as HTMLCanvasElement,
      decode: async () => ({ width: 64, height: 64, close(): void {} }) as unknown as ImageBitmap
    };
    const result = await convertFile(
      { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]), name: "logo.png" },
      "image-ico",
      { canvas: deps }
    );
    expect(result.name).toBe("logo.ico");
    expect(result.mime).toBe("image/x-icon");
    // ICO header + PNG payload.
    expect(result.bytes[2]).toBe(1); // type icon
    expect(result.bytes[6]).toBe(64); // width entry
    expect(String.fromCharCode(...result.bytes.slice(22, 26))).toBe("\u0089PNG");
  });
});

describe("new detection + matrix", () => {
  it("detects OTF fonts by magic bytes", () => {
    expect(detectFromBytes(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0]), "unknown")).toBe("font-otf");
    expect(targetsFor("font-otf")).toContain("font-woff");
  });

  it("detects encoded-text sources by extension", () => {
    expect(detectFile(new Uint8Array([0x61, 0x62, 0x63]), "data.b64").type).toBe("text-base64");
    expect(detectFile(new Uint8Array([0x61, 0x62, 0x63]), "data.hex").type).toBe("text-hex");
    expect(detectFile(new Uint8Array([0x61, 0x62, 0x63]), "data.uri").type).toBe("text-url");
  });

  it("offers the new targets in the matrix", () => {
    expect(targetsFor("text")).toContain("docx");
    expect(targetsFor("markdown")).toContain("docx");
    expect(targetsFor("html")).toContain("docx");
    expect(targetsFor("csv")).toContain("html");
    expect(targetsFor("json")).toContain("html");
    expect(targetsFor("json")).toContain("pdf");
    expect(targetsFor("tsv")).toContain("csv");
    expect(targetsFor("html")).toContain("epub");
    expect(targetsFor("markdown")).toContain("epub");
    expect(targetsFor("epub")).toContain("docx");
    expect(targetsFor("docx")).toContain("epub");
    expect(targetsFor("text")).toContain("html");
    expect(targetsFor("json")).toContain("xlsx");
    expect(targetsFor("json")).toContain("docx");
    expect(targetsFor("yaml")).toContain("xlsx");
    expect(targetsFor("text-base64")).toContain("pdf");
    expect(targetsFor("vcf")).toContain("csv");
    expect(targetsFor("ics")).toContain("json");
    expect(targetsFor("gpx")).toContain("csv");
    expect(targetsFor("lrc")).toContain("srt");
    expect(targetsFor("sitemap")).toContain("csv");
    expect(targetsFor("rss")).toContain("json");
    expect(targetsFor("csv")).toContain("markdown");
    expect(targetsFor("csv")).toContain("txt-base64");
    expect(targetsFor("image-png")).toContain("txt-base64");
    expect(targetsFor("pdf")).toContain("txt-hex");
    expect(targetsFor("audio-mp3")).toContain("txt-base64");
    expect(targetsFor("video-mp4")).toContain("txt-hex");
    expect(targetsFor("srt")).toContain("vtt");
    expect(targetsFor("vtt")).toContain("srt");
    expect(targetsFor("tsv")).toContain("xlsx");
    expect(targetsFor("tsv")).toContain("pdf");
    expect(targetsFor("image-svg")).toContain("pdf");
    expect(targetsFor("image-svg")).toContain("image-ico");
    expect(targetsFor("yaml")).toContain("xml");
    expect(targetsFor("yaml")).toContain("csv");
    expect(targetsFor("ini")).toContain("yaml");
    expect(targetsFor("csv")).toContain("yaml");
    expect(targetsFor("tsv")).toContain("xml");
    expect(targetsFor("text")).toContain("markdown");
    expect(targetsFor("xml")).toContain("yaml");
    expect(targetsFor("ini")).toContain("json");
    expect(targetsFor("video-webm")).toContain("image-jpeg");
    expect(targetsFor("video-mp4")).toContain("audio-mp3");
    expect(targetsFor("video-mp4")).toContain("audio-wav");
    expect(targetsFor("xlsx")).toContain("html");
    expect(targetsFor("pdf")).toContain("docx");
    expect(targetsFor("audio-wav")).toContain("audio-flac");
    expect(targetsFor("video-mp4")).toContain("video-webm");
    expect(targetsFor("video-mp4")).toContain("video-mp4");
    expect(targetsFor("image-png")).toContain("image-ico");
    expect(targetsFor("kml")).toContain("gpx");
    expect(targetsFor("gpx")).toContain("kml");
    expect(targetsFor("kml")).toContain("csv");
    expect(targetsFor("bookmarks")).toContain("json");
    expect(targetsFor("bookmarks")).toContain("markdown");
    expect(targetsFor("srt")).toContain("csv");
    expect(targetsFor("vtt")).toContain("json");
    expect(targetsFor("lrc")).toContain("csv");
    expect(targetsFor("ics")).toContain("text");
    expect(targetsFor("vcf")).toContain("text");
    expect(targetsFor("text")).toContain("epub");
    expect(targetsFor("csv")).toContain("docx");
    expect(targetsFor("tsv")).toContain("docx");
    expect(targetsFor("yaml")).toContain("docx");
    expect(targetsFor("rss")).toContain("markdown");
    expect(targetsFor("sitemap")).toContain("markdown");
  });

  it("detects KML by extension and sniffing, bookmarks by header", () => {
    const kml = toBytes(`<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Home</name><Point><coordinates>-122.1,37.4</coordinates></Point></Placemark></kml>`);
    expect(detectFile(kml, "map.kml").type).toBe("kml");
    // An .xml-named KML is promoted by content sniffing.
    expect(detectFile(kml, "map.xml").type).toBe("kml");
    const bookmarks = toBytes(
      `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<HTML><H1>Bookmarks</H1>\n<DT><H3>Work</H3>\n<DT><A HREF="https://example.com" ADD_DATE="1700000000">Example</A>\n</HTML>`
    );
    expect(detectFile(bookmarks, "bookmarks.html").type).toBe("bookmarks");
    // A plain .html file must still detect as html (no false promotion).
    expect(detectFile(toBytes("<!doctype html><html><body>Hi</body></html>"), "page.html").type).toBe("html");
  });

  it("KML → GPX round-trips waypoint coordinates", async () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Home</name><Point><coordinates>-122.1,37.4</coordinates></Point></Placemark><Placemark><name>Office</name><Point><coordinates>-122.2,37.5</coordinates></Point></Placemark></Document></kml>`;
    const gpxResult = await convertFile({ bytes: toBytes(kml), name: "map.kml" }, "gpx");
    const gpxText = new TextDecoder().decode(gpxResult.bytes);
    expect(gpxText).toContain('<wpt lat="37.4" lon="-122.1">');
    expect(gpxText).toContain('<wpt lat="37.5" lon="-122.2">');
    // Back to KML.
    const back = await convertFile({ bytes: toBytes(gpxText), name: "map.gpx" }, "kml");
    const backText = new TextDecoder().decode(back.bytes);
    expect(backText).toContain("<kml");
    expect(backText).toContain("-122.1,37.4");
  });

  it("bookmarks → CSV/JSON extracts links with folders", async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><HTML><H1>Bookmarks</H1><DT><H3>Work</H3><DT><A HREF="https://example.com" ADD_DATE="1700000000">Example</A></HTML>`;
    const csv = await convertFile({ bytes: toBytes(html), name: "bookmarks.html" }, "csv");
    const csvText = new TextDecoder().decode(csv.bytes);
    expect(csvText).toContain("https://example.com");
    expect(csvText).toContain("Example");
    const json = await convertFile({ bytes: toBytes(html), name: "bookmarks.html" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed[0].url).toBe("https://example.com");
    expect(parsed[0].folder).toBe("Work");
  });

  it("SRT/VTT → CSV/JSON produces structured cues", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nHello there\n\n2\n00:00:03,000 --> 00:00:04,500\nSecond line\n";
    const json = await convertFile({ bytes: toBytes(srt), name: "sub.srt" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].start).toContain("00:00:01");
    expect(parsed[1].text).toBe("Second line");
    const csv = await convertFile({ bytes: toBytes(srt), name: "sub.srt" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("Second line");
  });

  it("text → EPUB and CSV → DOCX produce real containers", async () => {
    const epub = await convertFile({ bytes: toBytes("Just some text."), name: "notes.txt" }, "epub");
    const files = unzipSync(epub.bytes);
    expect(files["mimetype"]).toBeTruthy();
    expect(epubToHtml(epub.bytes)).toContain("Just some text.");
    const docx = await convertFile({ bytes: toBytes("name,city\nAna,Rome"), name: "data.csv" }, "docx");
    expect(docx.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    const docxFiles = unzipSync(docx.bytes);
    const documentXml = strFromU8(docxFiles["word/document.xml"] ?? new Uint8Array());
    expect(documentXml).toContain("Ana");
    expect(documentXml).toContain("Rome");
  });

  it("rss → markdown and gpx → text stay honest", async () => {
    const rss = '<rss version="2.0"><channel><title>News</title><item><title>Post one</title><link>https://a.com/1</link></item></channel></rss>';
    const md = await convertFile({ bytes: toBytes(rss), name: "feed.xml" }, "markdown");
    const mdText = new TextDecoder().decode(md.bytes);
    expect(mdText).toContain("Post one");
    expect(mdText).toContain("|"); // markdown table syntax
    const gpx = '<gpx version="1.1"><trk><trkseg><trkpt lat="1.5" lon="2.5"></trkpt></trkseg></trk></gpx>';
    const txt = await convertFile({ bytes: toBytes(gpx), name: "track.gpx" }, "text");
    expect(new TextDecoder().decode(txt.bytes)).toContain("lat: 1.5");
  });

  it("unsupported kml → audio errors honestly", async () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Point><coordinates>-122.1,37.4</coordinates></Point></Placemark></kml>`;
    await expect(convertFile({ bytes: toBytes(kml), name: "map.kml" }, "audio-mp3")).rejects.toThrow(
      /isn't supported/
    );
  });

  it("detects BibTeX by extension/sniff and JSONL by extension/multi-line", () => {
    const bib = `@article{smith2020,\n  title = {A {Nested} Title},\n  author = {Smith, J.},\n  year = {2020}\n}`;
    expect(detectFile(toBytes(bib), "refs.bib").type).toBe("bibtex");
    expect(detectFile(toBytes(bib), "refs.txt").type).toBe("bibtex");
    const jsonl = `{"name": "Ana", "city": "Rome"}\n{"name": "Ben", "city": "Paris"}`;
    expect(detectFile(toBytes(jsonl), "data.ndjson").type).toBe("jsonl");
    // A single-line JSON object must stay plain json, not jsonl.
    expect(detectFile(toBytes('{"name": "Ana"}'), "data.json").type).toBe("json");
  });

  it("BibTeX → CSV/JSON keeps nested-brace titles intact", async () => {
    const bib = `@article{smith2020,\n  title = {A {Nested} Title},\n  author = {Smith, J.},\n  year = {2020}\n}\n\n@book{doc1,\n  title = {The Book},\n  year = {1999}\n}`;
    const json = await convertFile({ bytes: toBytes(bib), name: "refs.bib" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].type).toBe("article");
    expect(parsed[0].key).toBe("smith2020");
    expect(parsed[0].title).toBe("A {Nested} Title");
    const csv = await convertFile({ bytes: toBytes(bib), name: "refs.bib" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("smith2020");
  });

  it("JSONL → CSV/JSON merges all lines", async () => {
    const jsonl = `{"name": "Ana", "city": "Rome"}\n{"name": "Ben", "city": "Paris"}`;
    const json = await convertFile({ bytes: toBytes(jsonl), name: "data.ndjson" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[1].name).toBe("Ben");
    const csv = await convertFile({ bytes: toBytes(jsonl), name: "data.ndjson" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("Paris");
  });

  it("xlsx → yaml/xml/markdown/pdf route through the CSV pipeline", async () => {
    const xlsx = await csvToXlsx("name,city\nAna,Rome\nBen,Paris");
    const yaml = await convertFile({ bytes: xlsx, name: "data.xlsx" }, "yaml");
    const yamlText = new TextDecoder().decode(yaml.bytes);
    expect(yamlText).toContain("Ana");
    const xml = await convertFile({ bytes: xlsx, name: "data.xlsx" }, "xml");
    expect(new TextDecoder().decode(xml.bytes)).toContain("Paris");
    const md = await convertFile({ bytes: xlsx, name: "data.xlsx" }, "markdown");
    expect(new TextDecoder().decode(md.bytes)).toContain("|");
  });

  it("data → EPUB and xml → html produce real containers", async () => {
    const epub = await convertFile({ bytes: toBytes("name,city\nAna,Rome"), name: "data.csv" }, "epub");
    expect(epubToHtml(epub.bytes)).toContain("Ana");
    const jsonEpub = await convertFile({ bytes: toBytes('{"a": 1}'), name: "data.json" }, "epub");
    expect(epubToHtml(jsonEpub.bytes)).toContain("a");
    const html = await convertFile({ bytes: toBytes("<root><item>one</item></root>"), name: "data.xml" }, "html");
    expect(new TextDecoder().decode(html.bytes)).toContain("one");
  });

  it("ini → text stays the raw config; vcf → markdown is a table", async () => {
    const ini = "[server]\nport=8080\nhost=localhost";
    const txt = await convertFile({ bytes: toBytes(ini), name: "app.ini" }, "text");
    expect(new TextDecoder().decode(txt.bytes)).toBe(ini);
    const vcf = "BEGIN:VCARD\nFN:Ana Smith\nEMAIL:ana@example.com\nEND:VCARD";
    const md = await convertFile({ bytes: toBytes(vcf), name: "contact.vcf" }, "markdown");
    const mdText = new TextDecoder().decode(md.bytes);
    expect(mdText).toContain("ana@example.com");
    expect(mdText).toContain("|");
  });

  it("detects TOML by extension and QIF by header sniff", () => {
    const toml = "title = \"App\"\n[server]\nhost = \"localhost\"\nport = 8080";
    expect(detectFile(toBytes(toml), "config.toml").type).toBe("toml");
    const qif = "!Type:Bank\nD01/02/2026\nT-12.50\nPStore\n^";
    expect(detectFile(toBytes(qif), "bank.qif").type).toBe("qif");
    // Content sniffing catches a .txt QIF too.
    expect(detectFile(toBytes(qif), "bank.txt").type).toBe("qif");
  });

  it("TOML → JSON/YAML preserves sections and typed values", async () => {
    const toml = 'title = "App"\n[server]\nhost = "localhost"\nport = 8080\nenabled = true\ntags = ["a", "b"]';
    const json = await convertFile({ bytes: toBytes(toml), name: "config.toml" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.title).toBe("App");
    expect(parsed.server.host).toBe("localhost");
    expect(parsed.server.port).toBe(8080);
    expect(parsed.server.enabled).toBe(true);
    const yaml = await convertFile({ bytes: toBytes(toml), name: "config.toml" }, "yaml");
    expect(new TextDecoder().decode(yaml.bytes)).toContain("localhost");
  });

  it("JSON → TOML round-trips through the parser", async () => {
    const json = '{"title": "App", "server": {"host": "localhost", "port": 8080}}';
    const toml = await convertFile({ bytes: toBytes(json), name: "config.json" }, "toml");
    const tomlText = new TextDecoder().decode(toml.bytes);
    expect(tomlText).toContain("title = \"App\"");
    expect(tomlText).toContain("server.host = \"localhost\"");
    // And back.
    const back = await convertFile({ bytes: toBytes(tomlText), name: "config.toml" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(back.bytes));
    expect(parsed.server.port).toBe(8080);
  });

  it("QIF → CSV/JSON extracts transactions", async () => {
    const qif = "!Type:Bank\nD01/02/2026\nT-12.50\nPStore\nMCoffee\n^\nD01/03/2026\nT55.00\nPSalary\n^";
    const json = await convertFile({ bytes: toBytes(qif), name: "bank.qif" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].payee).toBe("Store");
    expect(parsed[0].amount).toBe("-12.50");
    const csv = await convertFile({ bytes: toBytes(qif), name: "bank.qif" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("Salary");
  });

  it("html/markdown/xml → xlsx route through the table pipeline", async () => {
    const html = '<table><tr><th>Name</th><th>City</th></tr><tr><td>Ana</td><td>Rome</td></tr></table>';
    const xlsx = await convertFile({ bytes: toBytes(html), name: "page.html" }, "xlsx");
    expect(await import("../src/core/converter/documents").then((d) => d.xlsxToCsv(xlsx.bytes))).toContain("Ana");
    const md = "| Name | City |\n| --- | --- |\n| Ben | Paris |";
    const mdXlsx = await convertFile({ bytes: toBytes(md), name: "table.md" }, "xlsx");
    expect(await import("../src/core/converter/documents").then((d) => d.xlsxToCsv(mdXlsx.bytes))).toContain("Paris");
    const xml = "<root><row><a>1</a><b>2</b></row><row><a>3</a><b>4</b></row></root>";
    const xmlXlsx = await convertFile({ bytes: toBytes(xml), name: "data.xml" }, "xlsx");
    expect(await import("../src/core/converter/documents").then((d) => d.xlsxToCsv(xmlXlsx.bytes))).toContain("3");
  });

  it("detects OFX by header sniff and GEDCOM by record sniff", () => {
    const ofx = '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><TRNAMT>-12.5</TRNAMT></STMTTRN></STMTTRNRS></BANKMSGSRSV1></OFX>';
    expect(detectFile(toBytes(ofx), "bank.ofx").type).toBe("ofx");
    expect(detectFile(toBytes(ofx), "bank.txt").type).toBe("ofx");
    const ged = "0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900";
    expect(detectFile(toBytes(ged), "tree.ged").type).toBe("gedcom");
    expect(detectFile(toBytes(ged), "tree.txt").type).toBe("gedcom");
  });

  it("OFX → CSV/JSON extracts transactions", async () => {
    const ofx = '<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260102</DTPOSTED><TRNAMT>-12.50</TRNAMT><NAME>Store</NAME><FITID>1001</FITID></STMTTRN><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260103</DTPOSTED><TRNAMT>55.00</TRNAMT><NAME>Salary</NAME><FITID>1002</FITID></STMTTRN></OFX>';
    const json = await convertFile({ bytes: toBytes(ofx), name: "bank.ofx" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].type).toBe("DEBIT");
    expect(parsed[0].amount).toBe("-12.50");
    const csv = await convertFile({ bytes: toBytes(ofx), name: "bank.ofx" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("Salary");
  });

  it("GEDCOM → JSON keeps name and event dates", async () => {
    const ged = "0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900\n1 DEAT\n2 DATE 2 FEB 1970\n0 @I2@ INDI\n1 NAME Mary /Jones/\n1 BIRT\n2 DATE 3 MAR 1905";
    const json = await convertFile({ bytes: toBytes(ged), name: "tree.ged" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].given).toBe("John");
    expect(parsed[0].surname).toBe("Smith");
    expect(parsed[0].birthDate).toBe("1 JAN 1900");
    expect(parsed[0].deathDate).toBe("2 FEB 1970");
    expect(parsed[1].surname).toBe("Jones");
  });

  it("detects mbox/LDIF/CUE by content sniff on .txt names", () => {
    const mbox = "From alice@example.com Mon Jan  1 12:00:00 2026\nFrom: alice@example.com\nSubject: Hello\n\nBody one\nFrom bob@example.com Tue Jan  2 09:00:00 2026\nFrom: bob@example.com\nSubject: Re: Hello\n\nBody two\n";
    expect(detectFile(toBytes(mbox), "mail.txt").type).toBe("mbox");
    const ldif = "version: 1\ndn: cn=Ana Smith,ou=People,dc=example,dc=com\ncn: Ana Smith\nmail: ana@example.com\n\ndn: cn=Ben,ou=People,dc=example,dc=com\ncn: Ben\nmail: ben@example.com\n";
    expect(detectFile(toBytes(ldif), "dir.txt").type).toBe("ldif");
    const cue = 'FILE "song.mp3" MP3\nTRACK 01 AUDIO\nTITLE "First"\nPERFORMER "Band"\nINDEX 01 00:00:00';
    expect(detectFile(toBytes(cue), "disc.txt").type).toBe("cue");
  });

  it("mbox → CSV/JSON extracts per-message records", async () => {
    const mbox = "From alice@example.com Mon Jan  1 12:00:00 2026\nFrom: alice@example.com\nTo: bob@example.com\nSubject: Hello\nDate: Mon, 1 Jan 2026\n\nBody one\nFrom bob@example.com Tue Jan  2 09:00:00 2026\nFrom: bob@example.com\nSubject: Re: Hello\n\nBody two\n";
    const json = await convertFile({ bytes: toBytes(mbox), name: "mail.mbox" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].subject).toBe("Hello");
    expect(parsed[0].from).toBe("alice@example.com");
    expect(parsed[1].body).toContain("Body two");
  });

  it("LDIF → CSV/JSON and CUE → CSV/JSON extract entries", async () => {
    const ldif = "version: 1\ndn: cn=Ana,ou=People\ncn: Ana Smith\nmail: ana@example.com\n\ndn: cn=Ben,ou=People\ncn: Ben\nmail: ben@example.com\n";
    const json = await convertFile({ bytes: toBytes(ldif), name: "dir.ldif" }, "json");
    const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
    expect(parsed.length).toBe(2);
    expect(parsed[0].cn).toBe("Ana Smith");
    expect(parsed[1].mail).toBe("ben@example.com");
    const cue = 'FILE "song.mp3" MP3\nTRACK 01 AUDIO\nTITLE "First"\nPERFORMER "Band"\nINDEX 01 00:00:00';
    const cueJson = await convertFile({ bytes: toBytes(cue), name: "disc.cue" }, "json");
    const cueParsed = JSON.parse(new TextDecoder().decode(cueJson.bytes));
    expect(cueParsed.length).toBe(1);
    expect(cueParsed[0].track).toBe("01");
    expect(cueParsed[0].title).toBe("First");
  });
});
