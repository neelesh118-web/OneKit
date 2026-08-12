/**
 * Windows metafile readers — Enhanced Metafile (EMF) and the older WMF —
 * with a deliberately small, honest subset. The record types that make up
 * the majority of real-world drawings (rectangles, ellipses, polylines,
 * polygons, moves/lines, and the text-out records) render to SVG; every
 * text record feeds the text extraction. Records outside the subset are
 * skipped, so a complex drawing yields a partial — but real — SVG rather
 * than a fabricated one. Files with no readable records throw the same
 * honest error as the other binary readers.
 *
 * Reference: MS-EMF / MS-WMF (Windows Metafile Format specifications).
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colorToHex(color: number): string {
  // Windows colors are 0x00RRGGBB.
  return `#${((color & 0xffffff) | 0x1000000).toString(16).slice(1)}`;
}

/* EMF ------------------------------------------------------------------ */

/* Record types (MS-EMF 2.1.1). */
const EMR_HEADER = 0x00000001;
const EMR_SETBKMODE = 0x00000012;
const EMR_SETTEXTCOLOR = 0x00000024;
const EMR_MOVETOEX = 0x0000001b;
const EMR_LINETO = 0x00000036;
const EMR_ELLIPSE = 0x0000002a;
const EMR_RECTANGLE = 0x0000002b;
const EMR_POLYLINE = 0x00000035;
const EMR_POLYGON = 0x00000037;
const EMR_EXTTEXTOUTW = 0x00000054;

interface EmfRecord {
  type: number;
  data: Uint8Array;
}

function emfRecords(bytes: Uint8Array): EmfRecord[] {
  const records: EmfRecord[] = [];
  let off = 0;
  while (off + 8 <= bytes.length && records.length < 200000) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + off);
    const type = dv.getUint32(0, true);
    const size = dv.getUint32(4, true);
    if (size < 8 || off + size > bytes.length) break;
    records.push({ type, data: bytes.subarray(off + 8, off + size) });
    off += size;
  }
  return records;
}

/** The drawing's bounding box from the EMR_HEADER record, if present. */
function emfBounds(records: EmfRecord[]): [number, number, number, number] | null {
  for (const record of records) {
    if (record.type !== EMR_HEADER || record.data.length < 16) continue;
    const dv = new DataView(record.data.buffer, record.data.byteOffset);
    const left = dv.getInt32(0, true);
    const top = dv.getInt32(4, true);
    const right = dv.getInt32(8, true);
    const bottom = dv.getInt32(12, true);
    if (right > left && bottom > top) return [left, top, right, bottom];
  }
  return null;
}

