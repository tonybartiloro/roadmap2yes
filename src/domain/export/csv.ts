/** CSV for Italian spreadsheets: `;` separator, UTF-8 BOM, CRLF, RFC 4180 quoting (plan §10). */
export const CSV_BOM = "﻿";
const SEPARATOR = ";";

export type CsvCell = string | number | null | undefined;

/**
 * Spreadsheet formula injection (OWASP): text starting with = + - @ tab or CR is prefixed with an
 * apostrophe so Excel/Sheets show it as text. Numbers are never touched.
 * Text that already starts with apostrophes followed by one of those characters (a note like
 * `'=ok`) is prefixed too, so the guard is injective and the guests import can undo it exactly
 * (one apostrophe removed from `'+` then a trigger character): `'=ok` -> `''=ok` -> `'=ok`.
 */
function neutralise(value: string): string {
  return /^'*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "number" ? String(cell) : neutralise(cell);
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Amounts are never negative (DB check), so a text cell like "-1,50" is not a case: it would get the apostrophe. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(SEPARATOR));
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}
