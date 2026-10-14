# Workbook analysis: `RSE ENERGY GROUP CHECKLISTS CAO 3JUL2026.xlsx`

Inspected with openpyxl 3.1.5 (formulas, cached values, cell protection, conditional formatting) and
recalculated in Excel 16 via COM automation to confirm formula semantics. Scripts live in `scripts/workbook/`.

## 1. Workbook structure

| Sheet | Range | Purpose |
|---|---|---|
| `Employee Production (Monthly)` | A1:M26 | Monthly rollup. 4 inputs (D3 employee name, D4 month, D5 beginning date, D6 ending date). All totals are 3-D sums over **Task1:Task35 only**. |
| `JobLog` | A1:G38 | Index of Task1..Task35: pulls C3:C7 (header) and E78 (notes) from each Task tab. Callback tabs are not listed. |
| `Task1`..`Task35` | A1:N95 | Appointment/Service Call Checklist. All 35 tabs are identical to Task1 (values, formulas, protection). |
| `CALLBACK1`..`CALLBACK10` | A1:N95 | Call Back Checklist. All 10 identical to CALLBACK1. |

Every sheet is **protected**; the only unlocked cells are the inputs. That is the authoritative input map below.

## 2. Task vs. CALLBACK differences (exhaustive)

Only two cells differ. Everything else, including every formula, is identical.

| Cell | Task1 | CALLBACK1 |
|---|---|---|
| C1 | `Appointment/Service Call Checklist` | `Appointment/Service Call Checklist (CALL BACK)` |
| B64 (step 34) | `Proceed to next appointment or coordinate with other Team Members to assist with their appointments if needed.` | `Return to original appointment checklist to closeout both checklist.` |

Consequence: a CALLBACK tab computes its own C81..C95 scores, but the monthly tab never reads them
(`=SUM(Task1:Task35!C81)` and friends). **Callback checklists do not count toward monthly production or Black/Red.**

## 3. Input map (unlocked cells on Task1 / CALLBACK1)

No merged cells exist anywhere in the workbook. Multi-line steps are plain adjacent rows. For every step whose
sentence wraps onto a second row, the **first row's M cell is locked and the last row's M cell is unlocked**,
so the answer always lives on the **last row** of the step text. This matches the formulas (`M36` for step 17,
`M43` for step 22).

### Header

| Cell | Field | Format |
|---|---|---|
| C3 | Customer Name | text |
| C4 | Project Type | list validation: `HVAC, WATER HEATER, GENERATOR, OTHER` |
| C5 | Project Date | `d-mmm-yy` |
| C6 | Project Location | text |
| C7 | Referral/Project No. | text |
| E78 | Notes/Remarks | text (label at E77) |

### Y/N/B answer cells (column M): 44 total, 34 numbered steps plus 10 sub-items

