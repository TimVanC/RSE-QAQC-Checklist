/**
 * Cell-level helpers shared by the xlsx and csv readers: A1 addresses, Excel date serials and a
 * small CSV parser. A "sheet" here is just a map from A1 address to a cell value.
 */
import { isIsoDate as isIsoDateGuard, type IsoDate } from '@/src/lib/time';

// Plain boolean so a failed check does not narrow a string to `never` (IsoDate is a string alias).
const isIsoDate: (value: string) => boolean = isIsoDateGuard;

export type CellValue = string | number | boolean | null;

export type CellMap = Map<string, CellValue>;

export interface SheetCells {
  name: string;
  cells: CellMap;
}

const ADDRESS_RE = /^([A-Z]{1,3})(\d{1,7})$/;

/** "M10" -> { col: 13, row: 10 } (1-based). Null when not an address. */
export function parseAddress(address: string): { col: number; row: number } | null {
  const m = ADDRESS_RE.exec(address.toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}

/** { col: 13, row: 10 } -> "M10". */
export function toAddress(col: number, row: number): string {
  let c = col;
  let letters = '';
  while (c > 0) {
    const rem = (c - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    c = Math.floor((c - 1) / 26);
  }
  return `${letters}${row}`;
}

/** Excel serial date (days since 1899-12-30, 1900 system) -> ISO date. Null when out of range. */
export function excelSerialToIsoDate(serial: number): IsoDate | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Accepts an ISO date, an Excel serial, "7-Jul-26" / "7-Jul-2026" (the workbook's d-mmm-yy
 * format), or "7/6/2026" and "07/06/26" (US month first). Null when unrecognised.
 */
export function cellToIsoDate(value: CellValue): IsoDate | null {
  if (value === null || value === '' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return excelSerialToIsoDate(value);
  const s = value.trim();
  if (isIsoDate(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && isIsoDate(s.slice(0, 10))) return s.slice(0, 10);
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToIsoDate(Number(s));
  let m = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month < 0) return null;
    return makeDate(expandYear(m[3]), month + 1, Number(m[1]));
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return makeDate(expandYear(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

function expandYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function makeDate(y: number, m: number, d: number): IsoDate | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Trimmed text of a cell; numbers and booleans are stringified; null for empty. */
export function cellToText(value: CellValue): string | null {
  if (value === null) return null;
  const s = typeof value === 'string' ? value.trim() : String(value);
  return s === '' ? null : s;
}

/**
 * Parse CSV text into cells keyed by A1 address (row 1 = first line). Handles quoted fields,
 * doubled quotes and CRLF. Numbers stay as text: the extractor decides what a cell means.
 */
export function readCsvCells(text: string): CellMap {
  const cells: CellMap = new Map();
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  let row = 1;
  let col = 1;
  let field = '';
  let quoted = false;
  const commit = () => {
    if (field !== '') cells.set(toAddress(col, row), field);
    field = '';
    col += 1;
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') commit();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      commit();
      row += 1;
      col = 1;
    } else field += ch;
  }
  if (field !== '') commit();
  return cells;
}
