# Housecall Pro Public API: verified reference (read-only use)

Verified 2026-10-13 against the official docs (https://docs.housecallpro.com, Stoplight project `cHJqOjEzMzk2MQ`)
and the Housecall Pro help center. `D/` = `https://docs.housecallpro.com/docs/housecall-public-api/`.
CONFIRMED = stated in the docs. INFERRED / NOT DOCUMENTED are labelled.

## Base URL and auth (CONFIRMED)
- Base URL: `https://api.housecallpro.com`
- Header: `Authorization: Token <api-key>` (OAuth partner apps use `Bearer`). `D/b87d37ae48a0d-authentication`
- Key creation: Admin > My Apps > All Apps > API Key Management > Generate API Key, permission **Full access** or **Read-only**. https://help.housecallpro.com/en/articles/8505035-api-overview
- Plan: MAX (help center); docs home also mentions XL.
- `Accept`/`Content-Type`: not documented; send `Accept: application/json`.
- Multi-location: optional `X-Company-Id` header. Not needed for RSE (single location) but `GET /company` confirms.

## Pagination (CONFIRMED)
Page numbers: `page` (default 1), `page_size` (default 10, **max not documented**). Response: `page`, `page_size`,
`total_pages`, `total_items` plus the named array (`jobs`, `employees`, ...). Page-number paging can skip or
duplicate rows while data changes; tolerate duplicates via upsert.

## Endpoints we use

| Resource | Endpoint | Key params / notes |
|---|---|---|
| Jobs list | `GET /jobs` (`D/6c97704da8bf3-get-jobs`) | `scheduled_start_min/max`, `scheduled_end_min/max` (strings, format undocumented, use ISO 8601 UTC), `employee_ids[]`, `customer_id`, `work_status[]` = `unscheduled|scheduled|in_progress|completed|canceled`, `expand[]` = `appointments|attachments`, `sort_by` = `created_at|updated_at|invoice_number|id|description|work_status`, `sort_direction`. **No `updated_at` filter.** |
| Job | `GET /jobs/{id}` (`D/bbabd67bed1ab-get-a-job`) | `expand[]` |
| Appointments | `GET /jobs/{job_id}/appointments` (`D/512e91c37033f-get-appointments`) | `{appointments:[{id,start_date,start_time,end_time,anytime,arrival_window_minutes,dispatched_employees_ids[]}]}`. **No per-appointment work timestamps.** |
| Job invoices | `GET /jobs/{job_id}/invoices` (`D/eb1f5b5f17290-get-job-invoices`) | `{invoices:[JobInvoice]}` |
| Invoices list | `GET /invoices` (`D/65ce9f430d605-get-invoices`) | `status[]` = `open|pending_payment|paid|voided|uncollectible|canceled`, `customer_uuid[]`, `created_at_min/max`, `due_at_min/max`, `paid_at_min/max`, `amount_due_min/max`, `payment_method[]`, `sort_by` incl. `updated_at`, `paid_at`. Items include `job_id`. |
| Payments | **No standalone endpoint.** | Nested in `invoice.payments[]`: `id,status,payment_method,amount,note,paid_at,category` |
| Employees | `GET /employees` (`D/303ee235f23fa-get-employees`) | Active employees only. `page`, `page_size`, `sort_by`, `sort_direction`. No get-by-id. |
| Customers | `GET /customers`, `GET /customers/{id}` | `q` search, `expand[]` |
| Estimates | `GET /estimates`, `GET /estimates/{id}` | same schedule filters as jobs |
| Job types | `GET /job_fields/job_types` | `{id,name}` (optional `name` filter) |
| Tags | `GET /tags` | `{id,name}` |
| Lead sources | `GET /lead_sources` | `{id,name,editable}` |
| Company | `GET /company` | `time_zone`, `locations[]` |

## Job object (CONFIRMED, `D/a048a4817d91c-job`)
- `id`, `invoice_number`, `description`, `tags[]`, `lead_source`, `original_estimate_id`
- `customer{id, first_name, last_name, email, mobile_number, home_number, work_number, company, tags, ...}`
- `address{id, type, street, street_line_2, city, state, zip, country}`
- `work_status` (response enum): `needs scheduling | scheduled | in progress | complete rated | complete unrated | user canceled | pro canceled`
  (differs from the filter enum `scheduled|in_progress|completed|canceled`)
- `work_timestamps{on_my_way_at, started_at, completed_at}` (nullable; **timezone not stated**, examples are naive)
- `schedule{scheduled_start, scheduled_end (UTC), arrival_window (int minutes), time_zone (IANA), scheduled_start_local, scheduled_end_local, appointments[] when expanded}`
- `total_amount`, `outstanding_balance`, `subtotal` (integers; **cents inferred**)
- `assigned_employees[]{id, first_name, last_name, email, mobile_number, color_hex, avatar_url, role (string, e.g. "field tech"), tags, permissions}`
- `job_fields{job_type{id,name}, business_unit{id,name}}`
- `created_at`, `updated_at`, `canceled_at`, `deleted_at`, `locked_at`, recurrence fields

## Webhooks (CONFIRMED, `D/46e9e1be07621-webhooks`)
- Registration is in the HCP dashboard: My Apps > All Apps > Webhooks > Active, URL, Save; you then get a **signing secret** and pick events. MAX plan. https://help.housecallpro.com/en/articles/5683520-how-to-enable-webhooks
  (`POST/DELETE /webhooks/subscription` exist but are undocumented partner mechanics; not relied on.)
- Events we subscribe to: `job.created, job.updated, job.scheduled, job.on_my_way, job.started, job.completed, job.canceled, job.deleted, job.paid, job.appointment.scheduled, job.appointment.rescheduled, job.appointment.appointment_discarded, job.appointment.appointment_pros_assigned, job.appointment.appointment_pros_unassigned, invoice.created, invoice.sent, invoice.paid, invoice.amount_updated, invoice.canceled, invoice.voided, invoice.payment.succeeded, invoice.payment.failed, invoice.refund.succeeded, customer.created, customer.updated`.
- Payload: `{company_id, event, event_occurred_at (changelog 2025-11-13 also mentions event_created_at), job|invoice|customer|...: {...}}`. The `job` object matches the REST shape.
- Signature: headers `Api-Timestamp` (epoch seconds) and `Api-Signature`. `HMAC_SHA256(secret, Api-Timestamp + "." + raw_body)` compared to `Api-Signature`. **Digest encoding (hex vs base64) and replay window are not documented**: accept either encoding with constant-time compare, reject timestamps older than 5 minutes.
- Retry policy / delivery guarantees: not documented. Design for at-least-once and out-of-order delivery.

## Rate limits (CONFIRMED where stated)
- 429 on limit; response carries `RateLimit-Reset` (epoch). No numeric limit, no `Retry-After` documented.
- Client policy: concurrency 2, exponential backoff with jitter (1s, 2s, 4s, 8s, 16s), honour `RateLimit-Reset`/`Retry-After` when present, max 5 attempts, also retry 5xx and network errors.

## Day-1 verification against RSE's real account (2026-10-23, `npm run hcp:verify`)

- Company `time_zone` is `America/New_York`.
- **Timestamps are UTC with a trailing `Z`** on every field inspected: `schedule.scheduled_start/end`, `work_timestamps.on_my_way_at/started_at/completed_at`, `created_at`, `updated_at`, and appointment `start_time/end_time` (`start_date` was null). `scheduled_start_local` carries the `-04:00` offset. The naive-timestamp fallback in `parseHcpTimestamp` is therefore unused in practice.
- `page_size` 50, 100 and 200 are all honoured.
- Employees: 9 active, roles seen `field tech` (4), `admin` (4), `office staff` (1). Jobs carry several assignees including an `admin` person; the `is_technician` rule keeps only `field tech` in the queue.
- Job types configured: `Diagnostic`, `HVAC Replacement`, `Install`, `Repair`. Only the second maps to a Project Type automatically; the caller picks the rest (open question 4).
- Work statuses seen in the 300 most recently updated jobs: `scheduled` 243, `complete rated` 24, `pro canceled` 14, `complete unrated` 8, `in progress` 6, `user canceled` 3, `needs scheduling` 2.
- Every job's `updated_at` read `2026-10-23T16:56:41Z` at first contact (an account-wide touch), so the first updated-since scan sees everything once.
- **Money unit still unconfirmed**: the sampled jobs and their invoice had `total_amount` and `amount` of 0. Check the first non-zero invoice after the backfill (`select amount_cents, raw_json->'amount' from hcp_invoices where amount_cents > 0 limit 3`).

## Sync caveats
- No incremental `updated_at` filter on jobs. Use windowed `scheduled_start_min/max` queries plus
  `sort_by=updated_at&sort_direction=desc` scans down to a watermark for "anything changed recently".
- `work_status[]` empty returns all statuses, so canceled jobs come back; hard-deleted jobs are not documented (handle `job.deleted` webhook by marking `deleted_at`).
- Timezones: `schedule.scheduled_start/end` are UTC; `work_timestamps.*`, `appointments[].start_time/end_time`, `created_at/updated_at` are **unstated**. Verify against a real job and `GET /company.time_zone` on day 1 and record the finding in `docs/reference/`.
- Money: treat Job/Invoice integer amounts as cents; verify on day 1 against an invoice.
- Housecall Pro states it does not support or maintain API-key integrations; deleting the key breaks the sync. Keep the key in Vercel env only.
