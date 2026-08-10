/**
 * Minimal type declaration for the vendored, patched SheetJS build
 * (src/vendor/xlsx.mjs — 0.20.3 from cdn.sheetjs.com, which fixes the
 * prototype-pollution and ReDoS advisories that npm's unmaintained
 * `xlsx@0.18.5` is exposed to). Covers only the API OneKit uses.
 */

export interface WorkBook {
  SheetNames: string[];
  Sheets: Record<string, WorkSheet>;
}

export interface WorkSheet {
  [cell: string]: unknown;
}

export interface SheetJSUtils {
  book_new(): WorkBook;
  book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, name?: string): void;
  json_to_sheet(data: ReadonlyArray<Record<string, unknown>>): WorkSheet;
  aoa_to_sheet(data: ReadonlyArray<ReadonlyArray<unknown>>): WorkSheet;
  sheet_to_csv(worksheet: WorkSheet): string;
  sheet_to_json<T = Record<string, unknown>>(worksheet: WorkSheet, opts?: Record<string, unknown>): T[];
}

declare const XLSX: {
  version: string;
  read(data: unknown, opts?: { type?: "array" | "string" | "base64" }): WorkBook;
  /** type:"array" yields byte data (number[] / Uint8Array / ArrayBuffer) — callers wrap it. */
  write(workbook: WorkBook, opts: { bookType: string; type: "array" }): unknown;
  utils: SheetJSUtils;
};

export default XLSX;
