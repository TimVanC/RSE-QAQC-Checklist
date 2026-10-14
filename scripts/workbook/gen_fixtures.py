"""Generate scoring fixtures by filling the RSE checklist template and recalculating in Excel.

Usage: python -I gen_fixtures.py <template.xlsx> <out_dir>
Writes checklists.json (per-checklist expectations) and rollups.json (monthly rollup per batch of Task tabs).
Requires Windows, Microsoft Excel and pywin32.
"""
import json
import os
import random
import shutil
import sys

import win32com.client as w

template = os.path.abspath(sys.argv[1])
out_dir = os.path.abspath(sys.argv[2])
os.makedirs(out_dir, exist_ok=True)

# step_key -> Task tab column M cell (see docs/discovery/workbook-analysis.md)
CELLS = {
    's01': 'M10', 's02': 'M11', 's03': 'M12', 's04': 'M13', 's05': 'M14', 's06': 'M15', 's06a': 'M16',
    's06b': 'M17', 's07': 'M18', 's08': 'M19', 's09': 'M20', 's09a': 'M21', 's09b': 'M22', 's10': 'M23',
    's11': 'M24', 's12': 'M26', 's13': 'M27', 's14': 'M28', 's15': 'M30', 's16': 'M31', 's16a': 'M32',
    's16b': 'M33', 's16c': 'M34', 's17': 'M36', 's18': 'M38', 's19': 'M39', 's20': 'M40', 's21': 'M41',
    's22': 'M43', 's23': 'M44', 's24': 'M45', 's25': 'M46', 's26': 'M47', 's27': 'M49', 's28': 'M51',
    's29': 'M52', 's29a': 'M53', 's29b': 'M55', 's29c': 'M56', 's30': 'M57', 's31': 'M58', 's32': 'M59',
    's33': 'M60', 's34': 'M64',
}
assert len(CELLS) == 44 and len(set(CELLS.values())) == 44
KEYS = list(CELLS)

SCORE_CELLS = {
    'service_quote': 'C81', 'in_progress': 'C82', 'completed': 'C83', 'fail_ops_check': 'C86',
    'fail_qaqc': 'C87', 'fail_tool_control': 'C88', 'fail_callback': 'C89', 'total_failures': 'C90',
    'failures_value': 'C91', 'bottom_line': 'C94', 'perfect_task': 'C95', 'completed_marks': 'M75',
}
MONTHLY_CELLS = {
    'total_service_quotes': 'D9', 'total_in_progress': 'D10', 'total_completed': 'D11',
    'approved_pct': 'D14', 'declined_pct': 'D15', 'in_progress_pct': 'D16', 'completed_pct': 'D17',
    'black': 'B20', 'red': 'B21', 'total': 'B22', 'bottom_line_pct': 'B23',
}


def all_y(**over):
    a = {k: 'Y' for k in KEYS}
    a.update(over)
    return a


scenarios = [
    ('empty', {}),
    ('perfect', all_y(s09a='N', s22='N', s31='N')),
    ('perfect_blank_optional', {'s02': 'Y', 's17': 'Y', 's34': 'Y'}),
    ('all_four_failures_completed', {'s02': 'Y', 's17': 'Y', 's34': 'Y', 's22': 'Y', 's23': 'N', 's26': 'N', 's31': 'Y'}),
    ('all_four_failures_not_completed', {'s02': 'Y', 's17': 'Y', 's22': 'Y', 's23': 'N', 's26': 'N', 's31': 'Y'}),
    ('fail_ops_only', {'s02': 'Y', 's17': 'Y', 's34': 'Y', 's22': 'Y'}),
    ('fail_qaqc_only', {'s02': 'Y', 's17': 'Y', 's34': 'Y', 's23': 'N'}),
    ('fail_tools_only', {'s02': 'Y', 's17': 'Y', 's34': 'Y', 's26': 'N'}),
    ('fail_callback_only', {'s02': 'Y', 's17': 'Y', 's34': 'Y', 's31': 'Y', 's33': 'B'}),
    ('declined_quote', {'s02': 'Y', 's09a': 'Y'}),
    ('in_progress_only', {'s02': 'Y', 's17': 'Y'}),
    ('completed_without_in_progress', {'s02': 'Y', 's34': 'Y'}),
    ('completed_without_quote', {'s17': 'Y', 's34': 'Y'}),
    ('lowercase', {'s02': 'y', 's17': 'y', 's34': 'y', 's22': 'n', 's31': 'n'}),
    ('b_everywhere', {k: 'B' for k in KEYS}),
    ('n_everywhere', {k: 'N' for k in KEYS}),
    ('only_subitems_y', {k: 'Y' for k in KEYS if k[-1].isalpha()}),
    ('n_on_fail_if_y_steps_only', {'s22': 'N', 's31': 'N'}),
    ('y_on_fail_if_n_steps_only', {'s23': 'Y', 's26': 'Y'}),
    ('step33_b_step34_y', {'s02': 'Y', 's17': 'Y', 's33': 'B', 's34': 'Y'}),
    ('step34_b', {'s02': 'Y', 's17': 'Y', 's34': 'B'}),
]
rng = random.Random(20261013)
for i in range(44):
    a = {}
    for k in KEYS:
        r = rng.random()
        a[k] = None if r < 0.25 else 'Y' if r < 0.75 else 'N' if r < 0.95 else 'B'
    scenarios.append((f'random_{i + 1:02d}', {k: v for k, v in a.items() if v}))

