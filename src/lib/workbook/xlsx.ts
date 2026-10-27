/**
 * Minimal .xlsx reader: enough to pull cell values out of the RSE checklist workbook without a
 * spreadsheet library. An xlsx file is a zip of XML parts; we read the sheet list, the shared
 * string table and each sheet's `<c r="M10" t="s"><v>3</v></c>` cells. Formulas are ignored and
 * their cached `<v>` value is used, which is what Excel last calculated.
 */
import { unzipSync } from 'fflate';
import type { CellMap, CellValue, SheetCells } from './cells';

const decoder = new TextDecoder('utf-8');

function text(files: Record<string, Uint8Array>, path: string): string | null {
  const bytes = files[path];
  return bytes ? decoder.decode(bytes) : null;
}

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
};

export function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

/** Concatenate every <t> run inside a shared-string or inline-string item. */
function stringItemText(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += decodeXml(m[1] ?? '');
  return out;
}

function readSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(stringItemText(m[1] ?? ''));
  return out;
}

interface SheetRef {
  name: string;
  path: string;
}

function readSheetRefs(files: Record<string, Uint8Array>): SheetRef[] {
  const workbook = text(files, 'xl/workbook.xml');
  const rels = text(files, 'xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) return [];
  const targets = new Map<string, string>();
  for (const rel of rels.match(/<Relationship\s[^>]*\/>/g) ?? []) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    if (id && target) {
      const normalized = target.startsWith('/')
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, '')}`;
      targets.set(id, normalized);
    }
  }
  const out: SheetRef[] = [];
  for (const sheet of workbook.match(/<sheet\s[^>]*\/>/g) ?? []) {
    const name = attr(sheet, 'name');
    const rid = attr(sheet, 'r:id') ?? attr(sheet, 'id');
    const path = rid ? targets.get(rid) : null;
    if (name && path && files[path]) out.push({ name, path });
  }
  return out;
}

function readSheetCells(xml: string, shared: readonly string[]): CellMap {
  const cells: CellMap = new Map();
  const re = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = `<c ${m[1]}>`;
    const ref = attr(tag, 'r');
    if (!ref) continue;
    const type = attr(tag, 't');
    const inner = m[2] ?? '';
    let value: CellValue = null;
    if (type === 'inlineStr') {
      value = stringItemText(inner);
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (v) {
        const raw = decodeXml(v[1]);
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'b') value = raw === '1';
        else if (type === 'str' || type === 'e') value = raw;
        else {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : raw;
        }
      }
    }
    if (value !== null && value !== '') cells.set(ref, value);
  }
  return cells;
}

/** Every sheet in the workbook, in tab order, with its non-empty cells. Throws on a non-xlsx file. */
export function readXlsx(data: Uint8Array): SheetCells[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('This file is not an Excel workbook (.xlsx).');
  }
  const refs = readSheetRefs(files);
  if (refs.length === 0) throw new Error('No worksheets found in the workbook.');
  const shared = readSharedStrings(text(files, 'xl/sharedStrings.xml'));
  return refs.map((ref) => ({
    name: ref.name,
    cells: readSheetCells(text(files, ref.path) ?? '', shared),
  }));
}
