// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate/browser";
import {
  decodeTiff,
  encodeBmp,
  encodeTiff,
  icoToDecodable,
  svgFromPng,
  type RgbaImage
} from "../src/core/converter/raster";

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 7) & 0xff;
    data[i * 4 + 1] = (i * 13) & 0xff;
    data[i * 4 + 2] = (i * 29) & 0xff;
    data[i * 4 + 3] = i % 5 === 0 ? 128 : 255;
  }
  return { width, height, data };
}

/** Builds a single-strip TIFF around already-encoded strip data. */
function buildTiff(opts: {
  width: number;
  height: number;
  samples: number;
  photometric: number;
  compression: number;
  predictor?: number;
  palette?: number[];
  body: Uint8Array;
}): Uint8Array {
  const tags: [number, number, number[]][] = [
    [256, 3, [opts.width]],
    [257, 3, [opts.height]],
    [258, 3, new Array(opts.samples).fill(8)],
    [259, 3, [opts.compression]],
    [262, 3, [opts.photometric]],
    [273, 4, [0]],
    [277, 3, [opts.samples]],
    [278, 4, [opts.height]],
    [279, 4, [opts.body.length]],
    [284, 3, [1]]
  ];
  if (opts.predictor) tags.push([317, 3, [opts.predictor]]);
  if (opts.palette) tags.push([320, 3, opts.palette]);
  tags.sort((a, b) => a[0] - b[0]);
  const ifdSize = 2 + tags.length * 12 + 4;
  const head = new Uint8Array(8 + ifdSize);
  const view = new DataView(head.buffer);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  const extras: { at: number; bytes: Uint8Array }[] = [];
  let extraOffset = 8 + ifdSize;
  const stripEntries: number[] = [];
  tags.forEach(([tag, type, values], i) => {
    const at = 10 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, values.length, true);
    if (tag === 273) {
      stripEntries.push(at);
      return;
    }
    const size = type === 3 ? 2 : 4;
    if (size * values.length <= 4) {
      values.forEach((v, k) => {
        if (type === 3) view.setUint16(at + 8 + k * 2, v, true);
        else view.setUint32(at + 8 + k * 4, v, true);
      });
    } else {
      const buf = new Uint8Array(size * values.length);
      const bufView = new DataView(buf.buffer);
      values.forEach((v, k) => {
        if (type === 3) bufView.setUint16(k * 2, v, true);
        else bufView.setUint32(k * 4, v, true);
      });
      view.setUint32(at + 8, extraOffset, true);
      extras.push({ at: extraOffset, bytes: buf });
      extraOffset += buf.length;
    }
  });
  const dataOffset = extraOffset;
  for (const at of stripEntries) view.setUint32(at + 8, dataOffset, true);
  const out = new Uint8Array(dataOffset + opts.body.length);
  out.set(head, 0);
  for (const extra of extras) out.set(extra.bytes, extra.at);
  out.set(opts.body, dataOffset);
  return out;
}

/** Literal-run PackBits, one of the two shapes the decoder must handle. */
function packBitsLiterals(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 128) {
    const chunk = input.subarray(i, Math.min(input.length, i + 128));
    out.push(chunk.length - 1, ...chunk);
  }
  return new Uint8Array(out);
}

/** Run-length PackBits, the other shape. */
function packBitsRuns(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    let run = 1;
    while (run < 128 && i + run < input.length && input[i + run] === input[i]) run++;
    if (run > 1) {
      out.push(257 - run, input[i]!);
      i += run;
    } else {
      out.push(0, input[i]!);
      i += 1;
    }
  }
  return new Uint8Array(out);
}

