# Workbook inspection scripts

Discovery tooling used to reverse-engineer the RSE checklist workbook (`RSE ENERGY GROUP CHECKLISTS CAO 3JUL2026.xlsx`).
The workbook itself is not committed (client data). Pass its path as the first argument.

| Script | What it does |
|---|---|
| `inspect_wb.py` | Dumps every value and formula (with cached result) on the monthly, JobLog, Task1 and CALLBACK1 tabs, plus data validations. |
| `styles_diff.py` | Column M styles, sheet protection, conditional formatting; diffs all Task/CALLBACK tabs against Task1/CALLBACK1. |
| `inputs.py` | Lists every unlocked (input) cell per sheet with number format and fill: the authoritative answer-cell map. |
| `excel_oracle.py` | Fills scenario answers into a copy, recalculates in Excel via COM (Windows + Excel required), and prints the scoring cells. Basis for the scoring test fixtures. |

Run with `python -I script.py path/to/workbook.xlsx` (openpyxl 3.1+, pywin32 for the oracle).