/** EMF → SVG for the supported record subset. */
export function emfToSvg(bytes: Uint8Array): string {
  const records = emfRecords(bytes);
  if (records.length === 0) throw new Error("Couldn't read this .emf file — it may be corrupt or empty.");
  const bounds = emfBounds(records) ?? [0, 0, 1000, 1000];
  const shapes: string[] = [];
  const texts: string[] = [];
  let color = "#000000";
  let penX = 0;
  let penY = 0;
  for (const record of records) {
    const dv = new DataView(record.data.buffer, record.data.byteOffset);
    switch (record.type) {
      case EMR_SETTEXTCOLOR:
        if (record.data.length >= 4) color = colorToHex(dv.getUint32(0, true));
        break;
      case EMR_MOVETOEX:
        if (record.data.length >= 8) {
          penX = dv.getInt32(0, true);
          penY = dv.getInt32(4, true);
        }
        break;
      case EMR_LINETO:
        if (record.data.length >= 8) {
          const x = dv.getInt32(0, true);
          const y = dv.getInt32(4, true);
          shapes.push(`<line x1="${penX}" y1="${penY}" x2="${x}" y2="${y}" stroke="${color}" fill="none"/>`);
          penX = x;
          penY = y;
        }
        break;
      case EMR_RECTANGLE:
      case EMR_ELLIPSE: {
        if (record.data.length < 20) break;
        const left = dv.getInt32(0, true);
        const top = dv.getInt32(4, true);
        const right = dv.getInt32(8, true);
        const bottom = dv.getInt32(12, true);
        const fill = colorToHex(dv.getUint32(16, true));
        if (record.type === EMR_RECTANGLE) {
          shapes.push(
            `<rect x="${Math.min(left, right)}" y="${Math.min(top, bottom)}" width="${Math.abs(right - left)}" height="${Math.abs(bottom - top)}" fill="none" stroke="${fill}"/>`
          );
        } else {
          shapes.push(
            `<ellipse cx="${(left + right) / 2}" cy="${(top + bottom) / 2}" rx="${Math.abs(right - left) / 2}" ry="${Math.abs(bottom - top) / 2}" fill="none" stroke="${fill}"/>`
          );
        }
        break;
      }
      case EMR_POLYLINE:
      case EMR_POLYGON: {
        if (record.data.length < 20) break;
        const count = dv.getUint32(16, true);
        if (count === 0 || count > 100000 || 20 + count * 8 > record.data.length) break;
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
          const x = dv.getInt32(20 + i * 8, true);
          const y = dv.getInt32(24 + i * 8, true);
          parts.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
        }
        if (record.type === EMR_POLYGON) parts.push("Z");
        shapes.push(`<path d="${parts.join(" ")}" stroke="${color}" fill="none"/>`);
        break;
      }
      case EMR_EXTTEXTOUTW: {
        // EMRTEXT structure starts at offset 28 of the record payload.
        const emt = 28;
        if (record.data.length < emt + 20) break;
        const nChars = dv.getUint32(emt + 8, true);
        const offString = dv.getUint32(emt + 12, true);
        if (nChars === 0 || nChars > 100000) break;
        const start = emt + offString;
        if (start + nChars * 2 > record.data.length) break;
        const chars = new Uint16Array(record.data.buffer, record.data.byteOffset + start, nChars);
        const text = String.fromCharCode(...chars);
        const x = dv.getInt32(emt, true);
        const y = dv.getInt32(emt + 4, true);
        if (text.trim()) {
          texts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="12">${escapeHtml(text)}</text>`);
        }
        break;
      }
      default:
        break;
    }
  }
  if (shapes.length === 0 && texts.length === 0) {
    throw new Error("This .emf file has no supported records (only text/shape records can be read locally).");
  }
  const [left, top, right, bottom] = bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${right - left} ${bottom - top}" width="${right - left}" height="${bottom - top}">\n${[...shapes, ...texts].join("\n")}\n</svg>`;
}

/** EMF → plain text: every EXTTEXTOUTW string. */
export function emfToText(bytes: Uint8Array): string {
  const records = emfRecords(bytes);
  const lines: string[] = [];
  for (const record of records) {
    if (record.type !== EMR_EXTTEXTOUTW) continue;
    const dv = new DataView(record.data.buffer, record.data.byteOffset);
    const emt = 28;
    if (record.data.length < emt + 20) continue;
    const nChars = dv.getUint32(emt + 8, true);
    const offString = dv.getUint32(emt + 12, true);
    if (nChars === 0 || nChars > 100000) continue;
    const start = emt + offString;
    if (start + nChars * 2 > record.data.length) continue;
    const chars = new Uint16Array(record.data.buffer, record.data.byteOffset + start, nChars);
    const text = String.fromCharCode(...chars).trim();
    if (text) lines.push(text);
  }
  if (lines.length === 0) throw new Error("This .emf file carries no readable text.");
  return lines.join("\n");
}

/* WMF ------------------------------------------------------------------ */

/* Function numbers (MS-WMF 2.1.1). */
const META_HEADER = 0x0001;
const META_SETTEXTCOLOR = 0x0209;
const META_MOVETO = 0x0214;
const META_LINETO = 0x0213;
const META_POLYGON = 0x0324;
const META_POLYLINE = 0x0325;
const META_ELLIPSE = 0x0418;
const META_RECTANGLE = 0x041b;
const META_TEXTOUT = 0x0521;
const META_EXTTEXTOUT = 0x0a32;

interface WmfRecord {
  fn: number;
  data: Uint8Array;
}

function wmfRecords(bytes: Uint8Array): { records: WmfRecord[]; bounds: [number, number, number, number] | null } {
  let off = 0;
  let bounds: [number, number, number, number] | null = null;
  const dv0 = new DataView(bytes.buffer, bytes.byteOffset);
  // Placeable header: 0x9AC6CDD7 key (4 bytes), Handle @4, then
  // Left/Top/Right/Bottom at 6/8/10/12 in 1/1440-inch units.
  if (bytes.length >= 22 && dv0.getUint32(0, true) === 0x9ac6cdd7) {
    bounds = [dv0.getInt16(6, true), dv0.getInt16(8, true), dv0.getInt16(10, true), dv0.getInt16(12, true)];
    off = 22;
  }
  const records: WmfRecord[] = [];
  while (off + 6 <= bytes.length && records.length < 200000) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + off);
    const sizeWords = dv.getUint32(0, true);
    const fn = dv.getUint16(4, true);
    const sizeBytes = sizeWords * 2;
    if (sizeBytes < 6 || off + sizeBytes > bytes.length) break;
    records.push({ fn, data: bytes.subarray(off + 6, off + sizeBytes) });
    off += sizeBytes;
  }
  return { records, bounds };
}

/** WMF → SVG for the supported record subset. */
export function wmfToSvg(bytes: Uint8Array): string {
  const { records, bounds } = wmfRecords(bytes);
  if (records.length === 0) throw new Error("Couldn't read this .wmf file — it may be corrupt or empty.");
  const shapes: string[] = [];
  const texts: string[] = [];
  let color = "#000000";
  for (const record of records) {
    const dv = new DataView(record.data.buffer, record.data.byteOffset);
    switch (record.fn) {
      case META_SETTEXTCOLOR:
        if (record.data.length >= 4) color = colorToHex(dv.getUint32(0, true));
        break;
      case META_MOVETO:
      case META_LINETO: {
        if (record.data.length < 4) break;
        // Params arrive y-then-x.
        const y = dv.getInt16(0, true);
        const x = dv.getInt16(2, true);
        if (record.fn === META_MOVETO) {
          shapes.push(`<circle cx="${x}" cy="${y}" r="1" fill="${color}"/>`);
        } else {
          const last = shapes[shapes.length - 1];
          if (last && last.startsWith("<line")) {
            const m = /x2="(-?\d+)" y2="(-?\d+)"/.exec(last);
            if (m) {
              shapes[shapes.length - 1] = `<line x1="${m[1]}" y1="${m[2]}" x2="${x}" y2="${y}" stroke="${color}" fill="none"/>`;
              break;
            }
          }
          shapes.push(`<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="${color}" fill="none"/>`);
        }
        break;
      }
      case META_RECTANGLE:
      case META_ELLIPSE: {
        if (record.data.length < 8) break;
        const bottom = dv.getInt16(0, true);
        const right = dv.getInt16(2, true);
        const top = dv.getInt16(4, true);
        const left = dv.getInt16(6, true);
        if (record.fn === META_RECTANGLE) {
          shapes.push(
            `<rect x="${Math.min(left, right)}" y="${Math.min(top, bottom)}" width="${Math.abs(right - left)}" height="${Math.abs(bottom - top)}" fill="none" stroke="${color}"/>`
          );
        } else {
          shapes.push(
            `<ellipse cx="${(left + right) / 2}" cy="${(top + bottom) / 2}" rx="${Math.abs(right - left) / 2}" ry="${Math.abs(bottom - top) / 2}" fill="none" stroke="${color}"/>`
          );
        }
        break;
      }
      case META_POLYGON:
      case META_POLYLINE: {
        if (record.data.length < 2) break;
        const count = dv.getUint16(0, true);
        if (count === 0 || count > 100000 || 2 + count * 4 > record.data.length) break;
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
          const x = dv.getInt16(2 + i * 4, true);
          const y = dv.getInt16(4 + i * 4, true);
          parts.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
        }
        if (record.fn === META_POLYGON) parts.push("Z");
        shapes.push(`<path d="${parts.join(" ")}" stroke="${color}" fill="none"/>`);
        break;
      }
      case META_TEXTOUT: {
        if (record.data.length < 6) break;
        const y = dv.getInt16(0, true);
        const x = dv.getInt16(2, true);
        const count = dv.getUint16(4, true);
        if (count === 0 || 6 + count > record.data.length) break;
        const text = latin1(record.data.subarray(6, 6 + count)).trim();
        if (text) texts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="12">${escapeHtml(text)}</text>`);
        break;
      }
      case META_EXTTEXTOUT: {
        if (record.data.length < 14) break;
        const y = dv.getInt16(0, true);
        const x = dv.getInt16(2, true);
        const countField = dv.getUint16(4, true);
        const wide = (countField & 0x8000) !== 0;
        const count = countField & 0x7fff;
        // Options (2) + rectangle (8) precede the string.
        const stringStart = 14;
        if (count === 0) break;
        let text: string;
        if (wide) {
          if (stringStart + count * 2 > record.data.length) break;
          const chars = new Uint16Array(record.data.buffer, record.data.byteOffset + stringStart, count);
          text = String.fromCharCode(...chars);
        } else {
          if (stringStart + count > record.data.length) break;
          text = latin1(record.data.subarray(stringStart, stringStart + count));
        }
        text = text.trim();
        if (text) texts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="12">${escapeHtml(text)}</text>`);
        break;
      }
      default:
        break;
    }
  }
  if (shapes.length === 0 && texts.length === 0) {
    throw new Error("This .wmf file has no supported records (only text/shape records can be read locally).");
  }
  const [left, top, right, bottom] = bounds ?? [0, 0, 1000, 1000];
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}">\n${[...shapes, ...texts].join("\n")}\n</svg>`;
}

