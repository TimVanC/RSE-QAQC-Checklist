# Open questions and risks

Decisions needed from Tim (T), Ron/Relene (R), or verifiable on day 1 with real Housecall Pro data (D).
Each item names the default the build will assume if unanswered, so work never blocks.

## A. From PRD section 14

| # | Question | Who | Default assumed |
|---|---|---|---|
| 1 | Pay period: weekly or biweekly, and the start day? The workbook rolls up by calendar month with explicit begin/end dates. | R | Biweekly, Monday start, anchored on Mon 2026-07-06 (go-live). Admin can edit periods; the monthly rollup query is kept separately for the future Operations Manager. |
| 2 | Do all Housecall Pro job types need a checklist, or only some (exclude estimate-only visits)? | R | Every HCP **job** gets a checklist. Estimates are not jobs in HCP and are ignored. Admin setting to exclude job types/tags. |
| 3 | Multi-day jobs: one checklist per job or per appointment? | R | One per job. `checklists.hcp_appointment_id` is nullable so per-appointment can be added without migration. |
| 4 | Mapping HCP job types/tags to Project Type (HVAC / Water Heater / Generator / Other)? | R + D | Keyword match on job type name then tags ("hvac", "ac", "furnace", "heat pump"; "water heater", "wh"; "generator"); else Other. Caller can change it. Rules live in `app_settings`. |
| 5 | Does pay depend on scores or only on submission? | R | Submission only in v1. Scores are computed and stored from day one either way. |
| 6 | Step 33 "sign checklist": is the caller's Submit enough, or must the technician confirm? | R | Caller's Submit is the signature. Submitter name and timestamp are recorded as the "Print / Signature / Date" block. |
| 7 | Should callers see all technicians or only assigned ones? | R | All technicians (the call team covers everyone). Per-caller technician filters are a UI preference, not a permission. |
| 8 | Subdomain (for example `checklist.rseenergygroup.com`)? | T + R | Deploy on the Vercel default URL first; add the subdomain in Phase 3 (needs a CNAME from whoever manages RSE DNS). |

## B. New questions from the workbook

| # | Question | Who | Default assumed |
|---|---|---|---|
| 9 | Sub-items 6a/6b, 16a/16b/16c, 29a/29b/29c each have their own answer cell. Keep them as answerable items in the app? | R | Yes (full fidelity, nothing lost versus the workbook). Rendered smaller and indented; M75 "completed marks" counts them exactly as Excel does. |
| 10 | Steps 12-14 have both a date and a Y/N/B. Keep both? | R | Yes. Date is optional; Y/N/B drives nothing in scoring. |
| 11 | Callback checklists are excluded from the monthly rollup (Task1:Task35 only). Intended? | R | Yes. Production counts filter `type = task`; callbacks are shown as their own count. |
| 12 | 9a/9b (customer declined / accepted) are not used in any formula; "Declined %" is derived from quotes minus started. Keep as is? | R | Keep workbook semantics for v1. Store 9a/9b so the Operations Manager can report true decline counts later. |
| 13 | Typos in step wording ("technicial", "communcating", "repairs(s)"). Fix in the app or keep verbatim? | R | Keep verbatim (PRD says the workbook is the source of truth). One-line change later. |
| 14 | `B` (Call Back) is allowed on every step by the legend but only instructed at step 33. Allow B everywhere? | R | Allow everywhere, with a hint on step 33. B never counts as Y in scoring. |
| 15 | Technicians in HCP: which employees are field techs? HCP `employees[].role` is a free string (example value "field tech"). | D | Import all active employees; mark `is_technician` when role contains "tech"; admin can toggle. |

## C. Infrastructure and integration risks

| # | Risk | Mitigation |
|---|---|---|
| 16 | **GitHub repo `TimVanC/RSE-QAQC-Checklist` is PUBLIC.** Planning docs quote the client's checklist wording; the PRD contains pricing. | Recommend switching the repo to private before the next push. Until then the PRD and the workbook are not committed (`.gitignore` blocks `*.xlsx`). |
| 17 | Vercel plan tier unknown. Hobby limits cron jobs to once per day, which breaks the 15-30 minute reconcile. | Webhooks are the primary freshness path; cron is the safety net. Confirm the plan; if Hobby, use a daily cron plus an external 15-minute pinger (or upgrade to Pro). |
| 18 | Neon org is on the Free plan (100 projects, 100 CU-hours/project/month, scale to zero after 5 min). A 4th project is fine. | Cold starts of a few hundred ms on first request after idle; acceptable for a call-team app. Upgrade to Launch if it becomes annoying. |
| 19 | Managed Better Auth magic links use a shared SMTP sender by default (dev only per Neon). | Configure a dedicated sender (Resend or similar) with an RSE-owned domain before go-live, or the `send.magic_link` webhook. Needs DNS records from RSE. |
| 20 | Webhook registration happens in the HCP dashboard and needs an HCP admin (Ron). The signing secret is shown once. | Provide Ron a 5-line instruction; store the secret as `HCP_WEBHOOK_SECRET`. Sync works without webhooks (cron only) until then. |
| 21 | HCP docs do not state the timezone of `work_timestamps.*` or appointment times, nor the money unit for job amounts. | Day-1 verification script against one real job and invoice; result recorded in `docs/reference/`. Auto-check evidence always shows the raw value. |
| 22 | HCP has no `updated_at` filter; page-number pagination can skip rows while data changes. | Windowed scheduled-start queries plus a `sort_by=updated_at` scan to a watermark; upserts are idempotent; nightly 30-day backfill catches stragglers. |
| 23 | Rate limits are undocumented (only `429` + `RateLimit-Reset`). | Concurrency 2, exponential backoff, honour reset header, small windows. At 5 techs x 5 jobs/day this is tens of calls per sync. |
| 24 | Step 1 "arrive 30 minutes early": HCP has `on_my_way_at` and `started_at` but no arrival event. | Suggest from `started_at` vs `scheduled_start` and label it as such; caller confirms. Low-confidence suggestions are shown unselected with evidence. |
| 25 | HCP says API-key integrations are unsupported by them and break if the key is deleted. | Key lives only in Vercel env; admin page shows last successful sync so a broken key is noticed within one cycle. |
| 26 | No filled sample workbook exists, so "match the sample workbooks" cannot be tested literally. | Scoring fixtures are generated by filling the template and recalculating in Excel (`scripts/workbook/excel_oracle.py`); tests assert the TypeScript scorer reproduces those numbers. Ask Ron for one filled real workbook to add as a fixture. |
| 27 | Time zones: call team in the Philippines, dates in America/New_York, HCP UTC. | Every date boundary (call queue day, pay period) is computed in America/New_York on the server with `date-fns-tz`; UI labels "NJ time". |
| 28 | Data ownership: RSE must be able to take the data. | Admin export (CSV/JSON of every table); Neon project can be transferred to an RSE-owned org; repo transferable. |
