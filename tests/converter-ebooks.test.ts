// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fb2Title, fb2ToHtml, isFb2, isMobi, mobiToHtml } from "../src/core/converter/ebooks";

const fb2 =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">` +
  `<description><title-info>` +
  `<author><first-name>Anton</first-name><last-name>Chekhov</last-name></author>` +
  `<book-title>The Bet &amp; other stories</book-title>` +
  `</title-info></description>` +
  `<body>` +
  `<section><title><p>Chapter I</p></title>` +
  `<p>It was a dark <emphasis>autumn</emphasis> night.</p>` +
  `<p>The old banker was <strong>walking</strong> &lt;here&gt;.</p>` +
  `<empty-line/>` +
  `<subtitle>An interlude</subtitle>` +
  `<poem><stanza><v>A line of verse</v><v>And another</v></stanza>` +
  `<text-author>Someone</text-author></poem>` +
  `</section></body>` +
  `<binary id="cover.jpg" content-type="image/jpeg">iVBORw0KGgo=</binary>` +
  `</FictionBook>`;

describe("converter FB2", () => {
  it("recognises FictionBook documents", () => {
    expect(isFb2(new TextEncoder().encode(fb2))).toBe(true);
    expect(isFb2(new TextEncoder().encode("<html><body>hi</body></html>"))).toBe(false);
  });

  it("reads the book title", () => {
    expect(fb2Title(fb2)).toBe("The Bet & other stories");
  });

  it("renders headings, paragraphs and inline formatting", () => {
    const html = fb2ToHtml(fb2);
    expect(html).toContain("<h1>The Bet &amp; other stories</h1>");
    expect(html).toContain("Anton");
    expect(html).toContain("<h2>Chapter I</h2>");
    expect(html).toContain("<h3>An interlude</h3>");
    expect(html).toContain("It was a dark <em>autumn</em> night.");
    expect(html).toContain("was <strong>walking</strong>");
    expect(html).toContain("&lt;here&gt;");
    expect(html).toContain("<br/>");
    expect(html).toContain("<p>A line of verse</p>");
    expect(html).toContain("<p><em>Someone</em></p>");
  });

  it("leaves the base64 image blobs out", () => {
    expect(fb2ToHtml(fb2)).not.toContain("iVBORw0KGgo");
  });

  it("refuses documents it can't read, honestly", () => {
    expect(() => fb2ToHtml("<html><body>not fb2</body></html>")).toThrow(/doesn't look like an FB2/);
    expect(() => fb2ToHtml("<FictionBook><description/></FictionBook>")).toThrow(/no body to read/);
  });
});

/** PalmDOC compression, including the back-references the decoder must follow. */
function palmDocCompress(text: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < text.length) {
    let bestDistance = 0;
    let bestLength = 0;
    for (let start = Math.max(0, i - 2047); start < i; start++) {
      let length = 0;
      while (length < 10 && i + length < text.length && text[start + length] === text[i + length]) length++;
      if (length >= 3 && length > bestLength) {
        bestLength = length;
        bestDistance = i - start;
      }
    }
    if (bestLength >= 3) {
      const pair = 0x8000 | (bestDistance << 3) | (bestLength - 3);
      out.push((pair >> 8) & 0xff, pair & 0xff);
      i += bestLength;
      continue;
    }
    const b = text[i]!;
    if (b === 0x20 && i + 1 < text.length && text[i + 1]! >= 0x40 && text[i + 1]! <= 0x7f) {
      out.push(text[i + 1]! ^ 0x80);
      i += 2;
      continue;
    }
    if (b >= 0x09 && b <= 0x7f) {
      out.push(b);
      i += 1;
      continue;
    }
    const run: number[] = [];
    while (i < text.length && run.length < 8 && !(text[i]! >= 0x09 && text[i]! <= 0x7f)) run.push(text[i++]!);
    out.push(run.length, ...run);
  }
  return new Uint8Array(out);
}

