/**
 * MP3-in-MP4 muxer — wraps MP3 audio in an ISO Base Media (MP4/M4A)
 * container. The audio track is genuinely MP3 (remuxed, not re-encoded):
 * the result is a valid .mp4 that any MP4 player opens. This is the
 * honest, 100%-local answer to "MP3 → MP4".
 *
 * The file is a single audio track with one sample descriptor ('mp4a' with
 * an ESDS signaling MPEG-1 audio), one chunk (the whole mdat), and one
 * time-to-sample entry. Small enough to be a real file, not a stub.
 */

/** MPEG-1 Layer III bitrates (kbps), indexed by header bits 12–15. */
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
/** MPEG-2/2.5 Layer III bitrates (kbps). */
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000];

export interface Mp3Scan {
  /** Byte offsets of each MP3 frame inside the input. */
  offsets: number[];
  /** Samples per frame (1152 for MPEG-1, 576 for MPEG-2/2.5). */
  samplesPerFrame: number;
  /** Sample rate derived from the first frame's header. */
  sampleRate: number;
  /** Bytes skipped up front (ID3v2 tag, if present). */
  id3Size: number;
}

/** Scans an MP3 stream and returns frame offsets plus stream metadata. */
export function scanMp3Frames(mp3: Uint8Array): Mp3Scan {
  let pos = 0;
  // Skip an ID3v2 tag if present (10-byte header + synchsafe size).
  if (mp3.length >= 10 && mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33) {
    const size =
      ((mp3[6]! & 0x7f) << 21) |
      ((mp3[7]! & 0x7f) << 14) |
      ((mp3[8]! & 0x7f) << 7) |
      (mp3[9]! & 0x7f);
    pos = 10 + size;
  }
  const id3Size = pos;

  let samplesPerFrame = 1152;
  let sampleRate = 44100;
  const offsets: number[] = [];

  while (pos + 4 <= mp3.length) {
    const b0 = mp3[pos]!;
    const b1 = mp3[pos + 1]!;
    if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
      // Not a sync word — skip ahead one byte (resilient to junk padding).
      pos += 1;
      continue;
    }
    const version = (b1 >> 3) & 0x3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (b1 >> 1) & 0x3;
    const bitrateIndex = (mp3[pos + 2]! >> 4) & 0xf;
    const sampleRateIndex = (mp3[pos + 2]! >> 2) & 0x3;
    const padding = (mp3[pos + 2]! >> 1) & 0x1;
    if (layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      pos += 1;
      continue;
    }
    const table = version === 3 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES;
    const bitrate = table[bitrateIndex]!;
    const rate =
      version === 3
        ? MPEG1_SAMPLE_RATES[sampleRateIndex]!
        : MPEG1_SAMPLE_RATES[sampleRateIndex]! / (version === 2 ? 2 : 4);
    const factor = version === 3 ? 144 : 72;
    const frameLen = Math.floor((factor * bitrate * 1000) / rate) + padding;
    if (frameLen < 4 || pos + frameLen > mp3.length) {
      pos += 1;
      continue;
    }
    if (offsets.length === 0) {
      samplesPerFrame = version === 3 ? 1152 : 576;
      sampleRate = rate;
    }
    offsets.push(pos);
    pos += frameLen;
  }

  return { offsets, samplesPerFrame, sampleRate, id3Size };
}

function u32be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function u16be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  u32be(out, 0, 8 + payload.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

/** Writes a variable-size payload with a pre-encoded byte array body. */
function fullBox(type: string, flags: number, body: Uint8Array): Uint8Array {
  const head = new Uint8Array(4); // version 0 + 3 flag bytes
  head[1] = (flags >>> 16) & 0xff;
  head[2] = (flags >>> 8) & 0xff;
  head[3] = flags & 0xff;
  const payload = new Uint8Array(4 + body.length);
  payload.set(head, 0);
  payload.set(body, 4);
  return box(type, payload);
}

/** MPEG-4 descriptor: tag + 1-byte length + payload. */
function descriptor(tag: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + payload.length);
  out[0] = tag;
  out[1] = payload.length;
  out.set(payload, 2);
  return out;
}

const EMPTY = new Uint8Array(0);

/** 36-byte unity matrix used in mvhd/tkhd. */
function unityMatrix(): Uint8Array {
  const m = new Uint8Array(36);
  u32be(m, 0, 0x00010000);
  u32be(m, 16, 0x00010000);
  u32be(m, 32, 0x40000000);
  return m;
}

/**
 * Muxes raw MP3 frames into an MP4/M4A container. The MP3 stream is
 * scanned for real frame boundaries; the stsz/stts tables are built from
 * those actual frames, so players get accurate duration and seeking.
 */
