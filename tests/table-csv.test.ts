// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { gridToCsv, listTables, tableToCsv, tableToGrid } from "../src/core/table-csv";

function makeTable(html: string): HTMLTableElement {
  const table = document.createElement("table");
  table.innerHTML = html;
  return table;
}

describe("table → csv", () => {
  it("extracts a simple table grid", () => {
    const table = makeTable("<tr><td>Name</td><td>Age</td></tr><tr><td>Alice</td><td>30</td></tr>");
    const grid = tableToGrid(table);
    expect(grid).toEqual([
      ["Name", "Age"],
      ["Alice", "30"]
    ]);
  });

  it("handles colSpan by repeating the value", () => {
    const table = makeTable('<tr><td colspan="2">Wide</td></tr><tr><td>A</td><td>B</td></tr>');
    const grid = tableToGrid(table);
    expect(grid[0]).toEqual(["Wide", "Wide"]);
    expect(grid[1]).toEqual(["A", "B"]);
  });

  it("renders proper quoted CSV", () => {
    expect(gridToCsv([["a", 'b"c'], ["d", "e,f"]])).toBe('"a","b""c"\n"d","e,f"');
  });

  it("round-trips a full table", () => {
    const table = makeTable("<tr><th>H1</th><th>H2</th></tr><tr><td>1</td><td>2</td></tr>");
    expect(tableToCsv(table)).toBe('"H1","H2"\n"1","2"');
  });

  it("lists tables with size hints", () => {
    document.body.innerHTML = "<table id='t1'><tr><td>x</td><td>y</td></tr></table><table id='t2'><tr><td>a</td></tr></table>";
    const tables = listTables(document.body);
    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({ rows: 1, cols: 2 });
  });
});
