/**
 * Table → CSV — turn an HTML table (or selected rows) into CSV.
 *
 * Researchers constantly copy tables from the web and get mangled tabs.
 * This extracts a table's cells in document order and produces proper
 * quoted CSV, optionally limited to the user's selection. The DOM walking
 * lives in the content script; the pure parsing/formatting is here.
 */

export interface TableCell {
  text: string;
  rowSpan: number;
  colSpan: number;
}

/** Flattens a table's <tr> rows into a cell grid (rowSpan/colSpan honored). */
export function tableToGrid(table: HTMLTableElement): string[][] {
  const rows = Array.from(table.rows);
  const grid: string[][] = [];
  for (const tr of rows) {
    const cells = Array.from(tr.cells);
    // Find the next free column in this row, honoring spans from above.
    let row: string[] = [];
    const rowIndex = grid.length;
    for (const cell of cells) {
      const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
      const rowSpan = cell.rowSpan || 1;
      const colSpan = cell.colSpan || 1;
      // Place at the first free slot.
      let col = row.length;
      while (row[col] !== undefined) col++;
      void col;
      for (let c = 0; c < colSpan; c++) row[col + c] = text;
      // Carry the span into the following rows.
      for (let r = 1; r < rowSpan; r++) {
        const targetRow = grid[rowIndex + r] ?? (grid[rowIndex + r] = []);
        for (let c = 0; c < colSpan; c++) targetRow[col + c] = text;
      }
    }
    grid[rowIndex] = row;
  }
  // Normalize ragged rows (pad short rows, trim trailing empties from the grid).
  const width = Math.max(0, ...grid.map((r) => r.length));
  return grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
}

/** Converts a string grid to proper CSV. */
export function gridToCsv(grid: string[][]): string {
  const esc = (v: string): string => `"${(v ?? "").replace(/"/g, '""')}"`;
  return grid.map((row) => row.map(esc).join(",")).join("\n");
}

/** Full pipeline: HTML table element → CSV string. */
export function tableToCsv(table: HTMLTableElement): string {
  return gridToCsv(tableToGrid(table));
}

/** Extracts the best "table-like" structure from a range selection if any. */
export function tableFromSelection(root: ParentNode): HTMLTableElement | null {
  const selection = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  const container = range.commonAncestorContainer;
  const table = container instanceof Element ? container.closest("table") : (container.parentElement?.closest("table") ?? null);
  return table;
}

/** List of every table on the page with a size hint (for a picker). */
export function listTables(root: ParentNode): Array<{ index: number; rows: number; cols: number }> {
  const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table"));
  return tables.map((table, index) => {
    const grid = tableToGrid(table);
    return { index, rows: grid.length, cols: grid[0]?.length ?? 0 };
  });
}
