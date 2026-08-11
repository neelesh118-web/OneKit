/**
 * Ogg-FLAC muxer — wraps the pure-TS FLAC encoder's frames in an Ogg
 * container (RFC 5334). Ogg FLAC is a real, playable format (VLC, Chrome
 * and Firefox all open it), and this stays 100% on-device: the exact same
 * verbatim-subframe FLAC encoder, just packetized into Ogg pages.
 *
 * Page layout (per the Ogg + FLAC-in-Ogg specs):
 *   page 0 (BOS):  identification header = "fLaC" + STREAMINFO
 *   page 1:        comment header (empty VORBIS_COMMENT)
 *   pages 2..n:    one FLAC audio frame per page, granule = samples so far
 */

import { FLAC_BLOCK_SIZE, buildFlacFrame, buildFlacStreamInfo } from "./flac";
import { parseWav } from "./audio";
import { crc32 } from "./crc";

/** Fixed bitstream serial number for the single logical stream we emit. */
const SERIAL = 0x4f4e454b; // "ONEK" — anything nonzero works.

function u32le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/** Writes one Ogg page and returns it with a valid CRC-32. */
function buildPage(
  sequence: number,
  headerType: number,
  granule: number,
  packets: Uint8Array[]
): Uint8Array {
  // Lacing values: 255 for each full 255-byte segment, then the remainder
  // (0 marks a packet ending exactly on a segment boundary).
  const lacing: number[] = [];
  let payloadLen = 0;
  for (const p of packets) {
    const full = Math.floor(p.length / 255);
    for (let i = 0; i < full; i++) lacing.push(255);
    lacing.push(p.length % 255);
    payloadLen += p.length;
  }

  const page = new Uint8Array(27 + lacing.length + payloadLen);
  page.set([0x4f, 0x67, 0x67, 0x53, 0x00, headerType], 0); // "OggS" + version
  let o = 6;
  u32le(page, o, granule); // granule_position
  o += 4;
  u32le(page, o, granule / 4294967296 >>> 0); // high 32 bits (always 0 here)
  o += 4;
  u32le(page, o, SERIAL);
  o += 4;
  u32le(page, o, sequence);
  o += 4;
  // bytes o..o+3 = CRC-32, filled after the payload is placed.
  page[o + 4] = lacing.length; // page_segments
  for (let i = 0; i < lacing.length; i++) page[o + 5 + i] = lacing[i]!;
  let p = o + 5 + lacing.length;
  for (const packet of packets) {
    page.set(packet, p);
    p += packet.length;
  }
  // CRC-32 over the whole page with the checksum field zeroed.
  const crc = crc32(page, 0, page.length);
  u32le(page, o, crc);
  return page;
}

/**
 * Encodes a PCM WAV (16-bit, mono/stereo) as Ogg-FLAC. Throws on
 * unsupported channel counts.
 */
export function wavToOggFlac(bytes: Uint8Array): Uint8Array {
  const parsed = parseWav(bytes);
  if (!parsed.ok) throw new Error(parsed.error);
  const { sampleRate, channels, samples } = parsed.value;
  if (channels !== 1 && channels !== 2) {
    throw new Error(`Ogg FLAC supports mono or stereo (this WAV has ${channels} channels).`);
  }
  const frameCount = Math.floor(samples.length / channels);
  if (frameCount <= 0) throw new Error("No audio samples to encode.");

  // Identification header packet: "fLaC" + STREAMINFO metadata block.
  const streamInfo = buildFlacStreamInfo(sampleRate, channels, 16, frameCount);
  const ident = new Uint8Array(4 + 4 + streamInfo.length);
  ident.set([0x66, 0x4c, 0x61, 0x43], 0); // "fLaC"
  ident.set([0x80, 0x00, 0x00, 0x22], 4); // last-meta block, type 0, length 34
  ident.set(streamInfo, 8);

  // Comment header packet: empty VORBIS_COMMENT (last-meta flag 0x80 | type 4).
  const vendor = new TextEncoder().encode("OneKit");
  const comment = new Uint8Array(4 + 4 + vendor.length + 4);
  u32le(comment, 0, vendor.length);
  comment.set(vendor, 4);
  u32le(comment, 4 + vendor.length, 0); // zero user comments
  const commentBlock = new Uint8Array(4 + comment.length);
  commentBlock[0] = 0x84; // last-meta + type 4
  commentBlock[1] = (comment.length >> 16) & 0xff;
  commentBlock[2] = (comment.length >> 8) & 0xff;
  commentBlock[3] = comment.length & 0xff;
  commentBlock.set(comment, 4);

  const pages: Uint8Array[] = [
    buildPage(0, 0x02 /* BOS */, 0, [ident]),
    buildPage(1, 0x00, 0, [commentBlock])
  ];

  const totalBlocks = Math.ceil(frameCount / FLAC_BLOCK_SIZE);
  for (let b = 0; b < totalBlocks; b++) {
    const startFrame = b * FLAC_BLOCK_SIZE;
    const count = Math.min(FLAC_BLOCK_SIZE, frameCount - startFrame);
    const frame = buildFlacFrame(samples, channels, 16, b, startFrame, count);
    const granule = Math.min((b + 1) * FLAC_BLOCK_SIZE, frameCount);
    const headerType = b === totalBlocks - 1 ? 0x04 /* EOS */ : 0x00;
    pages.push(buildPage(2 + b, headerType, granule, [frame]));
  }

  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
