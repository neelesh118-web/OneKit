// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mp4ToMov } from "../src/core/converter/mp4";
import { mobiFromHtml } from "../src/core/converter/ebooks-write";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor, targetExtension } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";
import { zipSync, strFromU8 } from "fflate/browser";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const toBytes = enc;

/** Builds a minimal ISO-BMFF file: ftyp + moov + mdat, all fake payloads. */
function synthMp4(major = "isom", compat: string[] = ["isom", "mp42"]): Uint8Array {
  const box = (type: string, payload: Uint8Array): Uint8Array => {
    const b = new Uint8Array(8 + payload.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, 8 + payload.length);
    b.set(enc(type), 4);
    b.set(payload, 8);
    return b;
  };
  const ftypPayload = new Uint8Array(8 + compat.length * 4);
  ftypPayload.set(enc(major), 0);
  compat.forEach((c, i) => ftypPayload.set(enc(c), 8 + i * 4));
  const ftyp = box("ftyp", ftypPayload);
  const moov = box("moov", enc("fake-moov-payload-0123456789"));
  const mdat = box("mdat", enc("fake-mdat-media-data-0123456789abcdef"));
  const out = new Uint8Array(ftyp.length + moov.length + mdat.length);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  out.set(mdat, ftyp.length + moov.length);
  return out;
}

describe("mp4 → mov remux", () => {
  it("rebrands the ftyp major brand to QuickTime and preserves the media boxes", () => {
    const mp4 = synthMp4();
    const mov = mp4ToMov(mp4);
    const major = String.fromCharCode(...mov.subarray(8, 12));
    expect(major).toBe("qt  ");
    // Walk the output's top-level boxes: ftyp, then moov and mdat, all intact.
    const types: string[] = [];
    let pos = 0;
    const dv = new DataView(mov.buffer, mov.byteOffset, mov.byteLength);
    while (pos + 8 <= mov.length) {
      const size = dv.getUint32(pos, false);
      if (size < 8) break;
      types.push(String.fromCharCode(...mov.subarray(pos + 4, pos + 8)));
      pos += size;
    }
    expect(types).toEqual(["ftyp", "moov", "mdat"]);
  });

  it("appends the qt compatible brand and patches the ftyp size", () => {
    const mp4 = synthMp4("mp42", ["isom", "mp42"]); // no qt brand yet
    const mov = mp4ToMov(mp4);
    const dv = new DataView(mov.buffer, mov.byteOffset, mov.byteLength);
    const ftypSize = dv.getUint32(0, false);
    const brands = String.fromCharCode(...mov.subarray(16, ftypSize));
    expect(brands).toContain("qt  ");
    expect(ftypSize % 4).toBe(0);
  });

  it("detects as a QuickTime MOV and converts end-to-end through convertFile", async () => {
    const mp4 = synthMp4();
    expect(detectFile(mp4, "clip.mp4").type).toBe("video-mp4");
    const result = await convertFile({ bytes: mp4, name: "clip.mp4" }, "video-mov");
    expect(result.name).toBe("clip.mov");
    expect(result.mime).toBe("video/quicktime");
    expect(detectFile(result.bytes, "clip.mov").type).toBe("video-mov");
  });

  it("throws honest errors for non-MP4 or corrupt containers", () => {
    expect(() => mp4ToMov(toBytes("not an mp4 at all"))).toThrow(/no ftyp box/);
    // ftyp but no moov/mdat.
    const dv = new DataView(new Uint8Array(16).buffer);
    const fake = new Uint8Array(16);
    const f = new DataView(fake.buffer);
    f.setUint32(0, 16);
    fake.set(enc("ftyp"), 4);
    f.setUint32(8, 0); // major brand
    f.setUint32(12, 0);
    expect(() => mp4ToMov(fake)).toThrow(/moov\/mdat/);
  });
});

describe("ebook → FB2 expansion", () => {
  const bookHtml = "<html><head><title>B</title></head><body><p>Ebook body words</p></body></html>";
  const mobi = mobiFromHtml(bookHtml, { title: "B" });

  it("mobi, azw and prc all write FB2", async () => {
    for (const name of ["book.mobi", "book.azw", "book.prc"]) {
      const result = await convertFile({ bytes: mobi, name }, "fb2");
      expect(result.name).toBe("book.fb2");
      expect(result.mime).toBe("application/x-fictionbook+xml");
      const xml = new TextDecoder().decode(result.bytes);
      expect(xml).toContain("<FictionBook");
      expect(xml).toContain("Ebook body words");
    }
  });

  it("htmlz, txtz and pml all write FB2", async () => {
    const htmlz = zipSync({ "index.html": enc("<html><body><p>Htmlz words</p></body></html>") });
    const txtz = zipSync({ "01.txt": enc("First chapter words") });
    const pml = toBytes("\\pChapter one\\nPalm words here");
    const sources: [string, Uint8Array][] = [
      ["book.htmlz", htmlz],
      ["book.txtz", txtz],
      ["book.pml", pml]
    ];
    for (const [name, bytes] of sources) {
      const result = await convertFile({ bytes, name }, "fb2");
      expect(result.mime).toBe("application/x-fictionbook+xml");
      expect(new TextDecoder().decode(result.bytes)).toContain("<FictionBook");
    }
  });

  it("advertises fb2 without self-targets or duplicates", () => {
    for (const src of ["mobi", "azw", "prc", "htmlz", "txtz", "pml", "abw", "zabw", "oeb"] as const) {
      expect(targetsFor(src)).toContain("fb2");
    }
    for (const src of ["rtf", "odt", "odp", "pptx", "rst", "tex"] as const) {
      expect(targetsFor(src).filter((t) => t === "fb2").length).toBe(1); // no dupes
    }
    expect(targetsFor("fb2")).not.toContain("fb2");
  });
});

describe("matrix wiring for the round", () => {
  it("video-mp4 reaches mov but webm/mov stay honest", () => {
    expect(targetsFor("video-mp4")).toContain("video-mov");
    expect(targetsFor("video-webm")).not.toContain("video-mov");
    expect(targetsFor("video-mov")).not.toContain("video-mov"); // no self
    expect(targetExtension("video-mov")).toBe("mov");
  });
});
