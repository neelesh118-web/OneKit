/**
 * Microsoft Reader (.lit) reader — a faithful port of calibre's `lit/reader.py`
 * (which itself follows ConvertLIT). LIT is NOT an OLE2 compound document: it
 * has its own `ITOLITLS` header with piece table, an `IFCM` directory of
 * ENCINT records (same encoding CHM uses), UTF-16LE section names, and an
 * LZX-compressed content stream driven by a reset table. The decompressed
 * "binary HTML" is then decoded through the UnBinary state machine into real
 * HTML. DRM-protected books (DES transform / DRMStorage entries) get an honest
 * error — the DES decryption is out of scope, exactly like the other lossy-but-
 * real readers in this project.
 */
import { LIT_TAGS, LIT_ATTRS0, LIT_TAGS_ATTRS } from "./lit-maps";
import { lzxDecompress } from "./lzx";

const u32le = (b: Uint8Array, o: number): number =>
  b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24);
const i32le = (b: Uint8Array, o: number): number => u32le(b, o) | 0;
const u16le = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const utf8 = (b: Uint8Array): string => new TextDecoder().decode(b);

const DESENCRYPT_GUID = "{67F6E4A2-60BF-11D3-8540-00C04F58C3CF}";
const LZXCOMPRESS_GUID = "{0A9007C6-4076-11D3-8789-0000F8105754}";

/** The binary HTML flag bits (mirrors calibre's FLAG_* constants). */
const FLAG_OPENING = 1;
const FLAG_CLOSING = 2;
const FLAG_ATOM = 16;

interface LitEntry {
  name: string;
  section: number;
  offset: number;
  size: number;
}

interface LitManifestItem {
  internal: string;
  original: string;
  mime: string;
  state: string;
}

/** Reads one UTF-8 code point starting at `pos`. Returns [char, nextPos]. */
function readUtf8Char(b: Uint8Array, pos: number): [string, number] {
  const c0 = b[pos]!;
  if (c0 < 0x80) return [String.fromCharCode(c0), pos + 1];
  let extra = 0;
  let mask = 0x80;
  while (c0 & mask) {
    mask >>= 1;
    extra += 1;
  }
  if (mask <= 1 || extra > 4 || pos + extra > b.length) return ["\uFFFD", pos + 1];
  let code = c0 & (mask - 1);
  for (let i = 1; i < extra; i++) {
    const cb = b[pos + i]!;
    if ((cb & 0xc0) !== 0x80) return ["\uFFFD", pos + 1];
    code = (code << 6) | (cb & 0x3f);
  }
  return [String.fromCodePoint(code), pos + extra];
}

/** ENCINT — 7-bit varint, most significant group first (same as CHM). */
function readEncint(b: Uint8Array, pos: { i: number }, end: number): number {
  let value = 0;
  for (let guard = 0; guard < 8; guard++) {
    if (pos.i >= end) break;
    const c = b[pos.i]!;
    pos.i += 1;
    value = (value << 7) | (c & 0x7f);
    if ((c & 0x80) === 0) break;
  }
  return value;
}

/** Windows GUID string, the same layout msguid() in calibre produces. */
function msguid(bytes: Uint8Array): string {
  const d1 = u32le(bytes, 0);
  const d2 = u16le(bytes, 4);
  const d3 = u16le(bytes, 6);
  const d4 = bytes[8]!;
  const d5 = bytes[9]!;
  const rest = Array.from(bytes.subarray(10, 16), (x) => x.toString(16).padStart(2, "0").toUpperCase()).join("");
  const hex4 = (n: number): string => n.toString(16).padStart(4, "0").toUpperCase();
  const hex2 = (n: number): string => n.toString(16).padStart(2, "0").toUpperCase();
  return `{${hex4(d1 >>> 16)}${hex4(d1 & 0xffff)}-${hex4(d2)}-${hex4(d3)}-${hex2(d4)}${hex2(d5)}-${rest}}`;
}

/**
 * The UnBinary state machine — decodes LIT's compact binary HTML into a real
 * HTML string. Ported from calibre's `UnBinary.binary_to_text_inner`.
 */
