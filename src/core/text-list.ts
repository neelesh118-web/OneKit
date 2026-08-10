/**
 * Text → list utilities — split, dedupe, sort, and CSV conversion.
 * All pure local transforms; nothing leaves the device.
 */

export type ListOp = "splitLines" | "splitComma" | "dedupe" | "sort" | "reverse" | "csv";

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

export function splitAny(text: string): string[] {
  return text.split(/[\r\n,;]+/).map((l) => l.trim()).filter(Boolean);
}

export function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export function toCsv(items: string[]): string {
  const escape = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  return items.map(escape).join("\n");
}

/** Applies one operation to raw input text. */
export function applyListOp(text: string, op: ListOp): string {
  if (op === "csv") return toCsv(splitLines(text));
  if (op === "dedupe") return dedupe(splitLines(text)).join("\n");
  if (op === "sort") return [...splitLines(text)].sort((a, b) => a.localeCompare(b)).join("\n");
  if (op === "reverse") return splitLines(text).reverse().join("\n");
  if (op === "splitComma") return splitAny(text).join("\n");
  return splitLines(text).join("\n");
}
