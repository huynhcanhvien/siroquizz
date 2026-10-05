type Cell = string | number | null | undefined;
/** Characters that make a spreadsheet treat a cell as a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Builds a CSV document that opens correctly in Excel: UTF-8 BOM for Vietnamese and Chinese
 * text, every cell quoted, and text that would run as a formula prefixed with an apostrophe.
 */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  const cell = (value: Cell) => {
    const text = value === null || value === undefined ? "" : String(value);
    const safe = typeof value === "string" && FORMULA_START.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
