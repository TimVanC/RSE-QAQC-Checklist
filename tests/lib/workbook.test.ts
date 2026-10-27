import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CHECKLIST_STEPS, HEADER_CELLS } from '@/src/config/checklist-steps';
import {
  cellToIsoDate,
  excelSerialToIsoDate,
  parseAddress,
  readCsvCells,
  toAddress,
} from '@/src/lib/workbook/cells';
import { candidateSheets, extractChecklist, normalizeAnswerCell } from '@/src/lib/workbook/extract';
import { readXlsx } from '@/src/lib/workbook/xlsx';

/** Build a small real .xlsx (zip of XML parts) with shared and inline strings, numbers and booleans. */
function buildXlsx(sheets: Record<string, Record<string, string | number | boolean>>): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = (s: string) => {
    const i = shared.indexOf(s);
    if (i >= 0) return i;
    shared.push(s);
    return shared.length - 1;
  };
  const names = Object.keys(sheets);
  const files: Record<string, Uint8Array> = {};
  files['[Content_Types].xml'] = strToU8('<Types/>');
  files['xl/workbook.xml'] = strToU8(
    `<workbook xmlns:r="x"><sheets>${names
      .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<Relationships>${names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="ws" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('')}<Relationship Id="rIdS" Type="ss" Target="sharedStrings.xml"/></Relationships>`,
  );
  names.forEach((n, i) => {
    const cells = Object.entries(sheets[n])
      .map(([ref, v]) => {
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        if (v.startsWith('inline:'))
          return `<c r="${ref}" t="inlineStr"><is><t>${v.slice(7)}</t></is></c>`;
        return `<c r="${ref}" t="s"><v>${sharedIndex(v)}</v></c>`;
      })
      .join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<worksheet><sheetData><row r="1">${cells}</row></sheetData></worksheet>`,
    );
  });
  files['xl/sharedStrings.xml'] = strToU8(
    `<sst>${shared.map((s) => `<si><t>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`,
  );
  return zipSync(files);
}

describe('cells', () => {
  it('parses and formats A1 addresses', () => {
    expect(parseAddress('M10')).toEqual({ col: 13, row: 10 });
    expect(parseAddress('AB3')).toEqual({ col: 28, row: 3 });
    expect(parseAddress('10M')).toBeNull();
    expect(toAddress(13, 10)).toBe('M10');
    expect(toAddress(28, 3)).toBe('AB3');
  });

  it('converts Excel serials and the workbook date formats', () => {
    expect(excelSerialToIsoDate(46209)).toBe('2026-07-06');
    expect(cellToIsoDate(46209)).toBe('2026-07-06');
    expect(cellToIsoDate('6-Jul-26')).toBe('2026-07-06');
    expect(cellToIsoDate('06-July-2026')).toBe('2026-07-06');
    expect(cellToIsoDate('7/6/2026')).toBe('2026-07-06');
    expect(cellToIsoDate('2026-07-06')).toBe('2026-07-06');
    expect(cellToIsoDate('soon')).toBeNull();
    expect(cellToIsoDate('')).toBeNull();
  });

  it('reads CSV with quotes, embedded commas and CRLF', () => {
    const cells = readCsvCells('a,"b, c",\r\n"say ""hi""",,x\n');
    expect(cells.get('A1')).toBe('a');
    expect(cells.get('B1')).toBe('b, c');
    expect(cells.get('A2')).toBe('say "hi"');
    expect(cells.has('B2')).toBe(false);
    expect(cells.get('C2')).toBe('x');
  });
});

describe('readXlsx', () => {
  it('reads shared, inline, numeric and boolean cells across sheets in tab order', () => {
    const data = buildXlsx({
      Task1: { C3: 'Jane & Co', M10: 'Y', C5: 46209, F26: 'inline:7-Jul-26' },
      CALLBACK1: { M10: 'N', B1: true },
    });
    const sheets = readXlsx(data);
    expect(sheets.map((s) => s.name)).toEqual(['Task1', 'CALLBACK1']);
    expect(sheets[0].cells.get('C3')).toBe('Jane & Co');
    expect(sheets[0].cells.get('M10')).toBe('Y');
    expect(sheets[0].cells.get('C5')).toBe(46209);
    expect(sheets[0].cells.get('F26')).toBe('7-Jul-26');
    expect(sheets[1].cells.get('B1')).toBe(true);
  });

  it('rejects files that are not workbooks', () => {
    expect(() => readXlsx(strToU8('hello'))).toThrow(/not an Excel workbook/);
  });
});

describe('extractChecklist', () => {
  it('maps every answer cell and the header and step fields', () => {
    const cells = new Map<string, string | number>();
    for (const step of CHECKLIST_STEPS) cells.set(step.workbookCell, 'y');
    cells.set('M43', 'N');
    cells.set(HEADER_CELLS.customer_name, ' Jane Doe ');
    cells.set(HEADER_CELLS.project_type, 'water heater');
    cells.set(HEADER_CELLS.project_date, 46209);
    cells.set(HEADER_CELLS.notes, 'Left a note');
    cells.set('F26', '7-Jul-26');
    cells.set('I34', 'PO-77');
    const out = extractChecklist(cells);
    expect(Object.keys(out.answers)).toHaveLength(CHECKLIST_STEPS.length);
    expect(out.answers.s22).toBe('N');
    expect(out.fields).toEqual({
      customer_name: 'Jane Doe',
      project_type: 'WATER HEATER',
      project_date: '2026-07-06',
      notes: 'Left a note',
      permit_submitted_on: '2026-07-07',
      parts_order_no: 'PO-77',
    });
    expect(out.problems).toEqual([]);
  });

  it('skips empty cells and reports unreadable ones', () => {
    const out = extractChecklist(
      new Map<string, string>([
        ['M10', 'maybe'],
        ['M11', ''],
        ['C4', 'Solar'],
        ['F26', 'next week'],
      ]),
    );
    expect(out.answers).toEqual({});
    expect(out.problems).toHaveLength(3);
    expect(out.problems[0]).toMatch(/M10 \(step 1\)/);
    expect(normalizeAnswerCell(' yes ')).toBe('Y');
    expect(normalizeAnswerCell('b')).toBe('B');
  });

  it('offers only filled tabs of the right kind', () => {
    const sheets = readXlsx(
      buildXlsx({
        JobLog: { A1: 'index' },
        Task1: { C3: 'Jane', M10: 'Y' },
        Task2: {},
        Task3: { M11: 'N' },
        CALLBACK1: { M10: 'Y' },
      }),
    );
    expect(candidateSheets(sheets, 'task').map((s) => s.name)).toEqual(['Task1', 'Task3']);
    expect(candidateSheets(sheets, 'callback').map((s) => s.name)).toEqual(['CALLBACK1']);
    expect(candidateSheets(sheets, 'task')[0]).toMatchObject({ customerName: 'Jane', answered: 1 });
  });
});
