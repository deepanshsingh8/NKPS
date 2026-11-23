// One way to parse a spreadsheet somebody uploaded.
//
// Every server route that reads an uploaded workbook goes through
// `readUntrustedWorkbook`, so the hardening options live in one place instead
// of being re-remembered at each call site. All callers read cell *values*
// through `sheet_to_json`, so none of them needs formulas, rich text, styles,
// macros or the raw zip entries — and every one of those is parser surface a
// hostile file can aim at.
//
// The size cap must be checked by the caller BEFORE `file.arrayBuffer()`:
// SheetJS needs the whole buffer in memory, so by the time this function runs
// an oversized upload has already cost what it is going to cost.

import * as XLSX from "xlsx";

/** Default ceiling for an uploaded spreadsheet. 5 MB covers a 10k-row sheet. */
export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;

const SAFE_READ_OPTS = {
  type: "array",
  // Sparse sheets are an object keyed by A1 address; a dense sheet is an array
  // of rows, which is both faster and keeps cell keys out of a plain object.
  dense: true,
  cellFormula: false,
  cellHTML: false,
  cellStyles: false,
  bookVBA: false,
  bookFiles: false,
  WTF: false,
} as const satisfies XLSX.ParsingOptions;

/**
 * The only per-caller knobs; everything else is fixed above.
 *
 * `nodim` — measure the sheet from the cells actually in it, not from the
 * "used range" the writing program declared in an .xlsx. Excel ignores that
 * declaration, so a file whose writer got it wrong opens perfectly in Excel,
 * while SheetJS trusts it and silently drops every cell outside it: a declared
 * range starting at row 2 hides the header row, and one of just "A1" hides
 * everything but the first cell. The catch is that `nodim` also makes every
 * sheet start at A1. That is right for a reader that scans for its header
 * row (and its row numbers then match Excel's), but wrong for
 * `sheet_to_json` in object mode, which takes the first row of the range as
 * the header and would take a blank top row instead. Hence opt-in.
 *
 * `raw` — stop SheetJS converting values in plain-text formats (CSV, TSV,
 * an HTML table saved as ".xls"). Binary workbooks are unaffected. See the
 * Day Book parser for why that matters for dates.
 */
export type UntrustedReadOptions = Pick<XLSX.ParsingOptions, "cellDates" | "raw" | "nodim">;

export function readUntrustedWorkbook(
  data: ArrayBuffer | Uint8Array,
  opts: UntrustedReadOptions = {},
): XLSX.WorkBook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return XLSX.read(bytes, { ...SAFE_READ_OPTS, ...opts });
}