export function unbinToHtml(bin: Uint8Array): string {
  let out = "";
  // Frames track the tag/attr parse state across the stack, like calibre's
  // (depth, tag_name, current_map, …, state, flags) tuples.
  type Frame = {
    depth: number;
    tagName: string | null;
    currentMap: Record<number, string> | null;
    isGoingDown: boolean;
    state: string;
    flags?: number;
    skipValue?: boolean;
    valueCount?: number;
    href?: string;
    hrefCount?: number;
  };
  const stack: Frame[] = [{ depth: 0, tagName: null, currentMap: null, isGoingDown: false, state: "text" }];
  let pos = 0;

  const write = (s: string): void => {
    out += s;
  };

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const { depth } = frame;
    if (frame.state === "close tag") {
      if (!frame.tagName) throw new Error("LIT tag ends before it begins.");
      write(`</${frame.tagName}>`);
      frame.tagName = null;
      frame.state = "text";
      continue;
    }

    if (pos >= bin.length) break;
    let [c, next] = readUtf8Char(bin, pos);
    pos = next;
    const oc = c.codePointAt(0)!;
    let state = frame.state;

    if (state === "text") {
      if (oc === 0) {
        frame.state = "get flags";
      } else if (c === "\v") {
        write("\n");
      } else if (c === ">") {
        write(">>");
      } else if (c === "<") {
        write("<<");
      } else {
        write(c);
      }
      continue;
    }

    if (state === "get flags") {
      frame.state = oc === 0 ? "text" : "get tag";
      if (oc !== 0) {
        frame.flags = oc;
      }
      continue;
    }

    if (state === "get tag") {
      frame.state = oc === 0 ? "text" : "get attr";
      const flags = frame.flags ?? 0;
      if (flags & FLAG_OPENING) {
        const tag = oc;
        write("<");
        if (!(flags & FLAG_CLOSING)) frame.isGoingDown = true;
        const tagName = LIT_TAGS[tag];
        if (tagName) {
          frame.tagName = tagName;
          frame.currentMap = LIT_TAGS_ATTRS[tag] ?? null;
          write(tagName);
        } else {
          // Unknown tag code — write a placeholder, keep the stream aligned.
          frame.tagName = `?${String.fromCharCode(tag)}?`;
          frame.currentMap = null;
          write(frame.tagName);
        }
      } else if (flags & FLAG_CLOSING) {
        if (depth === 0) throw new Error("LIT closing tag without an opening tag.");
        stack.pop();
      }
      continue;
    }

    if (state === "get attr") {
      if (oc === 0) {
        // End of this tag's attributes.
        if (!frame.isGoingDown) write(" />");
        else write(">");
        frame.state = "close tag";
        stack.push({ depth: depth + 1, tagName: null, currentMap: null, isGoingDown: false, state: "text" });
        continue;
      }
      let attr: string | undefined;
      if (frame.currentMap && frame.currentMap[oc]) attr = frame.currentMap[oc];
      if (!attr && LIT_ATTRS0[oc]) attr = LIT_ATTRS0[oc];
      if (!attr) {
        // Unknown attribute code — skip the value silently to stay aligned.
        frame.state = "get value length";
        frame.skipValue = true;
        continue;
      }
      write(` ${attr}=`);
      frame.state = attr === "href" || attr === "src" ? "get href length" : "get value length";
      continue;
    }

    if (state === "get value length") {
      if (!frame.skipValue) write('"');
      const count = oc - 1;
      if (count === 0) {
        if (!frame.skipValue) write('"');
        frame.skipValue = false;
        frame.state = "get attr";
        continue;
      }
      frame.valueCount = count;
      frame.state = "get value";
      if (oc === 0xffff) continue;
      continue;
    }

    if (state === "get value") {
      const count = frame.valueCount ?? 0;
      if (count === 0xfffe) {
        if (!frame.skipValue) write(`${oc - 1}"`);
        frame.skipValue = false;
        frame.state = "get attr";
        continue;
      }
      if (count > 0) {
        if (!frame.skipValue) {
          if (c === '"') c = "&quot;";
          else if (c === "<") c = "&lt;";
          write(c);
        }
        frame.valueCount = count - 1;
        if (count - 1 === 0) {
          if (!frame.skipValue) write('"');
          frame.skipValue = false;
          frame.state = "get attr";
        }
      }
      continue;
    }

    if (state === "get href length") {
      frame.href = "";
      frame.hrefCount = oc - 1;
      frame.state = "get href";
      continue;
    }

    if (state === "get href") {
      frame.href = (frame.href ?? "") + c;
      frame.hrefCount = (frame.hrefCount ?? 1) - 1;
      if (frame.hrefCount === 0) {
        // calibre strips the first char (a format sentinel) before resolving
        // the internal id — we write the stripped value verbatim since the
        // ids aren't resolvable inside a single rendered document.
        write(`"${(frame.href ?? "").slice(1)}"`);
        frame.state = "get attr";
      }
      continue;
    }
  }

  // escape_reserved: make stray angle brackets / ampersands well-formed.
  return out
    .replace(/&(?!(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z_:][a-zA-Z0-9.-_:]*);)/g, "&amp;")
    .replace(/<<(?!--)/g, "&lt;")
    .replace(/(?<!--)>>(?=>>|[^>])/g, "&gt;")
    .replace(/([<>])\1/g, "$1");
}