# batch 1 also fills three CALLBACK tabs to prove the monthly tab ignores them
callback_scenarios = [
    ('callback_perfect', all_y(s09a='N', s22='N', s31='N')),
    ('callback_failed', {'s02': 'Y', 's17': 'Y', 's34': 'Y', 's23': 'N'}),
    ('callback_empty', {}),
]


def cell_val(ws, addr):
    v = ws.Range(addr).Value
    if isinstance(v, int) and v < -2_000_000_000:  # Excel error code such as #DIV/0!
        return None
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def read_scores(ws):
    return {k: cell_val(ws, c) for k, c in SCORE_CELLS.items()}


xl = w.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
checklists, rollups = [], []
batches = [scenarios[i:i + 35] for i in range(0, len(scenarios), 35)]
for b, batch in enumerate(batches, start=1):
    path = os.path.join(out_dir, f'batch{b}.xlsx')
    shutil.copyfile(template, path)
    wb = xl.Workbooks.Open(path)
    for n, (name, answers) in enumerate(batch, start=1):
        ws = wb.Worksheets(f'Task{n}')
        for k, v in answers.items():
            ws.Range(CELLS[k]).Value = v
    if b == 1:
        for n, (name, answers) in enumerate(callback_scenarios, start=1):
            ws = wb.Worksheets(f'CALLBACK{n}')
            for k, v in answers.items():
                ws.Range(CELLS[k]).Value = v
    xl.CalculateFull()
    names = []
    for n, (name, answers) in enumerate(batch, start=1):
        ws = wb.Worksheets(f'Task{n}')
        checklists.append({'name': name, 'type': 'task', 'batch': b, 'answers': answers, 'expected': read_scores(ws)})
        names.append(name)
    if b == 1:
        for n, (name, answers) in enumerate(callback_scenarios, start=1):
            ws = wb.Worksheets(f'CALLBACK{n}')
            checklists.append({'name': name, 'type': 'callback', 'batch': b, 'answers': answers, 'expected': read_scores(ws)})
    wp = wb.Worksheets('Employee Production (Monthly)')
    rollups.append({
        'name': f'batch{b}',
        'task_checklists': names,
        'callback_checklists': [n for n, _ in callback_scenarios] if b == 1 else [],
        'expected': {k: cell_val(wp, c) for k, c in MONTHLY_CELLS.items()},
    })
    wb.Save()
    wb.Close(False)
xl.Quit()

meta = {
    'source': 'RSE ENERGY GROUP CHECKLISTS CAO 3JUL2026.xlsx',
    'generator': 'scripts/workbook/gen_fixtures.py',
    'engine': 'Microsoft Excel 16 via COM',
    'seed': 20261013,
    'cells': CELLS,
}
with open(os.path.join(out_dir, 'checklists.json'), 'w') as f:
    json.dump({'meta': meta, 'checklists': checklists}, f, indent=1)
with open(os.path.join(out_dir, 'rollups.json'), 'w') as f:
    json.dump({'meta': meta, 'rollups': rollups}, f, indent=1)

print(f'checklists={len(checklists)} rollups={len(rollups)}')
for r in rollups:
    print(r['name'], r['expected'])
for c in checklists[:22]:
    print(f"{c['name']:34} {c['expected']}")