| # | Rows | Answer cell | Text (column B, verbatim) | Scoring / notes |
|---|---|---|---|---|
| 1 | 10 | M10 | Arrive to appointment 30 minutes early. | |
| 2 | 11 | M11 | Greet customer and introduce yourself. | **Service Quote** (C81) |
| 3 | 12 | M12 | Acknowledge or confirm the reason for the appointment/service call with the customer. | |
| 4 | 13 | M13 | Locate and assess site for issue requested. | |
| 5 | 14 | M14 | Troubleshooting: Inspect and/or diagnose issue. | |
| 6 | 15 | M15 | Refer to technicial doctrine for solutions. | sic |
| 6a | 16 | M16 | Technical Drawings | sub-item, unlocked |
| 6b | 17 | M17 | Workflow | sub-item, unlocked |
| 7 | 18 | M18 | Identify issue and inform customer of issue by communcating a primary and secondary solution. | sic |
| 8 | 19 | M19 | Inform customer that you will need to research the cost of the repair(s)/install/project. | |
| 9 | 20 | M20 | Communicate the cost of the repairs(s)/project to the customer. | |
| 9a | 21 | M21 | Did customer decline service? | highlighted row; not used by any formula |
| 9b | 22 | M22 | Did customer accept cost and agreed to service? | not used by any formula |
| 10 | 23 | M23 | Secure a projected date for repair(s)/install/project preferable on a Saturday for residential customers if feasible. | |
| 11 | 24-25 | **M24** | Non-Refundable Scheduling Fee: Collect a $100 deposit for a scheduled appointment if customer is not in the PM program. | row 25 is a locked note: "Deposit is non-refundable as a credit if Non-PM customer cancels or isn't available for repair(s)/project." |
| 12 | 26 | M26 **+ F26** | Permit Submission Date (If Applicable): | F26 = date input, M26 = Y/N/B |
| 13 | 27 | M27 **+ F27** | Permit Follow-Up Date (If Applicable): | F27 = date input |
| 14 | 28 | M28 **+ F28** | Permit Approval Date (If Applicable): | F28 = date input |
| 15 | 29-30 | **M30** | Order Parts. If repair(s) can be made on-site on the same day of the appointment, source local parts suppliers via established business account(s). | M29 locked |
| 16 | 31 | M31 | Order Parts. If repairs can't be made on-site on the same day of the appointment, order parts needed for repairs. | |
| 16a | 32 | M32 | Technical Drawings: Refer to doctrine to validate parts. | sub-item |
| 16b | 33 | M33 | Workflow: Refer to doctrine to validate install/project. | sub-item |
| 16c | 34 | M34 **+ E34 + I34** | Parts Received. Date: / Parts Order No: | E34 = date (`d-mmm-yy`), I34 = order no. |
| 17 | 35-36 | **M36** | On the day of the repair(s)/project, remember safety first. Shut-off all systems, if qualified and/or authorized, that will be affected by the repair. | **In Progress** (C82). M36 has no border (cosmetic slip) |
| 18 | 37-38 | **M38** | Removal/Installation Instructions. Review all instructions relevant to repair, in order to perform a safe quality repair/project. | M37 locked |
| 19 | 39 | M39 | Remove and install new part(s). | |
| 20 | 40 | M40 | Perform quality check of install. Ensure all parts have been installed and sealed, if applicable, correctly. | |
| 21 | 41 | M41 | Perform operational check of new installation. Did you perform Service Validation Testing ? | |
| 22 | 42-43 | **M43** | If operational check fails, troubleshoot and make necessary corrections. If corrections can't be made within reason, update management for a course of action. Did the operational check fail? If Yes, return to Step 5 to repeat process. | **Failure 1 if Y** (C86). CF: red when Y |
| 23 | 44 | M44 | If operational check is successful, conduct a quality check of installation. Did you conduct a QA/QC? | **Failure 2 if N** (C87). CF: red when N |
| 24 | 45 | M45 | Request a quality check of the installation from management if time permits. Did Manager perform a QA/QC? | |
| 25 | 46 | M46 | Once installation has been completed, inform customer of repair/installation. | |
| 26 | 47 | M47 | Clean up worksite and gather all tools daily. | **Failure 3 if N** (C88). CF: red when N. A47 is yellow |
| 27 | 48-49 | **M49** | Closeout repair by invoicing customer with the final cost minus the $100 deposit scheduling fee. Charge customer before departing site. Credit is only applicable to Non-PM program customers. | M48 locked |
| 28 | 50-51 | **M51** | Once invoice has been settled with customer, ask the customer if they have any questions or concerns about the repair(s)/installation. | M50 locked |
| 29 | 52 | M52 | Ask the customer if they have additional energy projects pending and introduce the RSE PM program to customer. | |
| 29a | 53 | M53 | If yes, list the potential projects in the Notes/Remarks sections. | highlighted row, sub-item |
| 29b | 54-55 | **M55** | If the customer doesn't have any additional projects, thank the customer for their business and ask them to refer RSE Energy Group to others. | M54 locked |
| 29c | 56 | M56 | Leave a business card or send a Thank You text message. | sub-item |
| 30 | 57 | M57 | Depart site. | |
| 31 | 58 | M58 | Did you incur a callback for service due to a failed installation? If Yes, refer to Call Back Checklist for service. | **Failure 4 if Y** (C89). CF: red when Y |
| 32 | 59 | M59 | Follow-up with the customer one week after the project/installation, to check on the install. | |
| 33 | 60-63 | **M60** | Close appointment checklist. Sign checklist and submit to management for review. Enter B if Call Back occurred. | rows 61-63 locked note: "Pay Validation. Submit all checklists to Management to validate time cards prior to the end of each pay period. Failure to submit all checklists for the respective pay period will result in a 50% reduction in pay for the pay period. Please keep in mind to submit all checklists with the most accurate and updated information for the respective task(s)." CF: orange when B |
| 34 | 64 | M64 | Proceed to next appointment or coordinate with other Team Members to assist with their appointments if needed. (CALLBACK: Return to original appointment checklist to closeout both checklist.) | **Completed** (C83). CF: orange when Y. A64 is green |

