declare module "xlsx" {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }
  export interface WorkSheet {
    [key: string]: unknown;
  }
  export function read(data: unknown, opts: { type: "array" | "string" }): WorkBook;
  export function write(
    wb: WorkBook,
    opts: { bookType: string; type: "array" }
  ): ArrayBuffer;
  export const utils: {
    sheet_to_csv(ws: WorkSheet): string;
    sheet_to_json(ws: WorkSheet): Record<string, unknown>[];
    json_to_sheet(rows: Record<string, unknown>[]): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
  };
}