/** An independent TIFF-flavour LZW encoder, written to exercise the decoder. */
function lzwEncode(input: Uint8Array): Uint8Array {
  const bits: number[] = [];
  let width = 9;
  const push = (code: number): void => {
    for (let i = width - 1; i >= 0; i--) bits.push((code >> i) & 1);
  };
  let dict = new Map<string, number>();
  const reset = (): void => {
    dict = new Map();
    for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  };
  reset();
  let next = 258;
  push(256);
  let current = "";
  for (const byte of input) {
    const candidate = current + String.fromCharCode(byte);
    if (dict.has(candidate)) {
      current = candidate;
      continue;
    }
    push(dict.get(current)!);
    dict.set(candidate, next++);
    if (next + 1 > 1 << width && width < 12) width++;
    current = String.fromCharCode(byte);
  }
  if (current) push(dict.get(current)!);
  push(257);
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => {
    if (b) out[i >> 3]! |= 1 << (7 - (i & 7));
  });
  return out;
}

/** A 4×3 RGB test strip, used across the compression cases. */
const RGB_WIDTH = 4;
const RGB_HEIGHT = 3;
const rgbBody = new Uint8Array(RGB_WIDTH * RGB_HEIGHT * 3);
for (let i = 0; i < rgbBody.length; i++) rgbBody[i] = (i * 11) & 0xff;

function expectMatchesRgb(image: RgbaImage): void {
  for (let i = 0; i < RGB_WIDTH * RGB_HEIGHT; i++) {
    expect(image.data[i * 4]).toBe(rgbBody[i * 3]);
    expect(image.data[i * 4 + 1]).toBe(rgbBody[i * 3 + 1]);
    expect(image.data[i * 4 + 2]).toBe(rgbBody[i * 3 + 2]);
    expect(image.data[i * 4 + 3]).toBe(255);
  }
}

const rgbTiff = { width: RGB_WIDTH, height: RGB_HEIGHT, samples: 3, photometric: 2 };

