/**
 * Record-shaped readers added in round 17: Garmin TCX (GPS XML), dBASE
 * (DBF binary tables) and the WPL / XSPF playlist XML formats. Each yields
 * key/value records that feed the shared routeRecords pipeline (sheets,
 * documents, contacts, maps).
 */

/** Garmin TCX → trackpoint records. */
export function tcxToRecords(xml: string): Record<string, string>[] {
  const points: Record<string, string>[] = [];
  const tp = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
  for (const m of xml.matchAll(tp)) {
    const inner = m[1]!;
    const lat = /<LatitudeDegrees>([\s\S]*?)<\/LatitudeDegrees>/.exec(inner)?.[1]?.trim();
    const lon = /<LongitudeDegrees>([\s\S]*?)<\/LongitudeDegrees>/.exec(inner)?.[1]?.trim();
    if (!lat || !lon) continue;
    const rec: Record<string, string> = { lat, lon };
    const time = /<Time>([\s\S]*?)<\/Time>/.exec(inner)?.[1]?.trim();
    if (time) rec.time = time;
    const alt = /<AltitudeMeters>([\s\S]*?)<\/AltitudeMeters>/.exec(inner)?.[1]?.trim();
    if (alt) rec.alt = alt;
    const hr = /<Value>([\s\S]*?)<\/Value>/.exec(inner)?.[1]?.trim();
    if (hr) rec.hr = hr;
    points.push(rec);
  }
  if (points.length === 0) throw new Error("No track points found in this TCX file.");
  return points;
}

/** dBASE III/IV/5 table → row records (field names as keys). */
export function dbfToRecords(bytes: Uint8Array): Record<string, string>[] {
  if (bytes.length < 33) throw new Error("This DBF file is too short to read.");
  const version = bytes[0]!;
  const valid = [0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x43, 0x63, 0x83, 0x8b, 0xcb, 0xf5];
  if (!valid.includes(version)) {
    throw new Error("This file doesn't look like a dBASE table (unsupported version byte).");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordCount = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  if (headerLen < 33 || recordLen < 1 || headerLen > bytes.length) {
    throw new Error("This DBF file has an invalid header.");
  }
  const dec = new TextDecoder("latin1");
  const fields: { name: string; len: number }[] = [];
  let pos = 32;
  while (pos + 32 <= headerLen - 1) {
    const raw = dec.decode(bytes.subarray(pos, pos + 11));
    const name = raw.replace(/\0.*$/, "").trim();
    const len = bytes[pos + 16] ?? 0;
    if (!name || len < 1) break;
    fields.push({ name, len });
    pos += 32;
  }
  if (fields.length === 0) throw new Error("This DBF file has no fields to read.");
  const out: Record<string, string>[] = [];
  const max = Math.min(recordCount, 100_000);
  for (let r = 0; r < max; r++) {
    const rowStart = headerLen + r * recordLen;
    if (rowStart + recordLen > bytes.length) break;
    if (bytes[rowStart] === 0x2a) continue; // deleted record marker
    const rec: Record<string, string> = {};
    let off = rowStart + 1;
    for (const f of fields) {
      rec[f.name] = dec.decode(bytes.subarray(off, off + f.len)).trim();
      off += f.len;
    }
    out.push(rec);
  }
  return out;
}

/** Windows Media Player playlist (WPL, XML) → records. */
export function wplToRecords(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const media = /<media\b([^>]*)\/?>/g;
  for (const m of xml.matchAll(media)) {
    const src = /src="([^"]*)"/i.exec(m[1]!)?.[1] ?? "";
    if (!src) continue;
    const title = /title="([^"]*)"/i.exec(m[1]!)?.[1] ?? "";
    out.push({ title, src });
  }
  if (out.length === 0) throw new Error("No media entries found in this WPL playlist.");
  return out;
}

/** XSPF (XML Shareable Playlist) → records. */
export function xspfToRecords(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const track = /<track>([\s\S]*?)<\/track>/g;
  for (const m of xml.matchAll(track)) {
    const inner = m[1]!;
    const location = /<location>([\s\S]*?)<\/location>/.exec(inner)?.[1]?.trim() ?? "";
    const title = /<title>([\s\S]*?)<\/title>/.exec(inner)?.[1]?.trim() ?? "";
    const creator = /<creator>([\s\S]*?)<\/creator>/.exec(inner)?.[1]?.trim() ?? "";
    const album = /<album>([\s\S]*?)<\/album>/.exec(inner)?.[1]?.trim() ?? "";
    if (location || title || creator) out.push({ title, creator, album, location });
  }
  if (out.length === 0) throw new Error("No tracks found in this XSPF playlist.");
  return out;
}
