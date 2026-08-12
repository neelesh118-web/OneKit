/**
 * OLE2 (Compound File Binary) reader — just enough to pull the text out of
 * a legacy binary PowerPoint (.ppt) deck. Handles the 512-byte and 4096-byte
 * sector variants, the FAT chain, and the directory tree. Streams smaller
 * than the mini-stream cutoff (4096 bytes) live in the root entry's mini
 * stream, so the mini FAT is honoured too.
 *
 * The PowerPoint parser then walks the "PowerPoint Document" stream's record
 * atoms and collects every text record — the same content catppt/libreoffice
 * show: title, bullets and speaker notes, with no layout fidelity.
 */

const END_OF_CHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;

const MAX_STREAM = 64 * 1024 * 1024;

interface Ole2File {
  sectors: number;
  sectorSize: number;
  miniSectorSize: number;
  sectorBytes: Uint8Array[];
  fat: Uint32Array;
  miniFat: Uint32Array;
  rootStream: Uint8Array;
  directory: Ole2Entry[];
}

interface Ole2Entry {
  name: string;
  type: number;
  start: number;
  size: number;
}

function u16(bytes: Uint8Array, off: number): number {
  return bytes[off]! | (bytes[off + 1]! << 8);
}
function u32(bytes: Uint8Array, off: number): number {
  return (
    (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) >>> 0
  );
}

/** Reads the OLE2 container, throwing a clear error for anything else. */
export function readOle2(bytes: Uint8Array): Ole2File {
  if (bytes.length < 512) throw new Error("This file is too small to be a legacy Office document.");
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1][i]) {
      throw new Error("This is not a legacy OLE2 (Compound File) document.");
    }
  }
  const sectorShift = bytes[30]!;
  const miniShift = bytes[32]!;
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniShift;
  const numFat = u32(bytes, 44);
  const dirStart = u32(bytes, 48);
  const miniCutoff = u32(bytes, 56);
  const miniFatStart = u32(bytes, 60);
  const numMiniFat = u32(bytes, 64);

  const totalSectors = Math.floor(bytes.length / sectorSize);
  const sectors: Uint8Array[] = [];
  for (let i = 0; i < totalSectors; i++) {
    sectors.push(bytes.subarray(i * sectorSize, (i + 1) * sectorSize));
  }

  // FAT: the first 109 entries live in the header; overflow goes in DIFAT
  // sectors. We only read the FAT itself (chain tables), which is enough to
  // walk every stream.
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109; i++) {
    const v = u32(bytes, 76 + i * 4);
    if (v === FREESECT || v === END_OF_CHAIN) break;
    fatSectorIds.push(v);
  }
  // DIFAT overflow sectors (rare, but large files use them).
  const firstDif = u32(bytes, 68);
  const numDif = u32(bytes, 72);
  let difSector = firstDif;
  for (let d = 0; d < numDif && difSector < totalSectors && difSector >= 0; d++) {
    const sec = sectors[difSector]!;
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const v = u32(sec, i * 4);
      if (v === FREESECT || v === END_OF_CHAIN) break;
      fatSectorIds.push(v);
    }
    difSector = u32(sec, sectorSize - 4);
  }

  const fat = new Uint32Array(fatSectorIds.length * (sectorSize / 4));
  fatSectorIds.forEach((secId, idx) => {
    const sec = sectors[secId];
    if (!sec) return;
    for (let i = 0; i < sectorSize / 4; i++) fat[idx * (sectorSize / 4) + i] = u32(sec, i * 4);
  });

  /** Follows a FAT chain and returns the concatenated bytes. */
  const readChain = (start: number, size: number): Uint8Array => {
    if (size > MAX_STREAM) throw new Error("This document's streams are larger than OneKit can read.");
    const out = new Uint8Array(size);
    let written = 0;
    let sector = start;
    let guard = 0;
    while (sector !== END_OF_CHAIN && sector < totalSectors && guard++ < 1_000_000) {
      const sec = sectors[sector]!;
      const take = Math.min(sectorSize, size - written);
      out.set(sec.subarray(0, take), written);
      written += take;
      sector = fat[sector]!;
    }
    return out;
  };

  // Mini FAT + root stream (the mini-stream container).
  const miniFat = new Uint32Array(numMiniFat * (sectorSize / 4));
  if (numMiniFat > 0 && miniFatStart < totalSectors) {
    let sector = miniFatStart;
    let idx = 0;
    let guard = 0;
    while (sector !== END_OF_CHAIN && sector < totalSectors && guard++ < 100000) {
      const sec = sectors[sector]!;
      for (let i = 0; i < sectorSize / 4; i++) miniFat[idx++] = u32(sec, i * 4);
      sector = fat[sector]!;
    }
  }

  // Directory.
  const dirBytes = readChain(dirStart, 128 * 64);
  const directory: Ole2Entry[] = [];
  for (let i = 0; i < 64; i++) {
    const off = i * 128;
    const nameLen = u16(dirBytes, off + 64);
    if (nameLen < 2) continue;
    const name = dirBytes
      .subarray(off, off + Math.min(nameLen - 2, 62))
      .reduce((s, b, k) => s + (k % 2 === 0 ? String.fromCharCode(b) : ""), "");
    directory.push({
      name,
      type: dirBytes[off + 66]!,
      start: u32(dirBytes, off + 116),
      size: u32(dirBytes, off + 120)
    });
  }

  const root = directory.find((e) => e.type === 5);
  let rootStream: Uint8Array = new Uint8Array(0);
  if (root) {
    const size = Math.min(root.size, MAX_STREAM);
    rootStream = readChain(root.start, size);
  }

  return { sectors: totalSectors, sectorSize, miniSectorSize, sectorBytes: sectors, fat, miniFat, rootStream, directory };
}

