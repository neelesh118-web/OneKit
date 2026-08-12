import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

type Point = { x: number; y: number };
type Entity =
  | { kind: "line"; from: Point; to: Point }
  | { kind: "polyline"; points: Point[]; closed: boolean }
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "arc"; center: Point; radius: number; start: number; end: number }
  | { kind: "text"; at: Point; text: string; height: number; rotation: number };

interface Group { code: number; value: string }

function number(group: Group[] | undefined, code: number, fallback = 0): number {
  const value = group?.find((item) => item.code === code)?.value;
  const parsed = value === undefined ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function groupsForAsciiDxf(text: string): Group[] {
  if (/^AutoCAD Binary DXF/i.test(text)) {
    throw new Error("Binary DXF isn't supported locally; save it as ASCII DXF first.");
  }
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const groups: Group[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index]!.trim(), 10);
    if (Number.isFinite(code)) groups.push({ code, value: lines[index + 1]!.trim() });
  }
  if (!groups.some((group) => group.code === 0 && group.value.toUpperCase() === "SECTION")) {
    throw new Error("Could not read this ASCII DXF file.");
  }
  return groups;
}

export function parseAsciiDxf(bytes: Uint8Array): Entity[] {
  const groups = groupsForAsciiDxf(new TextDecoder().decode(bytes));
  const entities: Entity[] = [];
  let inEntities = false;
  for (let index = 0; index < groups.length;) {
    const marker = groups[index]!;
    if (marker.code === 0 && marker.value.toUpperCase() === "SECTION") {
      const name = groups[index + 1];
      inEntities = name?.code === 2 && name.value.toUpperCase() === "ENTITIES";
      index += 2;
      continue;
    }
    if (marker.code === 0 && marker.value.toUpperCase() === "ENDSEC") {
      inEntities = false;
      index += 1;
      continue;
    }
    if (!inEntities || marker.code !== 0) {
      index += 1;
      continue;
    }
    const type = marker.value.toUpperCase();
    let end = index + 1;
    while (end < groups.length && groups[end]!.code !== 0) end += 1;
    const body = groups.slice(index + 1, end);
    if (type === "LINE") {
      entities.push({ kind: "line", from: { x: number(body, 10), y: number(body, 20) }, to: { x: number(body, 11), y: number(body, 21) } });
    } else if (type === "CIRCLE" && number(body, 40) > 0) {
      entities.push({ kind: "circle", center: { x: number(body, 10), y: number(body, 20) }, radius: number(body, 40) });
    } else if (type === "ARC" && number(body, 40) > 0) {
      entities.push({ kind: "arc", center: { x: number(body, 10), y: number(body, 20) }, radius: number(body, 40), start: number(body, 50), end: number(body, 51) });
    } else if (type === "TEXT" || type === "MTEXT") {
      const text = body.filter((group) => group.code === 1 || group.code === 3).map((group) => group.value).join("");
      if (text) entities.push({ kind: "text", at: { x: number(body, 10), y: number(body, 20) }, text, height: Math.max(0.1, number(body, 40, 2.5)), rotation: number(body, 50) });
    } else if (type === "LWPOLYLINE") {
      const points: Point[] = [];
      for (let cursor = 0; cursor < body.length; cursor += 1) {
        if (body[cursor]!.code !== 10) continue;
        const x = Number(body[cursor]!.value);
        const yGroup = body.slice(cursor + 1).find((group) => group.code === 20 || group.code === 10);
        if (Number.isFinite(x) && yGroup?.code === 20 && Number.isFinite(Number(yGroup.value))) points.push({ x, y: Number(yGroup.value) });
      }
      if (points.length >= 2) entities.push({ kind: "polyline", points, closed: (number(body, 70) & 1) === 1 });
    }
    index = end;
  }
  if (entities.length === 0) throw new Error("This DXF contains no supported drawing entities.");
  return entities;
}

function entityPoints(entity: Entity): Point[] {
  if (entity.kind === "line") return [entity.from, entity.to];
  if (entity.kind === "polyline") return entity.points;
  if (entity.kind === "text") return [entity.at, { x: entity.at.x + entity.text.length * entity.height * 0.6, y: entity.at.y + entity.height }];
  return [
    { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
    { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius }
  ];
}

export async function dxfToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const entities = parseAsciiDxf(bytes);
  const points = entities.flatMap(entityPoints);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 36;
  const scale = Math.min((pageWidth - margin * 2) / Math.max(1, maxX - minX), (pageHeight - margin * 2) / Math.max(1, maxY - minY));
  const map = (point: Point): Point => ({ x: margin + (point.x - minX) * scale, y: margin + (point.y - minY) * scale });
  const document = await PDFDocument.create();
  const page = document.addPage([pageWidth, pageHeight]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.08, 0.08, 0.08);
  const line = (from: Point, to: Point): void => page.drawLine({ start: map(from), end: map(to), thickness: 0.8, color: ink });
  for (const entity of entities) {
    if (entity.kind === "line") line(entity.from, entity.to);
    else if (entity.kind === "polyline") {
      for (let index = 1; index < entity.points.length; index += 1) line(entity.points[index - 1]!, entity.points[index]!);
      if (entity.closed) line(entity.points.at(-1)!, entity.points[0]!);
    } else if (entity.kind === "circle") {
      const center = map(entity.center);
      page.drawCircle({ x: center.x, y: center.y, size: entity.radius * scale, borderWidth: 0.8, borderColor: ink });
    } else if (entity.kind === "arc") {
      let end = entity.end;
      while (end <= entity.start) end += 360;
      const steps = Math.max(4, Math.ceil((end - entity.start) / 10));
      let previous: Point | undefined;
      for (let step = 0; step <= steps; step += 1) {
        const angle = (entity.start + (end - entity.start) * step / steps) * Math.PI / 180;
        const current = { x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) };
        if (previous) line(previous, current);
        previous = current;
      }
    } else {
      const at = map(entity.at);
      page.drawText(entity.text.replace(/\\P/g, " "), { x: at.x, y: at.y, size: Math.max(5, Math.min(72, entity.height * scale)), font, color: ink, rotate: degrees(entity.rotation) });
    }
  }
  return document.save();
}
