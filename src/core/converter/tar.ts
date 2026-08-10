/**
 * Minimal ustar TAR writer/reader. fflate dropped TAR support, so this is
 * a small, pure implementation for the converter — standard ustar headers,
 * no checksum verification on read (honest: we don't validate checksums).
 */

const BLOCK = 512;

function writeField(header: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = new TextEncoder().encode(value);
  for (let i = 0; i < Math.min(bytes.length, length); i++) {
    header[offset + i] = bytes[i]!;
  }
}

function tarHeader(name: string, size: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  writeField(h, 0, 100, name);
  writeField(h, 100, 8, "0000644\0"); // mode
  writeField(h, 108, 8, "0000000\0"); // uid
  writeField(h, 116, 8, "0000000\0"); // gid
  writeField(h, 124, 12, size.toString(8).padStart(11, "0") + "\0");
  writeField(h, 136, 12, "00000000000\0"); // mtime
  h.fill(0x20, 148, 156); // checksum field starts as spaces
  writeField(h, 156, 1, "0"); // typeflag: regular file
  writeField(h, 257, 6, "ustar\0");
  writeField(h, 263, 2, "00");
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i]!;
  writeField(h, 148, 6, sum.toString(8).padStart(6, "0"));
  h[154] = 0;
  h[155] = 0x20;
  return h;
}

export function toTar(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const [name, data] of Object.entries(files)) {
    chunks.push(tarHeader(name, data.length));
    chunks.push(data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad > 0) chunks.push(new Uint8Array(pad));
  }
  chunks.push(new Uint8Array(BLOCK * 2)); // end-of-archive marker
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function readField(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(offset, end));
}

export function fromTar(bytes: Uint8Array): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  let offset = 0;
  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break; // end-of-archive marker
    const name = readField(header, 0, 100);
    const prefix = readField(header, 345, 155);
    const typeflag = String.fromCharCode(header[156] ?? 0x30);
    const sizeStr = readField(header, 124, 12).trim();
    const size = /^[0-7]+$/.test(sizeStr) ? parseInt(sizeStr, 8) : 0;
    offset += BLOCK;
    if (typeflag === "5" || name === "") continue; // directories carry no data
    const fullName = prefix ? `${prefix}/${name}` : name;
    const data = bytes.subarray(offset, Math.min(offset + size, bytes.length));
    out[fullName] = Uint8Array.prototype.slice.call(data);
    offset += Math.ceil(size / BLOCK) * BLOCK;
    if (offset >= bytes.length) break;
  }
  return out;
}