/** Reads a named stream, honouring the mini-stream path for small streams. */
export function readOle2Stream(file: Ole2File, name: string): Uint8Array | undefined {
  const entry = file.directory.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (!entry || entry.type !== 2) return undefined;
  if (entry.size >= 4096) {
    // Regular FAT chain.
    return readChainBytes(file, entry.start, entry.size);
  }
  // Mini stream: read mini sectors out of the root stream.
  const out = new Uint8Array(entry.size);
  let sector = entry.start;
  let written = 0;
  let guard = 0;
  while (sector !== END_OF_CHAIN && sector >= 0 && guard++ < 1_000_000) {
    const off = sector * file.miniSectorSize;
    const take = Math.min(file.miniSectorSize, entry.size - written);
    out.set(file.rootStream.subarray(off, off + take), written);
    written += take;
    sector = file.miniFat[sector] ?? END_OF_CHAIN;
  }
  return out;
}

function readChainBytes(file: Ole2File, start: number, size: number): Uint8Array {
  const out = new Uint8Array(Math.min(size, MAX_STREAM));
  let written = 0;
  let sector = start;
  let guard = 0;
  while (sector !== END_OF_CHAIN && sector < file.sectors && guard++ < 1_000_000) {
    const sec = file.sectorBytes[sector];
    if (!sec) break;
    const take = Math.min(file.sectorSize, size - written);
    out.set(sec.subarray(0, take), written);
    written += take;
    sector = file.fat[sector]!;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* PowerPoint text records                                            */
/* ------------------------------------------------------------------ */

const REC_TEXT_BYTES = 0x0fa8; // 8-bit (ANSI) text atom
const REC_TEXT_CHARS = 0x0fa0; // UTF-16LE text atom
const REC_CSTRING = 0x0fba; // null-terminated string (ANSI or UTF-16)

function ascii(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** Extracts readable text from a PowerPoint "Document" stream. */
export function extractPptText(stream: Uint8Array): string {
  const strings: string[] = [];
  let i = 0;
  while (i + 8 <= stream.length) {
    const verInst = u16(stream, i);
    const recType = u16(stream, i + 2);
    const recLen = u32(stream, i + 4);
    const dataStart = i + 8;
    const dataEnd = Math.min(dataStart + recLen, stream.length);
    if (recLen > 0 && dataEnd >= dataStart) {
      const data = stream.subarray(dataStart, dataEnd);
      let text = "";
      if (recType === REC_TEXT_BYTES || recType === REC_CSTRING) {
        // ANSI — keep printable runs.
        text = ascii(data).replace(/[^\x20-\x7e\xa0-\xff]/g, " ").trim();
      } else if (recType === REC_TEXT_CHARS) {
        // UTF-16LE.
        let run = "";
        for (let k = 0; k + 1 < data.length; k += 2) {
          const c = data[k]! | (data[k + 1]! << 8);
          if (c === 0) run += " ";
          else if (c >= 32 && c < 0xfffe) run += String.fromCharCode(c);
          else run += " ";
        }
        text = run.trim();
      }
      if (text.length >= 1) strings.push(text);
    }
    // Records are padded to even lengths.
    i = dataStart + recLen + (recLen % 2);
    if (recLen === 0) i = dataStart;
  }
  if (strings.length === 0) {
    throw new Error("Couldn't find any text in this PowerPoint file — it may be empty or encrypted.");
  }
  return strings.join("\n");
}

/** Renders the deck's text as a simple HTML document. */
export function pptToHtml(bytes: Uint8Array): string {
  const file = readOle2(bytes);
  const stream = readOle2Stream(file, "PowerPoint Document");
  if (!stream) {
    throw new Error(
      "This .ppt file has no readable presentation stream — it may be a template or password-protected."
    );
  }
  const text = extractPptText(stream);
  const paragraphs = text
    .split(/\r?\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>PowerPoint presentation</title></head><body><h1>PowerPoint presentation</h1>${paragraphs.join(
    "\n"
  )}</body></html>`;
}