describe("converter TIFF", () => {
  it("round-trips an image through encode → decode", () => {
    const source = gradient(17, 9);
    const tiff = encodeTiff(source);
    expect(tiff[0]).toBe(0x49);
    expect(tiff[1]).toBe(0x49);
    expect(tiff[2]).toBe(42);
    const decoded = decodeTiff(tiff);
    expect(decoded.width).toBe(17);
    expect(decoded.height).toBe(9);
    expect(Array.from(decoded.data)).toEqual(Array.from(source.data));
  });

  it("decodes uncompressed strips", () => {
    expectMatchesRgb(decodeTiff(buildTiff({ ...rgbTiff, compression: 1, body: rgbBody })));
  });

  it("decodes PackBits literals and runs", () => {
    expectMatchesRgb(decodeTiff(buildTiff({ ...rgbTiff, compression: 32773, body: packBitsLiterals(rgbBody) })));
    const flat = new Uint8Array(rgbBody.length).fill(200);
    const image = decodeTiff(buildTiff({ ...rgbTiff, compression: 32773, body: packBitsRuns(flat) }));
    expect(image.data[0]).toBe(200);
    expect(image.data[image.data.length - 2]).toBe(200);
  });

  it("decodes Deflate strips", () => {
    expectMatchesRgb(decodeTiff(buildTiff({ ...rgbTiff, compression: 8, body: zlibSync(rgbBody) })));
  });

  it("decodes LZW strips", () => {
    expectMatchesRgb(decodeTiff(buildTiff({ ...rgbTiff, compression: 5, body: lzwEncode(rgbBody) })));
  });

  it("reverses horizontal differencing (predictor 2)", () => {
    const differenced = new Uint8Array(rgbBody);
    for (let y = 0; y < RGB_HEIGHT; y++) {
      const row = y * RGB_WIDTH * 3;
      for (let i = RGB_WIDTH * 3 - 1; i >= 3; i--) {
        differenced[row + i] = (differenced[row + i]! - differenced[row + i - 3]!) & 0xff;
      }
    }
    expectMatchesRgb(
      decodeTiff(buildTiff({ ...rgbTiff, compression: 5, predictor: 2, body: lzwEncode(differenced) }))
    );
  });

  it("decodes greyscale, inverting WhiteIsZero", () => {
    const grey = new Uint8Array(RGB_WIDTH * RGB_HEIGHT);
    grey.forEach((_, i) => {
      grey[i] = i * 10;
    });
    const black = decodeTiff(
      buildTiff({ width: RGB_WIDTH, height: RGB_HEIGHT, samples: 1, photometric: 1, compression: 1, body: grey })
    );
    expect(black.data[4]).toBe(10);
    expect(black.data[6]).toBe(10);
    const white = decodeTiff(
      buildTiff({ width: RGB_WIDTH, height: RGB_HEIGHT, samples: 1, photometric: 0, compression: 1, body: grey })
    );
    expect(white.data[4]).toBe(245);
  });

  it("decodes palette images", () => {
    // Four entries of 16-bit channels, stored R…, G…, B….
    const palette = [0, 0xffff, 0, 0, 0, 0, 0xffff, 0, 0, 0, 0, 0xffff];
    const indices = new Uint8Array(RGB_WIDTH * RGB_HEIGHT).fill(1);
    const image = decodeTiff(
      buildTiff({
        width: RGB_WIDTH,
        height: RGB_HEIGHT,
        samples: 1,
        photometric: 3,
        compression: 1,
        palette,
        body: indices
      })
    );
    expect([image.data[0], image.data[1], image.data[2]]).toEqual([255, 0, 0]);
  });

  it("keeps the alpha sample of RGBA images", () => {
    const rgba = new Uint8Array(RGB_WIDTH * RGB_HEIGHT * 4).fill(90);
    for (let i = 0; i < RGB_WIDTH * RGB_HEIGHT; i++) rgba[i * 4 + 3] = 33;
    const image = decodeTiff(
      buildTiff({ width: RGB_WIDTH, height: RGB_HEIGHT, samples: 4, photometric: 2, compression: 1, body: rgba })
    );
    expect(image.data[3]).toBe(33);
  });

  it("refuses compressions it can't read, honestly", () => {
    expect(() => decodeTiff(buildTiff({ ...rgbTiff, compression: 7, body: rgbBody }))).toThrow(
      /compression this converter can't read/
    );
  });

  it("refuses non-TIFF bytes honestly", () => {
    expect(() => decodeTiff(new TextEncoder().encode("not a tiff file at all"))).toThrow(/Not a TIFF file/);
  });
});

describe("converter BMP", () => {
  const image: RgbaImage = {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0])
  };

  it("writes a 24-bit bitmap with white-composited alpha", () => {
    const bmp = encodeBmp(image);
    const view = new DataView(bmp.buffer);
    expect(bmp[0]).toBe(0x42);
    expect(bmp[1]).toBe(0x4d);
    expect(view.getUint32(2, true)).toBe(bmp.length);
    expect(view.getUint32(14, true)).toBe(40);
    expect(view.getUint16(28, true)).toBe(24);
    const offset = view.getUint32(10, true);
    expect(offset).toBe(54);
    // Rows run bottom-up, so the first stored row is the image's last:
    // blue, then a fully transparent pixel flattened onto white.
    expect([bmp[offset], bmp[offset + 1], bmp[offset + 2]]).toEqual([255, 0, 0]);
    expect([bmp[offset + 3], bmp[offset + 4], bmp[offset + 5]]).toEqual([255, 255, 255]);
    // Two 3-byte pixels padded to a 4-byte boundary = 8 bytes a row.
    expect(bmp.length - offset).toBe(16);
  });

  it("writes a 32-bit bitmap that keeps alpha", () => {
    const bmp = encodeBmp(image, { alpha: true });
    const view = new DataView(bmp.buffer);
    expect(view.getUint32(14, true)).toBe(108); // BITMAPV4HEADER
    expect(view.getUint16(28, true)).toBe(32);
    expect(view.getUint32(30, true)).toBe(3); // BI_BITFIELDS
    expect(view.getUint32(66, true)).toBe(0xff000000); // alpha mask
    const offset = view.getUint32(10, true);
    expect(bmp[offset + 7]).toBe(0);
  });

  it("refuses an empty bitmap", () => {
    expect(() => encodeBmp({ width: 0, height: 0, data: new Uint8Array() })).toThrow(/empty bitmap/);
  });
});