Signature block (all locked, no inputs): B68 `Print`, B70 `Signature`, I70 `Date`.

## 4. Every formula on a Task/CALLBACK tab

| Cell | Label (col A/K) | Formula | Meaning |
|---|---|---|---|
| M71 | Task Failure 1 | `=COUNTIF(M43,"Y")` | duplicate of C86 |
| M72 | Task Failure 2 | `=COUNTIF(M44,"N")` | duplicate of C87 |
| M73 | Task Failure 3 | `=COUNTIF(M47,"N")` | duplicate of C88 |
| M74 | Task Failure 4 | `=COUNTIF(M58,"Y")` | duplicate of C89 |
| M75 | Completed | `=COUNTIF(M10:M64,"Y")+COUNTIF(M43,"N")+COUNTIF(M58,"N")` | count of completed marks across all 44 answer cells (sub-items included), plus N on steps 22 and 31 |
| M76 | Bottom Line | `=C94` | |
| C81 | Service Quote | `=COUNTIF(M11,"Y")` | step 2 |
| C82 | In Progress | `=COUNTIF(M36,"Y")` | step 17 |
| C83 | Completed | `=COUNTIF(M64,"Y")` | step 34 |
| C86 | 1: Ops Check Failure | `=COUNTIF(M43,"Y")` | step 22 == Y |
| C87 | 2: QA/QC | `=COUNTIF(M44,"N")` | step 23 == N |
| C88 | 3. Tool(s) Control | `=COUNTIF(M47,"N")` | step 26 == N |
| C89 | 4: Call Back | `=COUNTIF(M58,"Y")` | step 31 == Y |
| C90 | Total Failures | `=COUNTIF(C86:C89,"1")` | number of flags set |
| C91 | Total Failures Value | `=COUNTIF(C90,">0")` | 1 if any failure ("Red") |
| C94 | Bottom Line | `=COUNTIFS(C83,"1")+COUNTIF(C86:C89,"0")` | completed + number of clean flags, 0..5 |
| C95 | Rev/Task/Value | `=COUNTIF(C94,"5")` | 1 if perfect ("Black") |

Conditional formatting: red fill on M43=Y, M44=N, M47=N, M58=Y; orange on M60:M63 containing B and on M64=Y;
green-to-red colour scale on M71:M74 and M76; M76 highlighted when it equals 5.

## 5. Every formula on `Employee Production (Monthly)`

| Cell | Label | Formula | Blank-workbook value |
|---|---|---|---|
| D9 | Total Service Call/Quotes | `=SUM(Task1:Task35!C81)` | 0 |
| D10 | Total In-Progress | `=SUM(Task1:Task35!C82)-D11` | 0 |
| D11 | Total Tasks Completed | `=SUM(Task1:Task35!C83)` | 0 |
| D14 | Service Calls/Quotes (Approved) | `=SUM(D10:D11)/D9*100` | #DIV/0! |
| D15 | Service Calls/Quotes (Declined)* | `=100-D14` | #DIV/0! |
| D16 | Projects (In-Progress) | `=D10/D9*100` | #DIV/0! |
| D17 | Projects (Completed) | `=D11/D9*100` | #DIV/0! |
| B20 | Black | `=SUM(Task1:Task35!C95)` | 0 |
| B21 | Red | `=SUM(Task1:Task35!C91)` | 0 |
| B22 | Total | `=B20+B21` | 0 |
| B23 | Bottom Line | `=B20/B22*100` | #DIV/0! |

Footnote on the sheet (A25:B26): "Service Calls/Quotes (Declined) metric will update to Projects (In-Progress)
when the Technician accomplishes Step 17 on the Appointment Service/Call." So "Declined" is derived
(quotes not yet started), not the count of 9a = Y.

`JobLog`: row n+3 = `Taskn!C3, C4, C5, C6, C7, E78`.

## 6. Semantics confirmed by Excel recalculation

A copy was filled through Excel COM and recalculated (`scripts/workbook/excel_oracle.py`). Results:

