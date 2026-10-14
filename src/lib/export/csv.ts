/**
 * CSV serialisation (RFC 4180) for the admin data export. Pure: no I/O, safe to unit test.
 *
 * - Fields containing a comma, double quote, CR or LF are wrapped in double quotes; quotes are doubled.
 * - `null` / `undefined` become empty fields, Dates become ISO 8601 (UTC) strings, objects and arrays
 *   become JSON strings, everything else uses `String()`.
 * - Records end with CRLF, as the RFC specifies.
 */

/** UTF-8 byte order mark. Excel needs it to open a UTF-8 CSV with the right encoding. */
export const CSV_BOM = '﻿';

const RECORD_SEPARATOR = '\r\n';
const NEEDS_QUOTING = /[",\r\n]/;
const ROWS_PER_CHUNK = 500;

export interface CsvOptions {
  /** Prefix the output with a UTF-8 byte order mark. Default false. */
  bom?: boolean;
}

type CsvRow = Record<string, unknown>;

/** Render one value as a single CSV field, quoting and escaping when required. */
export function csvField(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) {
    return '';
  } else if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  } else if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'object') {
    text = JSON.stringify(value) ?? '';
  } else {
    text = String(value);
  }
  // Spreadsheet formula injection: a leading = + - @ or tab/CR makes Excel evaluate the cell.
  // Numbers are already excluded (handled above), so a leading sign here is text, not a number.
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Union of the keys of all rows, in first-seen order. */
function inferColumns(rows: readonly CsvRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return [...seen];
}

function csvLine(values: readonly unknown[]): string {
  return values.map(csvField).join(',') + RECORD_SEPARATOR;
}

/**
 * The CSV as a sequence of string chunks (BOM, header, then batches of rows), so a route handler can
 * stream a large export without building one huge string. `toCsv` is this joined.
 */
export function* csvChunks(
  rows: readonly CsvRow[],
  columns?: readonly string[],
  options: CsvOptions = {},
): Generator<string, void, undefined> {
  const cols = columns ?? inferColumns(rows);
  if (options.bom) yield CSV_BOM;
  if (cols.length === 0) return;
  yield csvLine(cols);
  for (let start = 0; start < rows.length; start += ROWS_PER_CHUNK) {
    let chunk = '';
    for (const row of rows.slice(start, start + ROWS_PER_CHUNK)) {
      chunk += csvLine(cols.map((col) => row[col]));
    }
    yield chunk;
  }
}

/**
 * Serialise rows to CSV. With no `columns`, the header is the union of all row keys in first-seen
 * order; with `columns`, exactly those columns in that order (missing keys are empty, extra keys ignored).
 */
export function toCsv(
  rows: readonly CsvRow[],
  columns?: readonly string[],
  options: CsvOptions = {},
): string {
  let out = '';
  for (const chunk of csvChunks(rows, columns, options)) out += chunk;
  return out;
}