class LitFile {
  private bytes: Uint8Array;
  private entries: Record<string, LitEntry> = {};
  private sectionNames: string[] = [];
  private sectionData: (Uint8Array | null)[] = [];
  private manifest: LitManifestItem[] = [];
  private spine: LitManifestItem[] = [];
  private contentOffset = -1;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    if (bytes.length < 64 || utf8(bytes.subarray(0, 8)) !== "ITOLITLS") {
      throw new Error("This is not a Microsoft Reader (.lit) file.");
    }
    const version = u32le(bytes, 8);
    if (version !== 1) throw new Error(`Unknown LIT version ${version}.`);
    this.readSecondaryHeader();
    this.readHeaderPieces();
    this.readSectionNames();
    this.readManifest();
  }

  private readSecondaryHeader(): void {
    const b = this.bytes;
    const hdrLen = i32le(b, 12);
    const numPieces = i32le(b, 16);
    const secHdrLen = i32le(b, 20);
    const secStart = hdrLen + numPieces * 16;
    if (secStart < 0 || secStart + secHdrLen > b.length) throw new Error("This LIT file is truncated.");
    const sec = b.subarray(secStart, secStart + secHdrLen);
    let offset = i32le(sec, 4);
    while (offset >= 0 && offset + 8 <= sec.length) {
      const blockType = utf8(sec.subarray(offset, offset + 4));
      const blockVer = u32le(sec, offset + 4);
      if (blockType === "CAOL") {
        if (blockVer !== 2) throw new Error(`Unknown LIT CAOL block format ${blockVer}.`);
        offset += 48;
      } else if (blockType === "ITSF") {
        if (blockVer !== 4) throw new Error(`Unknown LIT ITSF block format ${blockVer}.`);
        if (u32le(sec, offset + 20) !== 0) throw new Error("This LIT file has a 64-bit content offset.");
        this.contentOffset = u32le(sec, offset + 16);
        offset += 48;
      } else {
        break;
      }
    }
    if (this.contentOffset < 0) throw new Error("Could not find the LIT content offset.");
  }

  private readHeaderPieces(): void {
    const b = this.bytes;
    const hdrLen = i32le(b, 12);
    const numPieces = i32le(b, 16);
    const secHdrLen = i32le(b, 20);
    const secStart = hdrLen + numPieces * 16;
    const pieceTableStart = hdrLen;
    for (let i = 0; i < numPieces; i++) {
      const at = pieceTableStart + i * 16;
      if (at + 16 > secStart) break;
      if (u32le(b, at + 4) !== 0 || u32le(b, at + 12) !== 0) {
        throw new Error(`LIT piece ${i} has a 64-bit value.`);
      }
      const offset = u32le(b, at);
      const size = i32le(b, at + 8);
      if (offset < 0 || offset + size > b.length) continue;
      const piece = b.subarray(offset, offset + size);
      if (i === 0) continue;
      if (i === 1) this.readDirectory(piece);
      // Pieces 2-4 carry the count blobs and GUIDs — not needed for reading.
    }
    void secHdrLen;
  }

  private readDirectory(piece: Uint8Array): void {
    if (utf8(piece.subarray(0, 4)) !== "IFCM") {
      throw new Error("LIT header piece #1 is not the main directory.");
    }
    const chunkSize = i32le(piece, 8);
    const numChunks = i32le(piece, 24);
    if (chunkSize <= 0 || chunkSize > 65536 || numChunks <= 0 || 32 + numChunks * chunkSize !== piece.length) {
      throw new Error("LIT IFCM header has an incorrect length.");
    }
    for (let i = 0; i < numChunks; i++) {
      const at = 32 + i * chunkSize;
      const chunk = piece.subarray(at, at + chunkSize);
      if (utf8(chunk.subarray(0, 4)) !== "AOLL") continue;
      let remaining = chunkSize - (i32le(chunk, 4) + 48);
      let entries = u16le(chunk, chunkSize - 2);
      if (entries === 0) entries = 0xffff;
      const p = { i: 44 };
      const end = chunkSize - 4;
      for (let j = 0; j < entries; j++) {
        if (remaining <= 0) break;
        const nameLen = readEncint(chunk, p, end);
        if (nameLen > end - p.i) break;
        const name = utf8(chunk.subarray(p.i, p.i + nameLen));
        p.i += nameLen;
        remaining -= nameLen;
        const section = readEncint(chunk, p, end);
        const offset = readEncint(chunk, p, end);
        const size = readEncint(chunk, p, end);
        if (name.length >= 2) this.entries[name] = { name, section, offset, size };
        // The remaining-count bookkeeping doesn't need to be exact — the
        // per-entry end guard stops us before reading past the chunk.
      }
    }
  }

  private readSectionNames(): void {
    const raw = this.getFile("::DataSpace/NameList");
    if (!raw || raw.length < 4) throw new Error("This LIT file has no valid NameList.");
    const numSections = u16le(raw, 2);
    let pos = 4;
    const names: string[] = [];
    for (let s = 0; s < numSections && pos + 2 <= raw.length; s++) {
      const size = u16le(raw, pos);
      pos += 2;
      const byteLen = size * 2 + 2;
      if (pos + byteLen > raw.length) break;
      names.push(new TextDecoder("utf-16le").decode(raw.subarray(pos, pos + size * 2)).replace(/\0+$/, ""));
      pos += byteLen;
    }
    this.sectionNames = names;
    this.sectionData = names.map(() => null);
  }

  private readManifest(): void {
    const raw = this.getFile("/manifest");
    if (!raw) throw new Error("This LIT file has no valid manifest.");
    let pos = 0;
    const items: LitManifestItem[] = [];
    while (pos < raw.length) {
      const slen = raw[pos]!;
      pos += 1;
      if (slen === 0) break;
      if (pos + slen > raw.length) break;
      pos += slen; // root name — not needed for reading the spine
      for (const state of ["spine", "not spine", "css", "images"]) {
        if (pos + 4 > raw.length) break;
        const numFiles = i32le(raw, pos);
        pos += 4;
        for (let i = 0; i < numFiles; i++) {
          if (pos + 4 > raw.length) break;
          pos += 4; // offset
          const internal = this.consumeString(raw, pos);
          pos = internal.next;
          const original = this.consumeString(raw, pos);
          pos = original.next;
          const mime = this.consumeString(raw, pos, true);
          pos = mime.next;
          items.push({ internal: internal.value, original: original.value, mime: mime.value, state });
        }
      }
    }
    this.manifest = items;
    this.spine = items.filter((i) => i.state === "spine");
  }

  private consumeString(raw: Uint8Array, pos: number, zpad = false): { value: string; next: number } {
    if (pos >= raw.length) return { value: "", next: pos };
    const len = raw[pos]!;
    pos += 1;
    let value = "";
    let chars = 0;
    while (chars < len && pos < raw.length) {
      const [ch, next] = readUtf8Char(raw, pos);
      value += ch;
      pos = next;
      chars += 1;
    }
    if (zpad && pos < raw.length && raw[pos] === 0) pos += 1;
    return { value, next: pos };
  }

  private getFile(name: string): Uint8Array | null {
    const entry = this.entries[name];
    if (!entry) return null;
    if (entry.section === 0) {
      const at = this.contentOffset + entry.offset;
      if (at < 0 || at + entry.size > this.bytes.length) return null;
      return this.bytes.subarray(at, at + entry.size);
    }
    const section = this.getSection(entry.section);
    if (!section || entry.offset + entry.size > section.length) return null;
    return section.subarray(entry.offset, entry.offset + entry.size);
  }

  private getSection(section: number): Uint8Array | null {
    if (section < 0 || section >= this.sectionData.length) return null;
    if (this.sectionData[section]) return this.sectionData[section]!;
    const data = this.getSectionUncached(section);
    this.sectionData[section] = data;
    return data;
  }

  private getSectionUncached(section: number): Uint8Array | null {
    const name = this.sectionNames[section];
    if (!name) return null;
    const path = `::DataSpace/Storage/${name}`;

    // DRM'd books carry a DRMStorage tree — refuse them honestly.
    for (const key of [
      "/DRMStorage/Licenses/EUL",
      "/DRMStorage/DRMBookplate",
      "/DRMStorage/DRMSealed"
    ]) {
      if (this.entries[key]) {
        throw new Error("DRM-protected LIT books can't be read locally.");
      }
    }

    let transform = this.getFile(`${path}/Transform/List`);
    let content = this.getFile(`${path}/Content`);
    let control = this.getFile(`${path}/ControlData`);
    if (!transform || !content || !control) {
      throw new Error(`This LIT storage section (${name}) is corrupt.`);
    }
    while (transform.length >= 16) {
      const csize = (i32le(control, 0) + 1) * 4;
      const guid = msguid(transform.subarray(0, 16));
      if (guid === DESENCRYPT_GUID) {
        throw new Error("DRM-protected LIT books can't be read locally.");
      }
      if (guid === LZXCOMPRESS_GUID) {
        const resetTable = this.getFile(
          `${path}/Transform/${LZXCOMPRESS_GUID}/InstanceData/ResetTable`
        );
        if (!resetTable) throw new Error("This LIT file has no LZX reset table.");
        content = this.decompress(content, control, resetTable);
      } else {
        throw new Error(`Unrecognized LIT transform: ${guid}.`);
      }
      transform = transform.subarray(16);
      if (csize > 0 && csize <= control.length) control = control.subarray(csize);
    }
    return content;
  }

  /** LZX decompression with the LIT reset table (one window per entry). */
  private decompress(content: Uint8Array, control: Uint8Array, resetTable: Uint8Array): Uint8Array {
    if (control.length < 32 || utf8(control.subarray(4, 8)) !== "LZXC") {
      throw new Error("Invalid LIT ControlData tag value.");
    }
    if (resetTable.length < 40) throw new Error("The LIT reset table is too short.");
    if (u32le(resetTable, 20) !== 0) throw new Error("The LIT reset table has a 64-bit value.");

    let windowBits = 14;
    let u = u32le(control, 12);
    while (u > 0) {
      u >>>= 1;
      windowBits += 1;
    }
    if (windowBits < 15 || windowBits > 21) throw new Error("Invalid LIT LZX window.");

    const uclength = i32le(resetTable, 16);
    if (uclength <= 0 || uclength > 0x7fffff) {
      throw new Error("This LIT book's content is too large to read locally.");
    }
    const windowBytes = 1 << windowBits;
    let ofsEntry = i32le(resetTable, 12) + 8;
    let bytesRemaining = uclength;
    let base = 0;
    const chunks: Uint8Array[] = [];

    // One entry per full window; the final partial window has no entry.
    while (ofsEntry >= 0 && ofsEntry + 8 <= resetTable.length && bytesRemaining >= windowBytes) {
      const size = i32le(resetTable, ofsEntry);
      if (size > content.length) break;
      try {
        chunks.push(
          lzxDecompress(content.subarray(base, size), {
            windowBits,
            resetIntervalFrames: 0,
            outputLength: windowBytes
          })
        );
      } catch {
        // A damaged chunk shouldn't kill the whole book — skip it (the
        // same warn-and-continue rule calibre applies).
      }
      bytesRemaining -= windowBytes;
      base = size;
      ofsEntry += 8;
    }

    if (bytesRemaining > 0 && base < content.length) {
      try {
        chunks.push(
          lzxDecompress(content.subarray(base), {
            windowBits,
            resetIntervalFrames: 0,
            outputLength: bytesRemaining
          })
        );
        bytesRemaining = 0;
      } catch {
        // fall through — if every chunk failed, throw below
      }
    }
    if (bytesRemaining > 0) {
      throw new Error("Failed to fully decompress this LIT book's content.");
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }

  /** The spine pages, in order, decoded from their binary HTML streams. */
  readSpineHtml(): string {
    const pages: string[] = [];
    for (const item of this.spine) {
      const raw = this.getFile(`/data/${item.internal}/content`);
      if (!raw || raw.length === 0) continue;
      try {
        pages.push(unbinToHtml(raw));
      } catch {
        // A damaged page shouldn't kill the whole book.
      }
    }
    if (pages.length === 0) {
      throw new Error("This LIT book has no readable content pages.");
    }
    return pages.join("\n");
  }
}

/** Extracts the book's HTML from a .lit file (DRM-free only). */
export function litToHtml(bytes: Uint8Array): string {
  return new LitFile(bytes).readSpineHtml();
}

/** Extracts the book's plain text (HTML stripped downstream by callers). */
export function litToText(bytes: Uint8Array): string {
  return litToHtml(bytes);
}
