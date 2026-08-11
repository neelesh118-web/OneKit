// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeDds, encodeDds, isDds } from "../src/core/converter/dds";
import type { RgbaImage } from "../src/core/converter/raster";

/** Wraps texture data in a DDS header. */
function buildDds(opts: { width: number; height: number; fourCc?: string; body: Uint8Array }): Uint8Array {
  const out = new Uint8Array(128 + opts.body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x20534444, true); // "DDS "
  view.setUint32(4, 124, true);
  view.setUint32(12, opts.height, true);
  view.setUint32(16, opts.width, true);
  const pf = 80;
  view.setUint32(pf, 32, true);
  if (opts.fourCc) {
    view.setUint32(pf + 4, 0x4, true); // DDPF_FOURCC
    for (let i = 0; i < 4; i++) view.setUint8(pf + 8 + i, opts.fourCc.charCodeAt(i));
  }
  out.set(opts.body, 128);
  return out;
}

/** A BC1 colour block: two RGB565 endpoints plus 2-bit indices. */
function bc1Block(c0: number, c1: number, indices: number[]): Uint8Array {
  const block = new Uint8Array(8);
  const view = new DataView(block.buffer);
  view.setUint16(0, c0, true);
  view.setUint16(2, c1, true);
  let bits = 0;
  indices.forEach((v, i) => {
    bits |= (v & 3) << (2 * i);
  });
  view.setUint32(4, bits >>> 0, true);
  return block;
}

const RED565 = 0xf800;
const BLUE565 = 0x001f;

describe("converter DDS writing", () => {
  const source: RgbaImage = { width: 5, height: 3, data: new Uint8Array(5 * 3 * 4) };
  for (let i = 0; i < 15; i++) {
    source.data[i * 4] = i * 17;
    source.data[i * 4 + 1] = 255 - i * 10;
    source.data[i * 4 + 2] = (i * 37) & 0xff;
    source.data[i * 4 + 3] = i % 3 === 0 ? 128 : 255;
  }
  const dds = encodeDds(source);

  it("writes an uncompressed surface with a DDS header", () => {
    expect(isDds(dds)).toBe(true);
    expect(String.fromCharCode(...dds.subarray(0, 4))).toBe("DDS ");
    expect(new DataView(dds.buffer).getUint32(4, true)).toBe(124);
    expect(dds.length).toBe(128 + 5 * 3 * 4);
  });

  it("round-trips pixels exactly", () => {
    const back = decodeDds(dds);
    expect(back.width).toBe(5);
    expect(back.height).toBe(3);
    expect(Array.from(back.data)).toEqual(Array.from(source.data));
  });

  it("refuses an empty image", () => {
    expect(() => encodeDds({ width: 0, height: 0, data: new Uint8Array() })).toThrow(/empty image/);
  });
});

describe("converter DDS reading", () => {
  it("decodes DXT1 endpoints and interpolated colours", () => {
    const indices = new Array(16).fill(0);
    indices[1] = 1;
    indices[2] = 2;
    const image = decodeDds(
      buildDds({ width: 4, height: 4, fourCc: "DXT1", body: bc1Block(RED565, BLUE565, indices) })
    );
    expect([image.data[0], image.data[1], image.data[2], image.data[3]]).toEqual([255, 0, 0, 255]);
    expect([image.data[4], image.data[6]]).toEqual([0, 255]);
    // Index 2 sits two thirds of the way towards the first endpoint.
    expect([image.data[8], image.data[10]]).toEqual([170, 85]);
  });

  it("honours DXT1's punch-through alpha mode", () => {
    const indices = new Array(16).fill(0);
    indices[0] = 3;
    // c0 <= c1 selects the three-colour mode, where index 3 is transparent.
    const transparent = decodeDds(
      buildDds({ width: 4, height: 4, fourCc: "DXT1", body: bc1Block(BLUE565, RED565, indices) })
    );
    expect(transparent.data[3]).toBe(0);
    indices[0] = 2;
    const midpoint = decodeDds(
      buildDds({ width: 4, height: 4, fourCc: "DXT1", body: bc1Block(BLUE565, RED565, indices) })
    );
    expect([midpoint.data[0], midpoint.data[2]]).toEqual([128, 128]);
  });

  it("decodes DXT3's explicit alpha", () => {
    const body = new Uint8Array(16);
    new DataView(body.buffer).setUint16(0, 0x000f, true); // first pixel opaque
    body.set(bc1Block(RED565, BLUE565, new Array(16).fill(0)), 8);
    const image = decodeDds(buildDds({ width: 4, height: 4, fourCc: "DXT3", body }));
    expect(image.data[3]).toBe(255);
    expect(image.data[7]).toBe(0);
    expect([image.data[0], image.data[1]]).toEqual([255, 0]);
  });

  it("decodes DXT5's interpolated alpha", () => {
    const body = new Uint8Array(16);
    body[0] = 255;
    body[1] = 0;
    body.set(bc1Block(RED565, BLUE565, new Array(16).fill(0)), 8);
    expect(decodeDds(buildDds({ width: 4, height: 4, fourCc: "DXT5", body })).data[3]).toBe(255);
    body[2] = 0b00001001; // the first two pixels take alpha index 1
    expect(decodeDds(buildDds({ width: 4, height: 4, fourCc: "DXT5", body })).data[3]).toBe(0);
  });

  it("crops partial blocks to the real image size", () => {
    const image = decodeDds(
      buildDds({ width: 3, height: 2, fourCc: "DXT1", body: bc1Block(RED565, BLUE565, new Array(16).fill(0)) })
    );
    expect(image.width).toBe(3);
    expect(image.height).toBe(2);
    expect(image.data).toHaveLength(3 * 2 * 4);
  });

  it("refuses formats it can't read, honestly", () => {
    expect(() => decodeDds(new TextEncoder().encode("not a dds file"))).toThrow(/Not a DDS file/);
    expect(() => decodeDds(buildDds({ width: 4, height: 4, fourCc: "DX10", body: new Uint8Array(64) }))).toThrow(
      /DX10-header DDS files aren't supported/
    );
    expect(() => decodeDds(buildDds({ width: 4, height: 4, fourCc: "ATI2", body: new Uint8Array(64) }))).toThrow(
      /can't be read locally \(ATI2\)/
    );
    expect(() => decodeDds(buildDds({ width: 64, height: 64, fourCc: "DXT1", body: new Uint8Array(16) }))).toThrow(
      /truncated/
    );
  });
});