describe("converter ICO", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

  /** Wraps one payload in a single-entry icon directory. */
  function icoOf(payload: Uint8Array, width: number, height: number): Uint8Array {
    const out = new Uint8Array(22 + payload.length);
    const view = new DataView(out.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, 1, true);
    out[6] = width;
    out[7] = height;
    view.setUint32(14, payload.length, true);
    view.setUint32(18, 22, true);
    out.set(payload, 22);
    return out;
  }

  it("passes a PNG payload straight through", () => {
    const result = icoToDecodable(icoOf(png, 32, 32));
    expect(result.mime).toBe("image/png");
    expect(Array.from(result.bytes)).toEqual(Array.from(png));
  });

  it("wraps a DIB payload as a BMP, dropping the mask", () => {
    // 4×4 32bpp colour bitmap; the header's height counts the AND mask too.
    const dib = new Uint8Array(40 + 4 * 4 * 4 + 4 * 4);
    const view = new DataView(dib.buffer);
    view.setUint32(0, 40, true);
    view.setInt32(4, 4, true);
    view.setInt32(8, 8, true);
    view.setUint16(12, 1, true);
    view.setUint16(14, 32, true);
    for (let i = 0; i < 16; i++) dib[40 + i * 4] = 77;
    const result = icoToDecodable(icoOf(dib, 4, 4));
    const bmp = new DataView(result.bytes.buffer, result.bytes.byteOffset);
    expect(result.mime).toBe("image/bmp");
    expect(result.bytes[0]).toBe(0x42);
    expect(bmp.getInt32(14 + 8, true)).toBe(4); // height halved
    expect(bmp.getUint32(10, true)).toBe(54); // pixels start after the header
    expect(result.bytes[54]).toBe(77);
    expect(result.bytes.length).toBe(54 + 4 * 4 * 4); // mask dropped
  });

  it("picks the largest image in a multi-size icon", () => {
    const big = png.slice();
    big[11] = 99;
    const out = new Uint8Array(6 + 32 + png.length + big.length);
    const view = new DataView(out.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, 2, true);
    out[6] = 16;
    out[7] = 16;
    view.setUint32(14, png.length, true);
    view.setUint32(18, 6 + 32, true);
    out[22] = 0; // 0 means 256 pixels
    out[23] = 0;
    view.setUint32(30, big.length, true);
    view.setUint32(34, 6 + 32 + png.length, true);
    out.set(png, 6 + 32);
    out.set(big, 6 + 32 + png.length);
    expect(icoToDecodable(out).bytes[11]).toBe(99);
  });

  it("refuses a truncated icon honestly", () => {
    const ico = icoOf(png, 32, 32);
    expect(() => icoToDecodable(ico.subarray(0, 20))).toThrow(/too short to read/);
    const broken = icoOf(png, 32, 32);
    new DataView(broken.buffer).setUint32(14, 9999, true);
    expect(() => icoToDecodable(broken)).toThrow(/truncated/);
  });
});

describe("converter SVG wrapper", () => {
  it("wraps PNG bytes in a valid SVG at the image's size", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const svg = new TextDecoder().decode(svgFromPng(png, 120, 80));
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="120" height="80"');
    expect(svg).toContain('viewBox="0 0 120 80"');
    expect(svg).toContain('xlink:href="data:image/png;base64,');
    // The payload must be the PNG we handed in, byte for byte.
    const base64 = /base64,([^"]+)"/.exec(svg)![1]!;
    const decoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(png));
  });
});