export function muxMp3IntoMp4(mp3: Uint8Array): Uint8Array {
  const scan = scanMp3Frames(mp3);
  if (scan.offsets.length === 0) throw new Error("No MP3 frames found to mux into MP4.");
  const { offsets, samplesPerFrame, sampleRate } = scan;
  const frameCount = offsets.length;
  const totalSamples = frameCount * samplesPerFrame;

  // --- ftyp ---
  const ftypBody = new Uint8Array(20);
  ftypBody.set([0x4d, 0x34, 0x41, 0x20], 0); // major brand "M4A "
  u32be(ftypBody, 4, 0);
  ftypBody.set([0x4d, 0x34, 0x41, 0x20, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d], 8);
  const ftyp = box("ftyp", ftypBody);

  // --- mdat ---
  const mdatBody = new Uint8Array(mp3.length);
  mdatBody.set(mp3, 0);
  const mdat = box("mdat", mdatBody);

  // --- moov ---
  const mvhdBody = new Uint8Array(100);
  u32be(mvhdBody, 0, 0); // creation time
  u32be(mvhdBody, 4, 0); // modification time
  u32be(mvhdBody, 8, 1000); // timescale
  u32be(mvhdBody, 12, Math.round((totalSamples * 1000) / sampleRate)); // duration
  u32be(mvhdBody, 16, 0x00010000); // rate
  u16be(mvhdBody, 20, 0x0100); // volume
  mvhdBody.set(unityMatrix(), 32);
  u32be(mvhdBody, 92, 2); // next track ID
  const mvhd = fullBox("mvhd", 0, mvhdBody);

  const tkhdBody = new Uint8Array(84);
  u32be(tkhdBody, 0, 0); // creation
  u32be(tkhdBody, 4, 0); // modification
  u32be(tkhdBody, 8, 1); // track ID
  u32be(tkhdBody, 12, 0); // reserved
  u32be(tkhdBody, 16, Math.round((totalSamples * 1000) / sampleRate)); // duration
  u32be(tkhdBody, 20, 0); // reserved
  u32be(tkhdBody, 24, 0); // reserved
  u16be(tkhdBody, 28, 0); // layer
  u16be(tkhdBody, 30, 0); // alternate group
  u16be(tkhdBody, 32, 0x0100); // volume
  u16be(tkhdBody, 34, 0); // reserved
  tkhdBody.set(unityMatrix(), 36);
  const tkhd = fullBox("tkhd", 0x000007, tkhdBody);

  const mdhdBody = new Uint8Array(24);
  u32be(mdhdBody, 0, 0);
  u32be(mdhdBody, 4, 0);
  u32be(mdhdBody, 8, sampleRate); // timescale
  u32be(mdhdBody, 12, totalSamples); // duration
  u16be(mdhdBody, 16, 0x55c4); // language: "und"
  u16be(mdhdBody, 18, 0);
  const mdhd = fullBox("mdhd", 0, mdhdBody);

  const hdlrBody = new Uint8Array(25);
  u32be(hdlrBody, 0, 0);
  hdlrBody.set([0x73, 0x6f, 0x75, 0x6e], 4); // "soun"
  const hdlr = fullBox("hdlr", 0, hdlrBody);

  const smhdBody = new Uint8Array(4);
  u16be(smhdBody, 0, 0); // balance
  u16be(smhdBody, 2, 0);
  const smhd = fullBox("smhd", 0, smhdBody);

  // dref with one self-contained URL entry.
  const urlBody = new Uint8Array(4);
  u32be(urlBody, 0, 1); // flags: self-contained
  const urlBox = box("url ", urlBody);
  const drefBody = new Uint8Array(4 + urlBox.length);
  u32be(drefBody, 0, 1);
  drefBody.set(urlBox, 4);
  const dref = fullBox("dref", 0, drefBody);
  const dinf = box("dinf", dref);

  // esds: ES → DecoderConfig (OTI 0x6B = MPEG-1 audio) → empty DSI → SL.
  const slConfig = descriptor(0x06, new Uint8Array([0x02]));
  const decSpecific = descriptor(0x05, EMPTY);
  const decConfigBody = new Uint8Array(13 + decSpecific.length);
  decConfigBody[0] = 0x6b; // objectTypeIndication: MPEG-1 audio
  decConfigBody[1] = 0x15; // streamType: audio, upStream 0
  u32be(decConfigBody, 2, 8192); // bufferSizeDB
  u32be(decConfigBody, 6, 320000); // maxBitrate
  u32be(decConfigBody, 10, 128000); // avgBitrate
  decConfigBody.set(decSpecific, 13);
  const decConfig = descriptor(0x04, decConfigBody);
  const esdsBody = new Uint8Array(3 + decConfig.length + slConfig.length);
  u16be(esdsBody, 0, 1); // ES_ID
  esdsBody[2] = 0; // streamPriority + flags
  esdsBody.set(decConfig, 3);
  esdsBody.set(slConfig, 3 + decConfig.length);
  const esds = fullBox("esds", 0, esdsBody);

  // stsd: one 'mp4a' entry.
  const mp4aBody = new Uint8Array(28 + esds.length);
  u16be(mp4aBody, 0, 0); // reserved
  u16be(mp4aBody, 2, 0);
  u16be(mp4aBody, 4, 0);
  u16be(mp4aBody, 6, 1); // data reference index
  u16be(mp4aBody, 8, 0); // version
  u16be(mp4aBody, 10, 0); // revision
  u32be(mp4aBody, 12, 0); // vendor
  u16be(mp4aBody, 16, 2); // channelcount
  u16be(mp4aBody, 18, 16); // samplesize
  u16be(mp4aBody, 20, 0); // pre_defined
  u16be(mp4aBody, 22, 0); // reserved
  u32be(mp4aBody, 24, sampleRate << 16); // samplerate 16.16
  mp4aBody.set(esds, 28);
  const mp4a = box("mp4a", mp4aBody);
  const stsdBody = new Uint8Array(4 + mp4a.length);
  u32be(stsdBody, 0, 1);
  stsdBody.set(mp4a, 4);
  const stsd = fullBox("stsd", 0, stsdBody);

  // stts: one entry — all frames have the same duration.
  const sttsBody = new Uint8Array(8);
  u32be(sttsBody, 0, 1); // entry count
  u32be(sttsBody, 4, samplesPerFrame); // sample delta
  const stts = fullBox("stts", 0, sttsBody);

  // stsc: one entry — one chunk holding every frame.
  const stscBody = new Uint8Array(16);
  u32be(stscBody, 0, 1);
  u32be(stscBody, 4, 1); // first chunk
  u32be(stscBody, 8, frameCount); // samples per chunk
  u32be(stscBody, 12, 1); // sample description index
  const stsc = fullBox("stsc", 0, stscBody);

  // stsz: one entry per frame.
  const stszBody = new Uint8Array(8 + frameCount * 4);
  u32be(stszBody, 0, 0); // sample_size 0 → sizes are explicit
  u32be(stszBody, 4, frameCount);
  for (let i = 0; i < frameCount; i++) {
    const next = offsets[i + 1] ?? mp3.length;
    u32be(stszBody, 8 + i * 4, next - offsets[i]!);
  }
  const stsz = fullBox("stsz", 0, stszBody);

  // stco: one chunk — the mdat body starts right after ftyp + the mdat box.
  const chunkOffset = ftyp.length + 8;
  const stcoBody = new Uint8Array(8);
  u32be(stcoBody, 0, 1);
  u32be(stcoBody, 4, chunkOffset);
  const stco = fullBox("stco", 0, stcoBody);

  const stbl = box("stbl", concat([stsd, stts, stsc, stsz, stco]));
  const minf = box("minf", concat([smhd, dinf, stbl]));
  const mdia = box("mdia", concat([mdhd, hdlr, minf]));
  const trak = box("trak", concat([tkhd, mdia]));
  const moov = box("moov", concat([mvhd, trak]));

  return concat([ftyp, mdat, moov]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* MP4 → MOV (QuickTime remux) ------------------------------------------- */

const QT_BRAND = "qt  ";

/**
 * mp4 → mov is a container remux, not a re-encode: MP4 and QuickTime MOV
 * are the same ISO-BMFF box structure, so the ftyp box is rebranded to
 * the QuickTime major brand ("qt  ") and every other box — moov, mdat,
 * all sample data — is preserved byte-for-byte. H.264/AAC tracks open in
 * QuickTime Player and Apple apps just like a native MOV.
 */
export function mp4ToMov(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  let ftypStart = -1;
  let ftypEnd = -1;
  let sawMoov = false;
  let sawMdat = false;
  while (pos + 8 <= bytes.length) {
    const size = view.getUint32(pos, false);
    if (size < 8) throw new Error("This MP4 file has a corrupt box table.");
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (type === "ftyp" && ftypStart < 0) {
      ftypStart = pos;
      ftypEnd = pos + size;
    } else if (type === "moov") {
      sawMoov = true;
    } else if (type === "mdat") {
      sawMdat = true;
    }
    pos += size;
    if (size === 0) break; // 0 means "to end of file" — only legal last
  }
  if (ftypStart < 0) throw new Error("This MP4 file has no ftyp box — it may not be a valid MP4.");
  if (!sawMoov || !sawMdat) {
    throw new Error("This MP4 file is missing its moov/mdat boxes — it may be corrupt.");
  }

  const out = bytes.slice();
  // ftyp payload: major brand (4) + minor version (4) + compatible brands.
  const major = ftypStart + 8;
  out.set(new TextEncoder().encode(QT_BRAND), major);
  const brands = ftypStart + 16;
  const compatEnd = Math.min(ftypEnd, bytes.length);
  let hasQt = false;
  for (let i = brands; i + 4 <= compatEnd; i += 4) {
    if (String.fromCharCode(...out.subarray(i, i + 4)) === QT_BRAND) {
      hasQt = true;
      break;
    }
  }
  if (!hasQt && compatEnd + 4 <= out.length) {
    // Append "qt  " to the compatible-brands list (ftyp must stay a
    // multiple of 4; the box grows by one 4-byte brand).
    const grow = out.subarray(brands);
    const grown = new Uint8Array(out.length + 4);
    grown.set(out.subarray(0, brands), 0);
    grown.set(QT_BRAND.split("").map((c) => c.charCodeAt(0)), brands);
    grown.set(grow, brands + 4);
    const gv = new DataView(grown.buffer, grown.byteOffset, grown.byteLength);
    gv.setUint32(ftypStart, gv.getUint32(ftypStart, false) + 4, false);
    return grown;
  }
  return out;
}