/** WMF → plain text: every TEXTOUT / EXTTEXTOUT string. */
export function wmfToText(bytes: Uint8Array): string {
  const { records } = wmfRecords(bytes);
  const lines: string[] = [];
  for (const record of records) {
    const dv = new DataView(record.data.buffer, record.data.byteOffset);
    if (record.fn === META_TEXTOUT) {
      if (record.data.length < 6) continue;
      const count = dv.getUint16(4, true);
      if (count === 0 || 6 + count > record.data.length) continue;
      const text = latin1(record.data.subarray(6, 6 + count)).trim();
      if (text) lines.push(text);
    } else if (record.fn === META_EXTTEXTOUT) {
      if (record.data.length < 14) continue;
      const countField = dv.getUint16(4, true);
      const wide = (countField & 0x8000) !== 0;
      const count = countField & 0x7fff;
      if (count === 0) continue;
      const start = 14;
      let text: string;
      if (wide) {
        if (start + count * 2 > record.data.length) continue;
        const chars = new Uint16Array(record.data.buffer, record.data.byteOffset + start, count);
        text = String.fromCharCode(...chars);
      } else {
        if (start + count > record.data.length) continue;
        text = latin1(record.data.subarray(start, start + count));
      }
      text = text.trim();
      if (text) lines.push(text);
    }
  }
  if (lines.length === 0) throw new Error("This .wmf file carries no readable text.");
  return lines.join("\n");
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}
