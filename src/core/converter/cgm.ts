/**
 * Binary Computer Graphics Metafile (CGM, ISO 8632) reader — a best-effort
 * subset in the same spirit as the EMF/WMF round. The element walker is
 * spec-correct: a class/id nibble header byte, a parameter-list length byte
 * with the 3-byte extended form, and metafile-descriptor elements that tell
 * us the VDC encoding (integer precision / real) and the character coding.
 * The TEXT / RESTRICTED TEXT / APPEND TEXT records feed the text
 * extraction, and the common primitives (polyline, polygon, rectangle,
 * circle, ellipse, text) render to a real SVG. Everything else is skipped,
 * not fabricated — a complex drawing yields a partial but honest result,
 * never a fake one.
 *
 * Reference: ISO/IEC 8632 (Computer Graphics Metafile, binary encoding).
 */

interface CgmText {
  x: number;
  y: number;
  text: string;
}

interface CgmShape {
  kind: "polyline" | "polygon" | "rect" | "circle" | "ellipse";
  pts: number[];
}

interface CgmParsed {
  text: string;
  svg: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Reads a printable, single-paragraph-sane string from the raw bytes. */
function cleanString(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 0xfeff)) out += ch;
    else if (code >= 0x20) out += " ";
  }
  return out.replace(/\s{3,}/g, "  ").trim();
}

export function cgmToText(bytes: Uint8Array): string {
  return parseCgm(bytes).text;
}

export function cgmToSvg(bytes: Uint8Array): string {
  return parseCgm(bytes).svg;
}

function parseCgm(bytes: Uint8Array): CgmParsed {
  let pos = 0;
  // CGM defaults: integer VDC at 16-bit precision, single-byte characters.
  let vdcBytes = 2;
  let vdcReal = false;
  let doubleByte = false;
  const texts: CgmText[] = [];
  const shapes: CgmShape[] = [];

  const readInt = (n: number): number => {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + pos);
    let value: number;
    if (n === 1) value = dv.getInt8(0);
    else if (n === 2) value = dv.getInt16(0, false);
    else value = dv.getInt32(0, false);
    pos += n;
    return value;
  };

  /** One VDC coordinate — a signed integer at the declared precision, or a 4-byte real. */
  const vdc = (): number => (vdcReal ? readInt(4) : readInt(vdcBytes));

  /** The trailing character string of a TEXT-family element (its last parameter). */
  const readString = (available: number): string => {
    if (available <= 0) return "";
    const b0 = bytes[pos]!;
    let len: number;
    if (b0 & 0x80) {
      if (available < 2) return "";
      len = ((b0 & 0x7f) << 8) | bytes[pos + 1]!;
      pos += 2;
      available -= 2;
    } else {
      len = b0;
      pos += 1;
      available -= 1;
    }
    len = Math.min(len, available);
    if (len <= 0) return "";
    // Extended character-set escape: 0xFE + 4-byte charset id, then the text.
    let start = pos;
    if (len >= 5 && bytes[start] === 0xfe) {
      start += 5;
      len -= 5;
    }
    if (len <= 0) return "";
    if (doubleByte) {
      const end = start + len - (len % 2);
      const units: number[] = [];
      for (let i = start; i < end; i += 2) units.push((bytes[i]! << 8) | bytes[i + 1]!);
      pos = end;
      return cleanString(String.fromCharCode(...units));
    }
    let out = "";
    for (let i = start; i < start + len; i++) out += String.fromCharCode(bytes[i]!);
    pos = start + len;
    return cleanString(out);
  };

  while (pos + 2 <= bytes.length) {
    const b0 = bytes[pos]!;
    const cls = b0 >> 4;
    const id = b0 & 0x0f;
    const b1 = bytes[pos + 1]!;
    let len: number;
    let header = 2;
    if (b1 & 0x80) {
      if (pos + 4 > bytes.length) break;
      len = ((b1 & 0x7f) << 16) | (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
      header = 4;
    } else {
      len = b1;
    }
    pos += header;
    const end = Math.min(pos + len, bytes.length);

    if (cls === 1) {
      // Metafile descriptor: keep the encoding state the primitives need.
      if (id === 3) vdcReal = (bytes[pos] ?? 0) === 1; // VDC type
      else if (id === 4 && !vdcReal) {
        // Integer precision (16/24/32) — bytes per coordinate.
        const p = (bytes[pos] ?? 0) | ((bytes[pos + 1] ?? 0) << 8);
        if (p === 16 || p === 24 || p === 32) vdcBytes = p / 8;
      } else if (id === 14) doubleByte = (bytes[pos] ?? 0) === 2; // character coding announcer
    } else if (cls === 4) {
      // Graphical primitives. Note the ids are the ISO 8632 ones: TEXT is
      // 4, RESTRICTED TEXT is 5, APPEND TEXT is 6 — RECTANGLE is 11.
      if (id === 4 || id === 5 || id === 6) {
        // TEXT family: position, final height, orientation (2 vectors),
        // restricted text adds a flag byte + extent, then the string.
        try {
          const x = vdc();
          const y = vdc();
          vdc(); // final text height
          vdc(); vdc(); vdc(); vdc(); // orientation vectors
          if (id === 5) {
            readInt(1); // restricted text flag
            vdc(); vdc(); vdc(); vdc(); // extent
          }
          const str = readString(end - pos);
          if (str) texts.push({ x, y, text: str });
        } catch {
          /* truncated element — skip */
        }
      } else if (id === 1 || id === 2) {
        // Polyline / disjoint polyline: 2+ VDC points.
        const pts: number[] = [];
        while (pos + vdcBytes * 2 <= end) {
          pts.push(vdc(), vdc());
        }
        if (pts.length >= 4) shapes.push({ kind: "polyline", pts });
      } else if (id === 7 || id === 8) {
        // Polygon / polygon set: 3+ VDC points.
        const pts: number[] = [];
        while (pos + vdcBytes * 2 <= end) {
          pts.push(vdc(), vdc());
        }
        if (pts.length >= 6) shapes.push({ kind: "polygon", pts });
      } else if (id === 11) {
        // Rectangle: two corner points.
        if (pos + vdcBytes * 4 <= end) {
          shapes.push({ kind: "rect", pts: [vdc(), vdc(), vdc(), vdc()] });
        }
      } else if (id === 12) {
        // Circle: centre + radius.
        if (pos + vdcBytes * 3 <= end) {
          shapes.push({ kind: "circle", pts: [vdc(), vdc(), vdc()] });
        }
      } else if (id === 17) {
        // Ellipse: centre + two vectors.
        if (pos + vdcBytes * 6 <= end) {
          shapes.push({ kind: "ellipse", pts: [vdc(), vdc(), vdc(), vdc(), vdc(), vdc()] });
        }
      }
    }
    pos = end; // skip any unparsed parameters of this element
  }

  const text = texts
    .map((t) => t.text)
    .filter((s) => s.length > 0)
    .join("\n");

  return { text, svg: buildSvg(shapes, texts) };
}

