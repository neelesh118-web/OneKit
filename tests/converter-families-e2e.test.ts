import { describe, it, expect } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { decodeFarbfeld, decodePcx, decodeQoi, encodeFarbfeld } from "../src/core/converter/pixel-codecs";
import { parseAu } from "../src/core/converter/au";
import type { ImageConvertDeps } from "../src/core/converter/images";

function fakeCanvasDeps(width: number, height: number): ImageConvertDeps {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 17) & 0xff;
    rgba[i * 4 + 1] = (i * 31) & 0xff;
    rgba[i * 4 + 2] = 128;
    rgba[i * 4 + 3] = 255;
  }
  const ctx = {
    drawImage(): void {},
    translate(): void {},
    rotate(): void {},
    scale(): void {},
    getImageData(_x: number, _y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
      return { width: w, height: h, data: rgba };
    }
  };
  const canvas = {
    width,
    height,
    getContext: (kind: string) => (kind === "2d" ? ctx : null),
    toBlob(cb: (b: Blob | null) => void): void {
      // The new codecs are pixel-encoded (never toBlob) — signal that to
      // drive the getImageData path, exactly like the other pixel formats.
      cb(null);
    }
  };
  return {
    canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    decode: async () => ({ width, height, close(): void {} }) as unknown as ImageBitmap
  };
}

const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("family expansions — end to end", () => {
  it("image → QOI / Farbfeld / PCX through the real dispatch", async () => {
    // Build a tiny Farbfeld, then convert it to the new codecs — the
    // matrix filters self-targets, so source and target must differ.
    const img = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) };
    for (let i = 0; i < 8 * 8; i++) {
      img.data[i * 4] = (i * 17) & 0xff;
      img.data[i * 4 + 1] = (i * 31) & 0xff;
      img.data[i * 4 + 2] = 128;
      img.data[i * 4 + 3] = 255;
    }
    const ffBytes = encodeFarbfeld(img);
    const deps = fakeCanvasDeps(8, 8);
    // Farbfeld → QOI
    const out = await convertFile({ bytes: ffBytes, name: "p.ff" }, "image-qoi", { canvas: deps });
    expect(decodeQoi(out.bytes).width).toBe(8);
    // Farbfeld → PCX
    const pcx = await convertFile({ bytes: ffBytes, name: "p.ff" }, "image-pcx", { canvas: deps });
    expect(decodePcx(pcx.bytes).width).toBe(8);
  });

  it("CSV → SQL / properties / JSONL / INI / TOML via renderTable", async () => {
    const csv = "name,age\nAda,36\nBob,41\n";
    const sql = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "sql");
    expect(new TextDecoder().decode(sql.bytes)).toContain("CREATE TABLE");
    expect(new TextDecoder().decode(sql.bytes)).toContain("'Ada'");

    const props = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "properties");
    const propsText = new TextDecoder().decode(props.bytes);
    expect(propsText).toContain("name=Ada");
    expect(propsText).toContain("age=41");

    const jsonl = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "jsonl");
    expect(new TextDecoder().decode(jsonl.bytes).split("\n").length).toBe(3);

    const ini = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "ini");
    expect(new TextDecoder().decode(ini.bytes)).toContain("name = Ada");

    const toml = await convertFile({ bytes: toBytes(csv), name: "t.csv" }, "toml");
    expect(new TextDecoder().decode(toml.bytes)).toContain("name = \"Ada\"");
  });

  it("JSON → SQL through renderTable", async () => {
    const json = JSON.stringify([{ k: "v1" }, { k: "v2" }]);
    const sql = await convertFile({ bytes: toBytes(json), name: "d.json" }, "sql");
    expect(new TextDecoder().decode(sql.bytes).match(/INSERT INTO/g)!.length).toBe(2);
  });

  it("document → OPML through renderDocument", async () => {
    const html = "<h1>One</h1><p>text</p><h2>Two</h2>";
    const opml = await convertFile({ bytes: toBytes(html), name: "d.html" }, "opml");
    const text = new TextDecoder().decode(opml.bytes);
    expect(text).toContain("<opml version=\"2.0\">");
    expect(text).toContain("text=\"One\"");
    expect(text).toContain("text=\"Two\"");
  });

  it("markdown → OPML", async () => {
    const md = "# One\n\nbody\n\n## Two\n";
    const opml = await convertFile({ bytes: toBytes(md), name: "d.md" }, "opml");
    expect(new TextDecoder().decode(opml.bytes)).toContain("text=\"One\"");
  });

  it("SRT → ASS / SBV / TTML", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n";
    const ass = await convertFile({ bytes: toBytes(srt), name: "s.srt" }, "ass");
    expect(new TextDecoder().decode(ass.bytes)).toContain("Dialogue: 0,0:00:01.00");
    const sbv = await convertFile({ bytes: toBytes(srt), name: "s.srt" }, "sbv");
    expect(new TextDecoder().decode(sbv.bytes)).toContain("00:00:01.000,00:00:02.500");
    const ttml = await convertFile({ bytes: toBytes(srt), name: "s.srt" }, "ttml");
    expect(new TextDecoder().decode(ttml.bytes)).toContain('begin="00:00:01.000"');
  });

  it("LRC → ASS (3s cues)", async () => {
    const lrc = "[00:10.50]Hello\n[00:15.00]World\n";
    const ass = await convertFile({ bytes: toBytes(lrc), name: "l.lrc" }, "ass");
    expect(new TextDecoder().decode(ass.bytes)).toContain("Dialogue:");
  });

  it("OPML source → CSV/JSON through the records pipeline", async () => {
    const opml = `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="A"/><outline text="B" url="https://b"/>
    </body></opml>`;
    const csv = await convertFile({ bytes: toBytes(opml), name: "o.opml" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("A");
    const json = await convertFile({ bytes: toBytes(opml), name: "o.opml" }, "json");
    expect(new TextDecoder().decode(json.bytes)).toContain("https://b");
  });

  it("plist source → CSV", async () => {
    const plist = `<?xml version="1.0"?><plist version="1.0"><array>
      <dict><key>name</key><string>Ada</string></dict>
    </array></plist>`;
    const csv = await convertFile({ bytes: toBytes(plist), name: "p.plist" }, "csv");
    expect(new TextDecoder().decode(csv.bytes)).toContain("Ada");
  });

  it("WAV → AU through the dispatch", async () => {
    // Hand-build a minimal 16-bit mono WAV.
    const rate = 8000, frames = 4;
    const buf = new ArrayBuffer(44 + frames * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + frames * 2, true); w(8, "WAVE"); w(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i) * 10000), true);
    const au = await convertFile({ bytes: new Uint8Array(buf), name: "t.wav" }, "audio-au");
    const parsed = parseAu(au.bytes);
    expect(parsed.sampleRate).toBe(rate);
    expect(parsed.channels).toBe(1);
    expect(parsed.samples.length).toBe(frames);
  });

  it("AU → WAV round-trip", async () => {
    const au = new TextEncoder().encode("");
    // Build AU directly via encodeAu then convert.
    const { encodeAu } = await import("../src/core/converter/au");
    const auBytes = encodeAu(16000, 1, new Float32Array([0, 0.25, -0.25, 1]));
    const wav = await convertFile({ bytes: auBytes, name: "t.au" }, "audio-wav");
    expect(wav.mime).toBe("audio/wav");
    expect(wav.bytes.length).toBeGreaterThan(44);
    void au;
  });
});