| Scenario | C81 | C82 | C83 | flags 86-89 | C90 | C91 | C94 | C95 | M75 |
|---|---|---|---|---|---|---|---|---|---|
| Task1: every cell Y, except 9a/22/31 = N ("perfect") | 1 | 1 | 1 | 0 0 0 0 | 0 | 0 | 5 | 1 | 35 |
| Task2: 2/17/34 = Y, 22 = Y, 23 = N, 26 = N, 31 = Y | 1 | 1 | 1 | 1 1 1 1 | 4 | 1 | 1 | 0 | 5 |
| Task3: 2 = Y, 9a = Y, rest blank (declined quote) | 1 | 0 | 0 | 0 0 0 0 | 0 | 0 | 4 | 0 | 2 |
| Task4: 2 = Y, 17 = Y, rest blank (in progress) | 1 | 1 | 0 | 0 0 0 0 | 0 | 0 | 4 | 0 | 2 |
| Task5: lower-case `y` on 2/17/34 | 1 | 1 | 1 | 0 0 0 0 | 0 | 0 | 5 | 1 | 3 |
| Task6: 2/17/34 = Y, 31 = Y, 33 = B | 1 | 1 | 1 | 0 0 0 1 | 1 | 1 | 4 | 0 | 4 |
| Task7: 2/17/34 = Y, 23 = N | 1 | 1 | 1 | 0 1 0 0 | 1 | 1 | 4 | 0 | 3 |
| Task8: 2/17/34 = Y, 22 = N, 23 = Y, 26 = Y, 31 = N | 1 | 1 | 1 | 0 0 0 0 | 0 | 0 | 5 | 1 | 7 |
| Task9: empty | 0 | 0 | 0 | 0 0 0 0 | 0 | 0 | 4 | 0 | 0 |
| CALLBACK1: perfect | 1 | 1 | 1 | 0 0 0 0 | 0 | 0 | 5 | 1 | 35 |

Monthly with the above: D9 = 8, D10 = 1, D11 = 6, D14 = 87.5, D15 = 12.5, D16 = 12.5, D17 = 75,
B20 (Black) = 3, B21 (Red) = 3, B22 = 6, B23 = 50. CALLBACK1 did not contribute.

Takeaways for the app:

1. **Blank is not N.** Unanswered failure steps count as clean. A half-filled checklist has bottom line 4 and is neither Black nor Red.
2. COUNTIF is case-insensitive; the app normalises to upper-case so this never matters.
3. `B` never counts as Y anywhere. Its only formal role is the step-33 marker ("Enter B if Call Back occurred").
4. A checklist is Black only when step 34 = Y and all four flags are clean. It is Red whenever any flag is set, regardless of step 34.
5. Monthly percentages divide by D9 and B22; guard both for zero.

## 7. Where the workbook contradicts or extends the PRD

| PRD says | Workbook shows | Impact |
|---|---|---|
| "Several steps span two rows (merged cells)" | No merged cells. Two-row steps use locked first row + unlocked last row. | Answer cell is the last row. |
| Step 15/16 answer cells M29 / M31 | **M30** / M31 | fix |
| Steps 18-21 at M37..M41 | **M38**, M39, M40, M41 | fix |
| Step 27 at M48 | **M49** | fix |
| Steps 28-29 at M50, M52 | **M51**, M52 | fix |
| Step 17 "M35/M36" | M36 only | fine |
| Steps 12-14 are "date fields" | Each has a date input (F26:F28) **and** a Y/N/B (M26:M28) | model both |
| Only 9a/9b sub-questions | 10 sub-items: 6a, 6b, 9a, 9b, 16a, 16b, 16c, 29a, 29b, 29c. 44 answer cells total | config must include them or data is lost vs. workbook |
| Parts received date / order no. "fields" | E34 (date) and I34 (text) | map |
| Scoring section lists C81..C95 | Also M75 "Completed" marks count and M71:M74/M76 mirrors | add `completed_marks` to scores; mirrors need nothing |
| Monthly rollup "per employee" | Sums Task tabs only; callbacks excluded | production counts must filter `type = task`; callbacks counted separately |
| "Missing checklists reduce pay" | Workbook text: 50% reduction for the pay period | informational |
| Pay period undefined (open question 1) | Monthly tab has Month plus Beginning/Ending Date inputs | the workbook's period is a month with explicit dates; pay period may differ |
| Project type dropdown "HVAC, Water Heater, Generator, Other" | validation list `HVAC, WATER HEATER, GENERATOR, OTHER` | match |
| "Sample workbooks" for unit tests | The provided workbook is a blank template; no filled samples exist | fixtures will be generated through Excel (see plan) |
| HCP `/invoices/{id}/payments` | Does not exist; payments are nested in `invoice.payments[]` | see HCP reference |

Spelling in the workbook ("technicial", "communcating", "repairs(s)") is kept verbatim in the config; see open questions.