/** Renders the supported primitive subset into a normalized 1000×1000 SVG. */
function buildSvg(shapes: CgmShape[], texts: CgmText[]): string {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const shape of shapes) {
    for (let i = 0; i < shape.pts.length; i += 2) {
      xs.push(shape.pts[i]!);
      ys.push(shape.pts[i + 1]!);
    }
  }
  for (const t of texts) {
    xs.push(t.x);
    ys.push(t.y);
  }
  if (xs.length === 0 || ys.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"/>';
  }

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (maxX === minX) maxX += 1;
  if (maxY === minY) maxY += 1;
  const mx = (maxX - minX) * 0.05;
  const my = (maxY - minY) * 0.05;
  minX -= mx;
  maxX += mx;
  minY -= my;
  maxY += my;
  const w = maxX - minX;
  const h = maxY - minY;

  const px = (v: number): number => ((v - minX) / w) * 1000;
  const py = (v: number): number => ((v - minY) / h) * 1000;

  const parts: string[] = [];
  for (const shape of shapes) {
    if (shape.kind === "polyline" || shape.kind === "polygon") {
      let points = "";
      for (let i = 0; i < shape.pts.length; i += 2) {
        points += `${px(shape.pts[i]!).toFixed(1)},${py(shape.pts[i + 1]!).toFixed(1)} `;
      }
      if (shape.kind === "polyline") {
        parts.push(`<polyline fill="none" stroke="#333" stroke-width="2" points="${points.trim()}"/>`);
      } else {
        parts.push(`<polygon fill="#e8e8e8" stroke="#333" stroke-width="2" points="${points.trim()}"/>`);
      }
    } else if (shape.kind === "rect") {
      const x = px(shape.pts[0]!);
      const y = py(shape.pts[1]!);
      const x2 = px(shape.pts[2]!);
      const y2 = py(shape.pts[3]!);
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.abs(x2 - x).toFixed(1)}" height="${Math.abs(y2 - y).toFixed(1)}" fill="#e8e8e8" stroke="#333" stroke-width="2"/>`
      );
    } else if (shape.kind === "circle") {
      parts.push(
        `<circle cx="${px(shape.pts[0]!).toFixed(1)}" cy="${py(shape.pts[1]!).toFixed(1)}" r="${(Math.abs(shape.pts[2]!) / w * 1000).toFixed(1)}" fill="#e8e8e8" stroke="#333" stroke-width="2"/>`
      );
    } else if (shape.kind === "ellipse") {
      parts.push(
        `<ellipse cx="${px(shape.pts[0]!).toFixed(1)}" cy="${py(shape.pts[1]!).toFixed(1)}" rx="${(Math.abs(shape.pts[2]!) / w * 1000).toFixed(1)}" ry="${(Math.abs(shape.pts[4]!) / h * 1000).toFixed(1)}" fill="#e8e8e8" stroke="#333" stroke-width="2"/>`
      );
    }
  }
  for (const t of texts) {
    parts.push(
      `<text x="${px(t.x).toFixed(1)}" y="${py(t.y).toFixed(1)}" font-size="16" fill="#111">${escapeHtml(t.text)}</text>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n${parts.join("\n")}\n</svg>`;
}