/** Builds a Palm database holding a MOBI book. */
function buildMobi(opts: {
  text: string;
  compression?: 1 | 2;
  encryption?: number;
  encoding?: number;
  trailingBytes?: number;
}): Uint8Array {
  const compression = opts.compression ?? 2;
  const encoded = new TextEncoder().encode(opts.text);
  const pieces: Uint8Array[] = [];
  for (let i = 0; i < encoded.length; i += 4096) pieces.push(encoded.subarray(i, i + 4096));
  const bodies = pieces.map((piece) => {
    const packed = compression === 2 ? palmDocCompress(piece) : piece;
    if (!opts.trailingBytes) return packed;
    // A trailing entry: payload plus its own backwards-encoded length.
    const size = opts.trailingBytes + 1;
    const withTrailer = new Uint8Array(packed.length + size);
    withTrailer.set(packed, 0);
    withTrailer.fill(0x7a, packed.length, packed.length + opts.trailingBytes);
    withTrailer[withTrailer.length - 1] = 0x80 | size;
    return withTrailer;
  });

  const mobiHeaderLength = 232;
  const record0 = new Uint8Array(16 + mobiHeaderLength);
  const header = new DataView(record0.buffer);
  header.setUint16(0, compression, false);
  header.setUint32(4, encoded.length, false);
  header.setUint16(8, pieces.length, false);
  header.setUint16(10, 4096, false);
  header.setUint16(12, opts.encryption ?? 0, false);
  record0.set(new TextEncoder().encode("MOBI"), 16);
  header.setUint32(20, mobiHeaderLength, false);
  header.setUint32(24, 2, false);
  header.setUint32(28, opts.encoding ?? 65001, false);
  // Extra-data flags live at 0xF2 of record 0; bit 1 = one trailing entry.
  if (opts.trailingBytes) header.setUint16(0xf2, 0x0002, false);

  const records = [record0, ...bodies];
  const headerSize = 78 + records.length * 8;
  const out = new Uint8Array(headerSize + records.reduce((n, r) => n + r.length, 0));
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OneKitBook"), 0);
  out.set(new TextEncoder().encode("BOOKMOBI"), 60);
  view.setUint16(76, records.length, false);
  let offset = headerSize;
  records.forEach((record, i) => {
    view.setUint32(78 + i * 8, offset, false);
    view.setUint32(78 + i * 8 + 4, i, false);
    out.set(record, offset);
    offset += record.length;
  });
  return out;
}

const bookHtml =
  `<html><head><guide><reference type="toc" title="Contents" filepos=0000000123 /></guide></head>` +
  `<body><h1>Chapter One</h1>` +
  `<p>Call me Ishmael. Call me Ishmael again, and again and again.</p>` +
  `<mbp:pagebreak/><p>Some years ago never mind how long precisely.</p></body></html>`;

describe("converter MOBI", () => {
  it("recognises Palm databases holding MOBI books", () => {
    expect(isMobi(buildMobi({ text: bookHtml }))).toBe(true);
    expect(isMobi(new TextEncoder().encode("PK definitely not a palm database, padding padding padding"))).toBe(
      false
    );
  });

  it("decompresses the text and cleans up reader-only markup", () => {
    const html = mobiToHtml(buildMobi({ text: bookHtml }));
    expect(html).toContain("<h1>Chapter One</h1>");
    expect(html).toContain("Call me Ishmael. Call me Ishmael again, and again and again.");
    expect(html).toContain("Some years ago never mind how long precisely.");
    expect(html).not.toContain("mbp:");
    expect(html).not.toContain("filepos");
  });

  it("reads uncompressed books and utf-8 text", () => {
    expect(mobiToHtml(buildMobi({ text: bookHtml, compression: 1 }))).toContain("Chapter One");
    const utf8 = mobiToHtml(buildMobi({ text: "<html><body><p>Café — naïve</p></body></html>" }));
    expect(utf8).toContain("Café — naïve");
  });

  it("trims trailing entries and stitches multiple records", () => {
    const trimmed = mobiToHtml(buildMobi({ text: bookHtml, trailingBytes: 5 }));
    expect(trimmed).toContain("Chapter One");
    expect(trimmed).not.toContain("zzzz");

    const long =
      "<html><body>" +
      Array.from({ length: 400 }, (_, i) => `<p>Paragraph number ${i} with some words in it.</p>`).join("") +
      "</body></html>";
    const stitched = mobiToHtml(buildMobi({ text: long }));
    expect(stitched).toContain("Paragraph number 0 ");
    expect(stitched).toContain("Paragraph number 399 ");
  });

  it("refuses DRM, HUFF/CDIC and non-MOBI files honestly", () => {
    expect(() => mobiToHtml(buildMobi({ text: bookHtml, encryption: 1 }))).toThrow(/DRM-protected/);

    const huff = buildMobi({ text: bookHtml });
    const view = new DataView(huff.buffer);
    view.setUint16(view.getUint32(78, false), 17480, false);
    expect(() => mobiToHtml(huff)).toThrow(/HUFF\/CDIC/);

    expect(() => mobiToHtml(new TextEncoder().encode("not a palm database, just some padding bytes here"))).toThrow(
      /doesn't look like a MOBI/
    );
  });
});
