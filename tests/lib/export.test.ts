import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { CHECKLIST_STEPS } from '@/src/config/checklist-steps';
import {
  checklistScores,
  checklists,
  type Checklist,
  type ChecklistAnswer,
  type ChecklistScoreRow,
} from '@/src/db/schema/checklists';
import { auditLog } from '@/src/db/schema/system';
import { appUsers } from '@/src/db/schema/users';
import {
  DATASET_INFO,
  EXPORT_DATASETS,
  exportFilename,
  isExportDataset,
  isExportFormat,
} from '@/src/lib/export/catalog';
import { CSV_BOM, csvChunks, csvField, toCsv } from '@/src/lib/export/csv';
import { jsonChunks, toByteStream } from '@/src/lib/export/stream';

vi.mock('server-only', () => ({}));

/** Minimal RFC 4180 reader, used to prove that what we write can be read back unchanged. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i++;
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

describe('csvField', () => {
  it('leaves plain values unquoted', () => {
    expect(csvField('hello world')).toBe('hello world');
    expect(csvField(42)).toBe('42');
    expect(csvField(0)).toBe('0');
    expect(csvField(false)).toBe('false');
    expect(csvField(true)).toBe('true');
  });

  it('quotes fields containing a comma, quote, CR or LF, and doubles quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
    expect(csvField('a\rb')).toBe('"a\rb"');
    expect(csvField('"')).toBe('""""');
  });

  it('renders null and undefined as empty', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('renders Dates as ISO 8601 UTC and an invalid Date as empty', () => {
    expect(csvField(new Date('2026-07-06T14:30:00Z'))).toBe('2026-07-06T14:30:00.000Z');
    expect(csvField(new Date('nope'))).toBe('');
  });

  it('renders objects and arrays as JSON, quoted as needed', () => {
    expect(csvField({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvField(['x', 'y'])).toBe('"[""x"",""y""]"');
    expect(csvField([])).toBe('[]');
    expect(csvField({ at: new Date('2026-07-06T14:30:00Z') })).toBe(
      '"{""at"":""2026-07-06T14:30:00.000Z""}"',
    );
  });
});

describe('toCsv', () => {
  it('writes a header and CRLF-terminated records', () => {
    const rows = [
      { id: 1, name: 'Ann' },
      { id: 2, name: 'Bo' },
    ];
    expect(toCsv(rows)).toBe('id,name\r\n1,Ann\r\n2,Bo\r\n');
  });

  it('uses the union of keys in first-seen order when no columns are given', () => {
    const rows = [{ a: 1 }, { b: 2, a: 3 }, { c: 4 }];
    expect(toCsv(rows)).toBe('a,b,c\r\n1,,\r\n3,2,\r\n,,4\r\n');
  });

  it('honours an explicit column list: order, missing keys blank, extra keys ignored', () => {
    const rows = [{ a: 1, b: 2, z: 'ignored' }, { b: 5 }];
    expect(toCsv(rows, ['b', 'a', 'missing'])).toBe('b,a,missing\r\n2,1,\r\n5,,\r\n');
  });

  it('escapes header names too', () => {
    expect(toCsv([{ 'a,b': 1 }])).toBe('"a,b"\r\n1\r\n');
  });

  it('writes only the header for no rows when columns are given, and nothing when they are not', () => {
    expect(toCsv([], ['id', 'name'])).toBe('id,name\r\n');
    expect(toCsv([])).toBe('');
  });

  it('prefixes a UTF-8 BOM only when asked', () => {
    const rows = [{ name: 'José' }];
    expect(toCsv(rows).startsWith(CSV_BOM)).toBe(false);
    expect(toCsv(rows, undefined, { bom: true })).toBe(`${CSV_BOM}name\r\nJosé\r\n`);
    expect(toCsv([], undefined, { bom: true })).toBe(CSV_BOM);
  });

  it('round-trips awkward values through an RFC 4180 reader', () => {
    const awkward = [
      'plain',
      'with,comma',
      'with "quotes"',
      'multi\nline',
      'crlf\r\ninside',
      '',
      ' padded ',
      '=1+1',
      '"',
    ];
    const rows = awkward.map((value, i) => ({ id: i, text: value }));
    const parsed = parseCsv(toCsv(rows));
    expect(parsed[0]).toEqual(['id', 'text']);
    expect(parsed.slice(1)).toEqual(awkward.map((value, i) => [String(i), value]));
  });

  it('serialises mixed cell types in one record', () => {
    const rows = [
      { n: null, d: new Date('2026-01-02T03:04:05Z'), j: { k: [1, 'two'] }, b: false, t: 'x' },
    ];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed[1]).toEqual(['', '2026-01-02T03:04:05.000Z', '{"k":[1,"two"]}', 'false', 'x']);
  });

  it('streams the same text as chunks, including across batch boundaries', () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ id: i, note: `row, ${i}` }));
    const chunks = [...csvChunks(rows, ['id', 'note'], { bom: true })];
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join('')).toBe(toCsv(rows, ['id', 'note'], { bom: true }));
    expect(parseCsv(chunks.join('').slice(1))).toHaveLength(1235);
  });
});

describe('jsonChunks', () => {
  it('produces valid JSON equal to JSON.stringify of the payload', () => {
    const payload = {
      exported_at: '2026-07-06T14:30:00.000Z',
      rows: Array.from({ length: 1201 }, (_, i) => ({
        id: i,
        at: new Date(2026, 0, 1, 0, 0, i),
        tags: ['a', 'b'],
      })),
      empty: [],
      single: [{ x: 1 }],
      scalar: 7,
      nothing: null,
    };
    const text = [...jsonChunks(payload)].join('');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(payload)));
  });

  it('handles an empty payload and tiny chunk sizes', () => {
    expect(JSON.parse([...jsonChunks({})].join(''))).toEqual({});
    const text = [...jsonChunks({ a: [1, 2, 3, 4, 5] }, 2)].join('');
    expect(JSON.parse(text)).toEqual({ a: [1, 2, 3, 4, 5] });
  });

  it('keeps non-ASCII text and embedded newlines intact', () => {
    const payload = { rows: [{ name: 'José "Pepe"\nNúñez', note: '日本語' }] };
    expect(JSON.parse([...jsonChunks(payload)].join(''))).toEqual(payload);
  });
});

describe('toByteStream', () => {
  it('delivers the chunks as UTF-8 bytes in order', async () => {
    const stream = toByteStream(['é', 'a,b\r\n', '', '日本']);
    const text = await new Response(stream).text();
    expect(text).toBe('éa,b\r\n日本');
  });

  it('carries a CSV with a BOM unchanged', async () => {
    const csv = toCsv([{ name: 'José' }], ['name'], { bom: true });
    const bytes = new Uint8Array(
      await new Response(
        toByteStream(csvChunks([{ name: 'José' }], ['name'], { bom: true })),
      ).arrayBuffer(),
    );
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(csv);
  });

  it('stops the generator when the consumer cancels', async () => {
    let finished = false;
    function* source() {
      try {
        yield 'a';
        yield 'b';
      } finally {
        finished = true;
      }
    }
    const reader = toByteStream(source()).getReader();
    await reader.read();
    await reader.cancel();
    expect(finished).toBe(true);
  });
});

describe('export catalog', () => {
  it('lists the seven datasets, each with a title and description', () => {
    expect([...EXPORT_DATASETS]).toEqual([
      'checklists',
      'answers',
      'jobs',
      'technicians',
      'pay_periods',
      'users',
      'audit_log',
    ]);
    for (const name of EXPORT_DATASETS) {
      expect(DATASET_INFO[name].title.length).toBeGreaterThan(0);
      expect(DATASET_INFO[name].description.length).toBeGreaterThan(20);
    }
    expect(DATASET_INFO.answers.description).toContain(String(CHECKLIST_STEPS.length));
  });

  it('recognises only known datasets and formats', () => {
    expect(isExportDataset('answers')).toBe(true);
    expect(isExportDataset('hcp_customers')).toBe(false);
    expect(isExportDataset('')).toBe(false);
    expect(isExportDataset(null)).toBe(false);
    expect(isExportDataset('constructor')).toBe(false);
    expect(isExportFormat('csv')).toBe(true);
    expect(isExportFormat('json')).toBe(true);
    expect(isExportFormat('xlsx')).toBe(false);
  });

  it('builds download file names', () => {
    expect(exportFilename('checklists', 'csv', '2026-07-06')).toBe(
      'rse-qaqc-checklists-2026-07-06.csv',
    );
    expect(exportFilename('all', 'json', '2026-07-06')).toBe('rse-qaqc-all-2026-07-06.json');
  });
});

describe('dataset column definitions', () => {
  it('cover every checklists and checklist_scores column, so a schema change cannot silently drop data', async () => {
    const { CHECKLIST_COLUMNS } = await import('@/src/lib/export/datasets');
    const exported = new Set<string>(CHECKLIST_COLUMNS);

    // The technician FK is exported as name + hcp_employee_id; scores' computed_at is prefixed.
    const checklistDbColumns = Object.values(getTableColumns(checklists)).map((c) => c.name);
    for (const name of checklistDbColumns) {
      if (name === 'technician_id') {
        expect(exported.has('technician') && exported.has('hcp_employee_id')).toBe(true);
      } else {
        expect(exported.has(name), `checklists.${name} is not exported`).toBe(true);
      }
    }
    const scoreDbColumns = Object.values(getTableColumns(checklistScores)).map((c) => c.name);
    for (const name of scoreDbColumns) {
      if (name === 'checklist_id') continue; // same as id
      const exportedName = name === 'computed_at' ? 'scores_computed_at' : name;
      expect(exported.has(exportedName), `checklist_scores.${name} is not exported`).toBe(true);
    }
    expect(exported.has('invoice_number')).toBe(true);
  });

  it('cover every audit_log column, and users only expose the agreed fields', async () => {
    const { AUDIT_LOG_COLUMNS, USER_COLUMNS } = await import('@/src/lib/export/datasets');
    const audit = new Set<string>(AUDIT_LOG_COLUMNS);
    for (const column of Object.values(getTableColumns(auditLog))) {
      expect(audit.has(column.name), `audit_log.${column.name} is not exported`).toBe(true);
    }
    expect([...USER_COLUMNS]).toEqual([
      'id',
      'email',
      'name',
      'role',
      'active',
      'last_login_at',
      'created_at',
    ]);
    const userDbColumns = Object.values(getTableColumns(appUsers)).map((c) => c.name);
    for (const hidden of ['auth_user_id', 'invited_by', 'updated_at']) {
      expect(userDbColumns).toContain(hidden);
      expect(USER_COLUMNS).not.toContain(hidden);
    }
  });

  it('never export raw_json and give every dataset a unique, non-empty header', async () => {
    const { DATASETS } = await import('@/src/lib/export/datasets');
    expect(Object.keys(DATASETS).sort()).toEqual([...EXPORT_DATASETS].sort());
    for (const name of EXPORT_DATASETS) {
      const { columns } = DATASETS[name];
      expect(columns.length).toBeGreaterThan(0);
      expect(new Set(columns).size, `${name} has duplicate columns`).toBe(columns.length);
      expect(columns).not.toContain('raw_json');
    }
    expect(DATASETS.jobs.columns).toEqual(
      expect.arrayContaining(['hcp_job_id', 'assigned_technicians']),
    );
    expect(DATASETS.answers.columns).toEqual(
      expect.arrayContaining([
        'step_key',
        'step_label',
        'step_number',
        'step_text',
        'workbook_cell',
        'auto_evidence',
      ]),
    );
  });
});

const JOB = 'job-1';
const TECH_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const techs = new Map([[TECH_ID, { name: 'Sam Rivera', hcpEmployeeId: 'pro_123' }]]);
const userNames = new Map([[USER_ID, 'Dana Caller']]);

function makeChecklist(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: 'c-task',
    hcpJobId: JOB,
    hcpAppointmentId: null,
    technicianId: TECH_ID,
    type: 'task',
    parentChecklistId: null,
    configVersion: 1,
    callDate: '2026-07-06',
    status: 'submitted',
    projectType: 'HVAC',
    customerName: 'Pat "The Customer" Smith, Jr.',
    projectLocation: '1 Main St',
    projectDate: '2026-07-06',
    referralProjectNo: '',
    permitSubmittedOn: null,
    permitFollowupOn: null,
    permitApprovedOn: null,
    partsReceivedOn: null,
    partsOrderNo: null,
    notes: 'line1\nline2',
    submittedBy: USER_ID,
    submittedAt: new Date('2026-07-06T20:00:00Z'),
    reopenedBy: null,
    reopenedAt: null,
    createdBy: USER_ID,
    createdAt: new Date('2026-07-06T15:00:00Z'),
    updatedAt: new Date('2026-07-06T20:00:00Z'),
    ...overrides,
  };
}

function makeAnswer(overrides: Partial<ChecklistAnswer>): ChecklistAnswer {
  return {
    checklistId: 'c-task',
    stepKey: 's01',
    value: 'Y',
    source: 'manual',
    autoSuggestedValue: null,
    autoEvidence: null,
    autoComputedAt: null,
    answeredBy: USER_ID,
    answeredAt: new Date('2026-07-06T16:00:00Z'),
    ...overrides,
  };
}

describe('buildAnswerRows', () => {
  it('emits one row per checklist and step, blanks included, in step order', async () => {
    const { buildAnswerRows } = await import('@/src/lib/export/datasets');
    const lists = [
      {
        id: 'c-task',
        type: 'task' as const,
        callDate: '2026-07-06',
        hcpJobId: JOB,
        technicianId: TECH_ID,
      },
      {
        id: 'c-cb',
        type: 'callback' as const,
        callDate: '2026-07-07',
        hcpJobId: JOB,
        technicianId: null,
      },
    ];
    const answers = new Map([
      [
        'c-task',
        new Map([
          ['s01', makeAnswer({ stepKey: 's01', value: 'Y' })],
          [
            's10',
            makeAnswer({
              stepKey: 's10',
              value: null,
              source: 'auto_overridden',
              autoSuggestedValue: 'N',
              autoEvidence: { reason: 'no later job', count: 0 },
              answeredBy: null,
              answeredAt: null,
            }),
          ],
        ]),
      ],
    ]);

    const rows = buildAnswerRows(lists, answers, techs, userNames);
    expect(rows).toHaveLength(2 * CHECKLIST_STEPS.length);
    expect(rows.slice(0, CHECKLIST_STEPS.length).map((r) => r.step_key)).toEqual(
      CHECKLIST_STEPS.map((s) => s.key),
    );

    expect(rows[0]).toMatchObject({
      checklist_id: 'c-task',
      checklist_type: 'task',
      call_date: '2026-07-06',
      technician: 'Sam Rivera',
      hcp_job_id: JOB,
      step_key: 's01',
      step_label: '1',
      step_number: 1,
      workbook_cell: 'M10',
      value: 'Y',
      source: 'manual',
      answered_by: 'Dana Caller',
    });
    expect(rows[0].answered_at).toEqual(new Date('2026-07-06T16:00:00Z'));

    // Unanswered step: blank value/source, nothing invented.
    const blank = rows.find((r) => r.checklist_id === 'c-task' && r.step_key === 's02')!;
    expect(blank).toMatchObject({
      value: null,
      source: null,
      auto_suggested_value: null,
      auto_evidence: null,
      answered_at: null,
    });

    // A stored row with a null value keeps its auto-check suggestion and evidence.
    const suggested = rows.find((r) => r.checklist_id === 'c-task' && r.step_key === 's10')!;
    expect(suggested).toMatchObject({
      value: null,
      source: 'auto_overridden',
      auto_suggested_value: 'N',
      auto_evidence: { reason: 'no later job', count: 0 },
    });
    expect(parseCsv(toCsv([suggested], ['auto_evidence']))[1]).toEqual([
      '{"reason":"no later job","count":0}',
    ]);
  });

  it('uses the callback wording on callback checklists', async () => {
    const { buildAnswerRows } = await import('@/src/lib/export/datasets');
    const step = CHECKLIST_STEPS.find((s) => s.callbackText)!;
    const rows = buildAnswerRows(
      [
        { id: 'a', type: 'task', callDate: '2026-07-06', hcpJobId: JOB, technicianId: null },
        { id: 'b', type: 'callback', callDate: '2026-07-06', hcpJobId: JOB, technicianId: null },
      ],
      new Map(),
      techs,
      userNames,
    );
    const task = rows.find((r) => r.checklist_id === 'a' && r.step_key === step.key)!;
    const callback = rows.find((r) => r.checklist_id === 'b' && r.step_key === step.key)!;
    expect(task.step_text).toBe(step.text);
    expect(callback.step_text).toBe(step.callbackText);
    expect(task.technician).toBeNull();
  });
});

describe('buildChecklistRows', () => {
  it('maps names, ids and every score column, and leaves scores blank when none are stored', async () => {
    const { buildChecklistRows, CHECKLIST_COLUMNS } = await import('@/src/lib/export/datasets');
    const score: ChecklistScoreRow = {
      checklistId: 'c-task',
      serviceQuote: 1,
      inProgress: 1,
      completed: 1,
      failOpsCheck: 0,
      failQaqc: 0,
      failToolControl: 0,
      failCallback: 0,
      totalFailures: 0,
      failuresValue: 0,
      bottomLine: 4,
      perfectTask: 1,
      completedMarks: 44,
      computedAt: new Date('2026-07-06T20:00:01Z'),
    };
    const callback = makeChecklist({
      id: 'c-cb',
      type: 'callback',
      parentChecklistId: 'c-task',
      technicianId: null,
      status: 'in_progress',
      submittedBy: null,
      submittedAt: null,
    });
    const rows = buildChecklistRows(
      [
        { checklist: makeChecklist(), score, invoiceNumber: 'INV-1001' },
        { checklist: callback, score: null, invoiceNumber: null },
      ],
      techs,
      userNames,
    );

    expect(rows[0]).toMatchObject({
      id: 'c-task',
      type: 'task',
      technician: 'Sam Rivera',
      hcp_employee_id: 'pro_123',
      invoice_number: 'INV-1001',
      submitted_by: 'Dana Caller',
      created_by: 'Dana Caller',
      reopened_by: null,
      bottom_line: 4,
      perfect_task: 1,
      completed_marks: 44,
      scores_computed_at: new Date('2026-07-06T20:00:01Z'),
    });
    expect(rows[1]).toMatchObject({
      id: 'c-cb',
      type: 'callback',
      parent_checklist_id: 'c-task',
      technician: null,
      hcp_employee_id: null,
      submitted_by: null,
      bottom_line: null,
      scores_computed_at: null,
    });
    for (const row of rows) expect(Object.keys(row)).toEqual([...CHECKLIST_COLUMNS]);

    // Awkward free text survives a CSV round trip.
    const parsed = parseCsv(toCsv(rows, CHECKLIST_COLUMNS));
    const header = parsed[0];
    expect(parsed[1][header.indexOf('customer_name')]).toBe('Pat "The Customer" Smith, Jr.');
    expect(parsed[1][header.indexOf('notes')]).toBe('line1\nline2');
    expect(parsed[1][header.indexOf('submitted_at')]).toBe('2026-07-06T20:00:00.000Z');
    expect(parsed[1][header.indexOf('call_date')]).toBe('2026-07-06');
  });
});
