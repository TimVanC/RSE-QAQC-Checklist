# Runbook: RSE QA/QC Checklist

For Tim (builder and admin). Facts about the app were read from the code in this repository. Facts about
Vercel, Neon and Housecall Pro (HCP) settings are what was true on 2026-10-13 or what the docs in `docs/`
say; verify them in the dashboards before relying on them. Paths are relative to the repo root.

Contents: [1 Environments and secrets](#1-environments-and-secrets) |
[2 Go-live checklist](#2-go-live-checklist) | [3 Daily operation](#3-daily-operation) |
[4 Users](#4-users) | [5 Checklists](#5-checklists) | [6 Pay periods](#6-pay-periods) |
[7 Data export and ownership](#7-data-export-and-ownership) |
[8 Deploying and rolling back](#8-deploying-and-rolling-back) | [9 Local development](#9-local-development) |
[10 Known limitations](#10-known-limitations)

## 1. Environments and secrets

| Thing | Value |
|---|---|
| Production URL | `https://rseqaqc.com` (custom domain, registered at Porkbun). `https://www.rseqaqc.com` 308-redirects to it; `https://rse-qaqc-checklist.vercel.app` still serves the same deployment. |
| Vercel | project `rse-qaqc-checklist`, team `tims-projects-6e08583a`, Hobby plan (daily crons only). The repo is linked (`.vercel/project.json`), so run Vercel CLI commands from the repo root. The Vercel MCP token is read-only: change project settings with the CLI. |
| Neon | project `rse-qaqc-checklist` (id `steep-darkness-94412656`), database `rse_qaqc`, branch `main`. Managed Better Auth is on; login emails use Neon's shared sender for now. |
| Deploys | A push to `main` deploys to production. |

Every variable in `.env.example`, and where it lives (status from `vercel env ls` on 2026-10-13):

| Variable | What it is | Vercel Production | Vercel Preview | `.env.local` |
|---|---|---|---|---|
| `DATABASE_URL` | Neon connection string (HTTP driver, `sslmode=require`) | set | set | yes |
| `NEON_AUTH_BASE_URL` | Managed Better Auth endpoint from the Neon console | set | set | yes |
| `NEON_AUTH_COOKIE_SECRET` | 32+ random characters; signs the session cookie | set | set | yes |
| `HCP_API_KEY` | Housecall Pro read-only API key, server side only | **not set yet** | not set | only to run `npm run hcp:verify` |
| `HCP_WEBHOOK_SECRET` | HCP webhook signing secret (HMAC-SHA256) | **not set yet** | not set | no |
| `RESEND_API_KEY` | Resend API key for the branded invite / reset emails (section 2.12) | set when 2.12 is done | not set | no |
| `EMAIL_FROM` | Sender shown on those emails; the domain must be verified in Resend | `RSE QA/QC Checklist <no-reply@rseqaqc.com>` (default in code) | same | no |
| `EMAIL_LOGO_URL` | Optional logo URL for the email header | not set | not set | no |
| `CRON_SECRET` | Bearer secret for `/api/cron/*`; Vercel Cron sends it when the variable exists | set | set | yes |
| `APP_TIMEZONE` | IANA zone for pay periods, the queue day and displayed times | set | set | yes |
| `NEXT_PUBLIC_APP_URL` | Public base URL; used in password-reset links sent by the invite and reset actions | set | not set | `http://localhost:3000` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` | First admin for `npm run db:seed` | no | no | yes |

What happens when one is missing:

- `HCP_API_KEY` unset: sync endpoints and the Refresh button answer 503, the admin sync buttons report an error, `/admin/sync` shows "not set". The app keeps serving what is already in the database.
- `HCP_WEBHOOK_SECRET` or `HCP_API_KEY` unset: `POST /api/webhooks/hcp` answers 503 `webhooks not configured` (both are required).
- `CRON_SECRET` unset: `/api/cron/*` answers 503 `unconfigured`.
- Only `NEXT_PUBLIC_*` variables reach browser code, and Next.js freezes them at build time, so redeploy after changing `NEXT_PUBLIC_APP_URL`.
- `APP_TIMEZONE` is read by `src/lib/time.ts`, which client components also import. Browser code cannot see it and falls back to `America/New_York`. Leave it at `America/New_York`.
- `.env.local` may also hold `VERCEL_OIDC_TOKEN` (written by `vercel env pull`). The app does not use it.
- Secrets are never committed: `.gitignore` blocks `.env*` except `.env.example`.
- Preview has its own `DATABASE_URL`. Compare it with Production in the Neon console: if it points at branch `main`, a preview deployment can change production data.

See what is set:

```bash
vercel env ls
```

Add a variable (prompts for the value; `--sensitive` makes it unreadable afterwards):

```bash
vercel env add HCP_API_KEY production --sensitive
```

Rotate (overwrite) a variable:

```bash
vercel env add HCP_API_KEY production --force --sensitive
```

A new value only applies to new deployments. Find the current production deployment URL:

```bash
vercel ls --environment production
```

Redeploy it so it picks up the new environment:

```bash
vercel redeploy <production-deployment-url>
```

Generate a random secret (for `CRON_SECRET` or `NEON_AUTH_COOKIE_SECRET`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Rotation notes:

| Secret | Do this |
|---|---|
| `HCP_API_KEY` | Generate a new read-only key in HCP, set it, redeploy, press Run reconcile now on `/admin/sync`, and only then delete the old key in HCP (deleting the key breaks the sync). |
| `HCP_WEBHOOK_SECRET` | HCP shows the secret once. If it is lost, register the webhook again in HCP to get a new one (check the dashboard), set it, redeploy. |
| `CRON_SECRET` | Set, redeploy. Update the external pinger header if you use one (section 3.5). |
| `NEON_AUTH_COOKIE_SECRET` | Set, redeploy. Existing session cookies stop validating, so everyone signs in again. |
| `DATABASE_URL` | Reset the role password in the Neon console, then update Production, Preview and `.env.local`, and redeploy. |

## 2. Go-live checklist

Order matters in two places: secrets before webhooks, and day-1 verification before the first backfill.

### 2.1 Neon Auth: login has to work first

Login is email + password (decided 2026-10-15). Email+password is enabled by default in Neon Auth, so no console toggle is needed. The Neon console cannot restrict sign-up yet; that is fine because the app refuses any session that has no invited, active `app_users` row.

- [ ] Confirm there is a first admin row: if missing, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_NAME` in `.env.local` and run `npm run db:seed` (idempotent: creates the admin row and default `app_settings`). The same email must exist as a Neon Auth user (Neon console > Better Auth > Create user, or the invite flow once another admin exists).
- [ ] Set the first admin's password. The seeded admin's Neon Auth user has no password yet, so use **Forgot password** on the login page: enter the admin email, open the emailed link (Neon's shared sender; check spam), choose a password, sign in. If no email arrives, the Neon Auth user may have no credential account: delete it in the Neon console (Better Auth > Users > ⋮ > Delete), then `POST <NEON_AUTH_BASE_URL>/sign-up/email` with `{ "email", "password", "name" }` once to recreate it with a password, and re-mark it admin in the console (⋮ > Make admin). The `app_users` row links itself by email on the first sign-in.
- [ ] Mark the first admin as **Admin** in Neon Auth (console > Better Auth > Users > ⋮ > Make admin). App admins need the Better Auth admin role to create users and set passwords; the invite flow does this automatically for admins invited later.
- [ ] Invite a second address of yours from `/admin/users` with a temporary password and sign in with it; then try "Send reset email" on it. This proves the admin API and the email sender work.

### 2.2 Email sender

- [ ] Email is only used for password resets ("Forgot password", "Send reset email", and invites that choose the set-password link). Admin-set temporary passwords need no email at all. Before relying on reset emails for the call team, replace Neon's shared sender with a dedicated one (open question 19): Resend or similar on an RSE-owned domain. It needs DNS records from whoever manages RSE DNS. Configure it in the Neon Better Auth settings.

### 2.3 Sample data

- [ ] If `npm run dev:seed-hcp` was ever run against this database, remove the sample rows before real data arrives: see [10.1](#101-remove-sample-data). Run the preview query there to check.

### 2.4 Housecall Pro API key

- [ ] An HCP admin creates the key: Admin > My Apps > All Apps > API Key Management > Generate API Key, permission **Read-only**.
- [ ] Store it in production (prompts for the value):

```bash
vercel env add HCP_API_KEY production --sensitive
```

- [ ] Put the same key in `.env.local` (the verification script below reads it from there), then redeploy (section 1).
- [ ] `/admin/sync` > Connection now shows "Housecall Pro API key: configured".

### 2.5 Day-1 verification (before the first backfill)

Run the read-only probe. It prints the company time zone, raw timestamp strings on recent completed jobs, the invoice money fields, which `page_size` values the API honours, and the employee roles:

```bash
npm run hcp:verify
```

Record the answers in `docs/reference/housecall-pro-api.md`, then act on them:

| Item | Current assumption | If the output differs |
|---|---|---|
| Timestamp timezone | `scheduled_start/end` are UTC; naive `started_at`, `completed_at`, appointment times and `updated_at` are read as UTC (`parseHcpTimestamp` in `src/lib/hcp/mappers.ts`) | If the naive values are local time (they differ from `scheduled_start` by the UTC offset), change `parseHcpTimestamp` to read them in the company time zone, run `npm test`, deploy. This feeds auto-check steps 1 and 30 and the queue's in-progress and completed badges. |
| Money unit | Job and invoice integers are cents (`toCents`) | If they are dollars, change `toCents`. Auto-check step 11 compares against 10000 cents. |
| Page size | 50 (`pageSize` default in `src/lib/hcp/client.ts`) | Raise it only if the probe shows 100 or 200 are honoured. |
| Employee roles | A person is flagged `is_technician` when the role is empty or contains tech, field, install or service (`isTechnicianRole`) | Adjust the pattern, or fix individual people with SQL (section 3.7). |

Why before the first backfill: reconcile and backfill refetch a job's invoices only when the job's `updated_at` moves forward (`isNewOrNewer` in `src/lib/hcp/sync.ts`). A unit or timezone fix made after the first backfill corrects job rows on the next run but not the stored invoice and payment rows.

### 2.6 Webhook

- [ ] An HCP admin (MAX plan) registers it: My Apps > All Apps > Webhooks > Active, URL `https://rse-qaqc-checklist.vercel.app/api/webhooks/hcp`, Save. HCP then shows a signing secret **once**. Copy it.
- [ ] Store it, then redeploy (until then the endpoint answers 503):

```bash
vercel env add HCP_WEBHOOK_SECRET production --sensitive
```

- [ ] Enable these events. All are handled by `routeWebhookEvent`: job events refetch the job, invoice events refetch the invoice's job, customer events refetch the customer, `job.deleted` sets `deleted_at`.

```text
job.created, job.updated, job.scheduled, job.on_my_way, job.started, job.completed, job.canceled, job.deleted, job.paid,
job.appointment.scheduled, job.appointment.rescheduled, job.appointment.appointment_discarded,
job.appointment.appointment_pros_assigned, job.appointment.appointment_pros_unassigned,
invoice.created, invoice.sent, invoice.paid, invoice.amount_updated, invoice.canceled, invoice.voided,
invoice.payment.succeeded, invoice.payment.failed, invoice.refund.succeeded,
customer.created, customer.updated
```

- [ ] Verify the endpoint is public and checks signatures. An unsigned request must be rejected by the app, not by a Vercel login page: `503` until both `HCP_API_KEY` and `HCP_WEBHOOK_SECRET` are set on the deployment, then `401` with `"reason":"missing_headers"`.

```bash
curl -i -X POST https://rse-qaqc-checklist.vercel.app/api/webhooks/hcp
```

- [ ] Change something on a job in HCP. Within a minute `/admin/sync` > Webhook events shows the event with status `processed`.

### 2.7 First backfill

- [ ] `/admin/sync` > Run backfill now. It runs inside the page request (300 second limit): employees, job types and tags, then jobs from 30 days back to 30 days ahead, with one invoice call per job. If it times out, run it again; unchanged jobs are skipped, so the second pass is faster.
- [ ] Check for a `backfill` / `admin` row with status `ok`, and that the Data tiles show Jobs, Technicians, Customers and Invoices above zero.
- [ ] Compare "flagged as technician" under Technicians with your real field staff; fix with the SQL in 3.7.
- [ ] Open `/queue` for today and compare it with HCP.

### 2.8 Pay periods

- [ ] Get Ron's answer on cadence and start day (open question 1). The default is biweekly, Monday, anchored on 2026-07-06. Set the rule and generate periods (section 6).

### 2.9 Invite users

- [ ] `/admin/users` > Invite for Ron, Relene and the call team, with roles from section 4. Each person gets a link that expires in 15 minutes; use Resend link if it lapses.

### 2.10 Custom domain (done 2026-10-23: rseqaqc.com)

The app is served at `https://rseqaqc.com`. What was set up, in case it has to be repeated for another host:

- [x] Domain registered at Porkbun (Tim's account). DNS there: `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com` (Porkbun's default parking records were removed).
- [x] Both hosts added to the Vercel project; `www` redirects to the apex with a 308:

```bash
vercel domains add rseqaqc.com rse-qaqc-checklist
vercel domains add www.rseqaqc.com rse-qaqc-checklist
```

- [x] `NEXT_PUBLIC_APP_URL` (production) set to `https://rseqaqc.com`, so password-reset links use the new host. It is frozen at build time, so the next deploy picks it up.
- [ ] Add `https://rseqaqc.com` as a trusted origin in Neon Auth (Neon console > project > Auth > Better Auth settings). Keep the `.vercel.app` origin. Until this is done, sign-in on the new host may be rejected by Better Auth's origin check.
- [ ] Optional: change the HCP webhook URL to `https://rseqaqc.com/api/webhooks/hcp`. Not required; the `.vercel.app` URL keeps working.

Check from any machine:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}
' https://www.rseqaqc.com/login
```

### 2.11 Repository visibility

- [ ] `TimVanC/RSE-QAQC-Checklist` was PUBLIC on 2026-10-13 (`gh repo view`). Open question 16 recommends private, because the code and docs contain the client's checklist wording:

```bash
gh repo edit TimVanC/RSE-QAQC-Checklist --visibility private --accept-visibility-change-consequences
```

### 2.12 Branded sign-in emails (Resend + Neon Auth webhook)

By default Neon Auth sends its own "Reset Your Password" email from `auth@mail.myneon.app`, with
the Neon project name as the heading and no way to edit the template. The app can take over
delivery instead: Neon calls `POST /api/webhooks/neon-auth` for every `send.magic_link` event
(invites and password resets both arrive as `link_type: forget-password`), the app verifies the
Ed25519 signature against Neon's JWKS, picks a template (account setup when the person has never
signed in, password reset otherwise; see `src/lib/email/templates.ts`) and sends it through Resend
from `no-reply@rseqaqc.com`.

Order matters: once the webhook is subscribed, Neon stops sending its own email, so Resend must
work first.

- [x] Resend: account exists (Tim), domain `rseqaqc.com` is verified (DNS at Porkbun done 2026-10-26).
- [x] Resend: API key `rseqaqc-app (sending only)`, restricted to the domain, set in Vercel on 2026-10-26 together with `EMAIL_FROM`. To rotate:

```bash
vercel env add RESEND_API_KEY production
```

- [ ] Optional: put the logo at `public/brand/email-logo.png` and set `EMAIL_LOGO_URL` to
      `https://rseqaqc.com/brand/email-logo.png`. Without it the header is the app name in text.
- [ ] Redeploy (any push to `main`), then send yourself a test through the API to prove Resend
      works end to end (replace the key):

```bash
curl -X POST https://api.resend.com/emails -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" -d '{"from":"RSE QA/QC Checklist <no-reply@rseqaqc.com>","to":["you@example.com"],"subject":"Resend test","text":"ok"}'
```

- [x] Neon Auth application name set to `RSE QA/QC Checklist` (2026-10-26).
- [ ] Neon console > project > **Better Auth** > settings > **Enable webhooks**: URL
      `https://rseqaqc.com/api/webhooks/neon-auth`, events: `send.magic_link` only, timeout 10 s.
      (Do not subscribe `send.otp`; the app does not use OTP codes.) CLI equivalent:

```bash
neon neon-auth config webhook update --enabled --url https://rseqaqc.com/api/webhooks/neon-auth --enabled-events send.magic_link --timeout 10
```

- [ ] Test: `/admin/users` > Send reset email on your own row. The branded email should arrive
      from `no-reply@rseqaqc.com` within a few seconds. If nothing arrives, check the Vercel
      function logs for `[neon-auth webhook]`: a 401 means the signature failed (wrong
      `NEON_AUTH_BASE_URL`), a 503 means `RESEND_API_KEY` is missing, a 502 means Resend rejected
      the send (usually an unverified domain).

Rolling back: disable the webhook in the Neon console and Neon's default email returns at once.

## 3. Daily operation

### 3.1 How jobs get in

| Path | When | What it does |
|---|---|---|
| Webhook | Seconds after an HCP event (once registered) | Stores the delivery in `webhook_events`, answers 200, then refetches the one job (with appointments and invoices) or customer from HCP. `job.deleted` sets `deleted_at`. |
| Reconcile | Vercel Cron `0 1 * * *` (UTC) = 21:00 New Jersey on daylight time, 20:00 on standard time (early November to mid March) | Jobs scheduled from 2 days ago to 7 days ahead (NJ days), plus any job HCP changed since the last successful reconcile (minus 5 minutes; 24 hours back if there was none; capped at 1,000 jobs, and hitting the cap fails the run, see 3.6), then retries pending and failed webhook events. |
| Backfill | Vercel Cron `30 7 * * *` (UTC) = 03:30 daylight / 02:30 standard | Employees, job types and tags, and jobs from 30 days back to 30 days ahead. |
| Refresh button | Any signed-in user, on `/queue` | Re-syncs the one NJ day being viewed. At most one refresh per minute for the whole app; a second click shows "Already refreshed, try again in N s". |
| Admin buttons | `/admin/sync` | Run reconcile now, Run backfill now, Retry webhooks. |

The Hobby plan allows only daily crons, so the working day is carried by webhooks and the Refresh button. Until the webhook is registered (2.6), the queue changes only at the nightly reconcile and when someone presses Refresh. Every write is an upsert keyed by the HCP id; a job or customer row is only overwritten by an update that is not older than what is stored. Nothing is deleted: cancellations and deletions set `canceled_at` / `deleted_at`.

### 3.2 What "Updated X min ago" means

The label on the call queue is the time since the most recent sync run with status `ok`, of any kind (nightly reconcile, backfill, a Refresh click, an admin run). Hover shows the exact NJ time and the kind. Webhook deliveries do not create sync runs, so the label does not move when a webhook updates a job. On the Hobby schedule it is normal to read many hours between cron runs while webhooks keep jobs current. "No sync yet" means no successful run exists.

### 3.3 What `/admin/sync` shows

- **Connection**: API key configured or not set; last successful sync (time, kind, trigger); webhook events pending or failed (counts every `pending` event and every `failed` event, including ones out of retries); buttons Run reconcile now, Run backfill now, Retry webhooks.
- **Data in database**: totals for jobs, technicians (and how many are flagged as technician), customers, invoices.
- **Sync runs**: the latest 25, with start (NJ time), kind, trigger (`cron`, `admin`, `user`), status (`running`, `ok`, `error`), duration, count chips and the error text. Chips: `window_jobs` jobs returned for the date window, `recent_jobs` jobs returned by the updated-since scan, `unchanged` jobs whose invoices were not refetched, `invoice_fetches`, `jobs` / `customers` / `appointments` / `invoices` / `payments` rows written, `recent_truncated` when the updated-since scan hit its cap (the run is then marked `error`), `stale_skipped` for a job snapshot that was older than what is stored and was skipped, `webhook_processed` / `webhook_failed` / `webhook_skipped` for retries.
- **Webhook events**: the latest 25, with received time, event name, status (`pending`, `processed`, `failed`, `skipped`), attempts and error. `skipped` means the event type is not used or the payload had no usable id (the error says which). Rejected deliveries (bad signature) are not stored here.

### 3.4 Run a sync by hand

From the UI: `/admin/sync` > Run reconcile now or Run backfill now. They run inside the page request (300 second limit) and a toast reports the result. Run reconcile now does not retry webhook events; use Retry webhooks for that (the cron reconcile does both).

From a terminal, using the same secret the cron uses (a 200 body is the run result; 401 wrong secret, 503 `CRON_SECRET` or `HCP_API_KEY` not set, 500 the run failed):

```bash
curl -H "x-cron-secret: $CRON_SECRET" https://rse-qaqc-checklist.vercel.app/api/cron/reconcile
```

```bash
curl -H "x-cron-secret: $CRON_SECRET" https://rse-qaqc-checklist.vercel.app/api/cron/backfill
```

### 3.5 Optional: external 15-minute pinger

If Ron wants the original 15-minute freshness without upgrading Vercel, point an external scheduler (for example cron-job.org) at the reconcile endpoint every 15 minutes. The endpoint accepts the secret as `x-cron-secret` as well as Vercel's bearer header:

```text
GET https://rse-qaqc-checklist.vercel.app/api/cron/reconcile
Header: x-cron-secret: <CRON_SECRET>
```

Each call is a full reconcile (date window, updated-since scan, webhook retries), so it also fixes anything a webhook missed. Update the header when `CRON_SECRET` is rotated.

### 3.6 When sync shows errors

| What you see | Likely cause | What to do |
|---|---|---|
| Run `error`: `HcpApiError: HCP 401 on ...` (or 403) | API key deleted, revoked or lacking permission. HCP does not support or maintain API-key integrations, and deleting the key breaks the sync (open question 25). Any 4xx other than 429 fails immediately; 401 or 403 means the key. | Create a new read-only key in HCP, rotate `HCP_API_KEY` (section 1), redeploy, Run reconcile now. |
| Run `error`: `HCP 429 on ...` | Rate limited. The client already retried 5 times with backoff, honouring `RateLimit-Reset`. | Wait a few minutes and run again; runs are idempotent and keep partial progress. If it repeats, pause any external pinger and do not overlap a backfill with other runs. |
| Run `error`: `network error after 5 attempts` or `HCP 5xx` | HCP outage or timeout (20 second per-request limit). | Retry later. |
| Webhook response 401 (see Vercel logs, below) | `reason: bad_signature`: `HCP_WEBHOOK_SECRET` does not match the secret HCP signs with. `stale`: the delivery timestamp is more than 5 minutes from server time. `missing_headers` or `bad_timestamp`: not a genuine HCP delivery. | For `bad_signature`, re-copy the secret or register the webhook again in HCP, set the variable, redeploy. |
| Webhook response 503 | `HCP_WEBHOOK_SECRET` or `HCP_API_KEY` is not set on the deployment that received it. | Set it and redeploy. |
| Run `error`: `recently-updated scan truncated after N jobs; watermark not advanced` | More than 1,000 jobs changed in HCP since the last successful reconcile (for example after a long outage or a bulk edit). The jobs it read were saved, but the run counts as failed, so the next reconcile starts from the same point. | Run reconcile now once the cause is gone. If it keeps failing, the cap (`maxPages` in `syncRecentlyUpdated`, `src/lib/hcp/sync.ts`) has to be raised in code. |
| Webhook events `failed` | The refetch from HCP failed; the `error` column says why. `failed` events are retried by the nightly reconcile and by Retry webhooks, up to 5 attempts in total. | Fix the cause (usually the API key), press Retry webhooks. After 5 attempts an event stays `failed`; run reconcile or Refresh for that day to bring the job up to date. |
| A run shows `running` for a long time | The function was killed (300 second limit) before it could record the result. | The next sync that starts marks any run older than 15 minutes as `error` ("timed out"). Run again. |
| "Updated N h ago" keeps growing and there are no new runs | The cron is not firing or is rejected. | `vercel logs` for `/api/cron/reconcile`: 503 means `CRON_SECRET` or `HCP_API_KEY` is missing, 401 means the secret does not match. |
| A job is missing from the queue | HCP shows no scheduled start (unscheduled jobs never appear); the job is outside the last reconcile window and unchanged; the job type is excluded (3.7); the job was deleted in HCP. Canceled jobs do appear, with a Canceled badge. | Press Refresh for that day, or Run backfill now. |

Find rejected webhook deliveries (they never reach the database):

```bash
vercel logs --environment production --status-code 401 --since 1h
```

### 3.7 What the queue shows: technicians and excluded job types

There is no screen for these; use the Neon console SQL Editor (database `rse_qaqc`, branch `main`). The sync never overwrites `is_technician` or `active` on an existing person.

List people and their flags:

```sql
SELECT hcp_employee_id, first_name, last_name, hcp_role, is_technician, active
FROM technicians ORDER BY first_name, last_name;
```

Keep a non-technician (office, sales) out of the queue, tracker and production:

```sql
UPDATE technicians SET is_technician = false WHERE hcp_employee_id = '<hcp employee id>';
```

Retire a technician who left (HCP stops listing them, but the sync never deactivates anyone). The queue still shows them on old jobs; the tracker stops listing them at once, and production lists them only for periods in which they have checklists:

```sql
UPDATE technicians SET active = false WHERE hcp_employee_id = '<hcp employee id>';
```

Job type names found in HCP (filled by the backfill):

```sql
SELECT jsonb_pretty(value -> 'job_types') FROM app_settings WHERE key = 'hcp_catalog';
```

Hide job types from the queue and tracker (names matched after trimming, ignoring case; jobs with no job type are never hidden):

```sql
INSERT INTO app_settings (key, value) VALUES ('excluded_job_types', '["Estimate"]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

## 4. Users

| Can do | Caller | Manager | Admin |
|---|---|---|---|
| Call queue and Refresh | yes | yes | yes |
| Open, fill and submit checklists; create call back checklists (any technician's) | yes | yes | yes |
| Reopen a submitted checklist | no | yes | yes |
| Completion tracker and Production | no | yes | yes |
| Admin area: Users, Pay periods, Sync, Export | no | no | yes |

The role is read from the `app_users` table on every request, so a change applies on the person's next click. A page above someone's role redirects to a "No permission" screen; an action returns an error.

**Invite**: `/admin/users` > Invite (email, name, role, optional temporary password). This creates the `app_users` row and the sign-in account in Neon Auth. Leave the password blank to have one generated; it is shown once on screen, so pass it to the person right away. Tick "Email them a link to choose their own password" to skip passwords entirely (needs a working email sender). An email that already exists is refused ("A user with that email already exists"); use Set password, Send reset email or Reactivate instead. Admins invited through this form are also made admins in Neon Auth so they can set passwords themselves.

**Sign in**: email and password on the login page. **Forgot password** emails a link that expires in 15 minutes. Signed-in users change their password under their name in the header (Account); other devices are signed out.

**Set password** (admin, in the Users table): type a temporary password or leave the prompt blank to generate one (shown once). **Send reset email** emails the person a set-password link instead. Neither works for a deactivated user.

**Change role**: the role dropdown in the table. You cannot change your own role or deactivate yourself.

**Deactivate**: sets `active = false` and revokes the person's sessions (best effort). History stays; there is no delete. Reactivate with the same button.

**"No access"**: the sign-in worked in Neon Auth but there is no active `app_users` row for that email. The page says "Account not set up". Causes: never invited, signed in with a different address than the one invited (the row is matched by lower-cased email on first sign-in), deactivated, or the invited row is already linked to a different sign-in account. Fix by inviting the right address or reactivating. Inside the app, a deactivated person's actions fail with "Please sign in again."

## 5. Checklists

1. **Open from the queue.** `/queue` is the home screen: pick the NJ day, jobs are grouped by technician (a job with two technicians appears under both; jobs without a technician are under "Unassigned"). Badges show the HCP work state, the checklist state (Not started, In progress, Submitted) and any call back count. Open checklist creates the Appointment/Service Call checklist on first use (one per job, enforced by a unique index; it starts as Not started) and reuses it afterwards.
2. **Prefill.** Customer, project type (guessed from job type, tags and description by `src/lib/hcp/project-type.ts`; blank when nothing matches), location, project date and referral/project number (the invoice number). The technician is the assigned person flagged as a technician (if there are several, the one whose name sorts first).
3. **Autosave.** Each Y/N/B saves at once, the score is recomputed on the server, and the first saved answer moves the checklist from Not started to In progress; text and date fields save after a short pause and on blur. The footer shows Saving, Saved or "Last change not saved". Keyboard: `y` `n` `b` answer and move on, arrows or `j` `k` move, Backspace clears, Enter moves on (on the last step it focuses Submit), `?` lists shortcuts.
4. **HCP suggestions.** Steps 1, 10, 11, 27 and 30 show a suggestion with its evidence. They never fill themselves in; confirming or overriding is recorded (`manual`, `auto_confirmed`, `auto_overridden`). Low-confidence suggestions show unselected.
5. **Submit.** A confirmation dialog warns about blank scoring steps (submitting is still allowed). Submitting sets step 33 to Y (a B the caller entered there is kept), records who and when, and locks the checklist: the screen is read-only and the server rejects edits ("A manager must reopen it").
6. **Manager reopen.** Managers and admins see Reopen on a submitted checklist. It goes back to In progress, records who and when, and must be submitted again before the end of the pay period.
7. **Call backs.** Answering step 31 with Y shows Create Call Back Checklist (and Create another). A call back is a separate checklist linked to the original, with the same header, its own score and its own submit/reopen. It never counts as the job's checklist: the tracker shows "+ N call backs" and Production has a Call backs column. Reach one from the links on the original checklist; call backs are not listed in the queue. There is no limit on how many can be created.
8. **Audit trail.** Every checklist create, answer, field edit, submit, reopen and call back creation, and the admin actions (invite, role change, deactivate, pay period changes), is written to `audit_log`. There is no screen for it. Download it from Admin > Export > Audit log, or query it (the checklist id is the UUID in the `/checklists/<id>` address; answer rows use `<id>:<step key>`):

```sql
SELECT a.at, u.email, a.entity, a.entity_id, a.action, a.before, a.after
FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id
WHERE split_part(a.entity_id, ':', 1) = '<checklist id>'
ORDER BY a.at;
```

## 6. Pay periods

- **Rule**: a cadence (weekly, biweekly or monthly) and an anchor date (the first day of any period; ignored for monthly, which uses calendar months). Default: biweekly, anchored on Monday 2026-07-06, until Ron confirms (open question 1). Saved in `app_settings.pay_period_rule`.
- **Admin > Pay periods**: Save rule; Generate periods stores every period from one month ago to N months ahead (1 to 36, default 12) using the saved rule, skipping any that overlap stored ones; each stored period can be deleted. Changing the rule does not change stored periods: delete them and generate again.
- **Stored or computed**: the tracker and production pick the stored period that contains the date, otherwise they compute it from the rule, so they work with none stored. Stored periods give a fixed history and fill the period dropdown.
- **Tracker "missing"** (`/tracker`, managers and admins): for each job scheduled in the period (NJ days, both ends included; not canceled, not deleted) and each active technician assigned to it, the status is Submitted, In progress or Missing. Missing means there is no checklist yet (nobody has opened the job from the queue) or it was opened but no step has been answered (the chip's tooltip says which). The first saved answer makes it In progress. Call backs are not counted, a job with two technicians counts once in the totals, and a job with no technician assigned is not listed at all.
- **Production** (`/production`): per technician, task checklists whose call date falls in the period, using the workbook formulas; call backs counted separately.
- **Why it matters**: the workbook says unsubmitted checklists cost 50% of the period's pay. In v1 the app only tracks submission, not scores (open question 5).

## 7. Data export and ownership

`/admin/export` (admin only) downloads live data, so every file reflects the current database:

- **Download everything (JSON)**: one file with all seven datasets below plus the export time.
- **CSV per dataset**: `checklists` (one row per checklist, with stored scores), `answers` (one row per checklist and step, blanks included), `jobs`, `technicians`, `pay_periods`, `users` (no credentials), `audit_log`.
- Files are named `rse-qaqc-<dataset or all>-<YYYY-MM-DD>.<csv or json>`. CSV is UTF-8 with a byte order mark, so Excel opens it correctly. Timestamps are ISO 8601 in UTC; calendar dates are New Jersey days; people appear by name.
- Not included: raw HCP payloads, customers, invoices and payments (HCP stays the record), sync runs, webhook events and app settings.
- Direct addresses (admin session required): `/api/export/csv?dataset=<name>` and `/api/export/json` (add `?dataset=<name>` for one dataset). The route has a 60 second limit.

Handing the system to RSE (open question 28 commits to this):

1. Download the JSON export and the CSVs and give RSE a copy.
2. Neon: transfer the project to an RSE-owned Neon organization (project settings in the Neon console). Afterwards re-check `DATABASE_URL` and `NEON_AUTH_BASE_URL` in Vercel.
3. GitHub: transfer the repository to RSE's account or organization (repository Settings, Danger Zone), then reconnect the Vercel Git integration.
4. Vercel: transfer the project to an RSE team, or create a new project in their team from the transferred repo, re-add the variables from section 1 and the domain.
5. Rotate every secret in section 1 and issue a fresh HCP key from an RSE admin. Remove your own access last.

## 8. Deploying and rolling back

**Deploy**: push to `main`; Vercel builds and promotes it to production. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, test and build on pushes and pull requests to `main`, but it runs separately from the Vercel deployment, so check it. Locally, run the same four before pushing (section 9).

List recent production deployments:

```bash
vercel ls --environment production
```

**Roll back** to an earlier deployment:

```bash
vercel rollback <deployment-url-or-id>
```

Check a pending rollback:

```bash
vercel rollback status
```

Point production at a specific deployment (also how you move forward again):

```bash
vercel promote <deployment-url-or-id>
```

A rollback changes code only, never the database. After one, confirm with `vercel ls --environment production` which deployment is serving.

**Migrations.** Schema lives in `src/db/schema/*.ts`; SQL migrations are committed under `drizzle/`. There is one Neon database, so `npm run db:migrate` changes production.

1. Edit the schema, then generate the migration:

```bash
npm run db:generate
```

2. Read the new file in `drizzle/` before applying it.
3. Apply it, **before** pushing code that needs it:

```bash
npm run db:migrate
```

4. Push. Code that needs a column must never reach production before the migration does.

Keep migrations additive (new nullable columns or tables) so that the previous deployment still works against the new schema; that is what makes a rollback safe. Before anything destructive or a rename, create a branch of `main` in the Neon console as a restore point.

## 9. Local development

Node 22 or newer. Copy `.env.example` to `.env.local` and fill it in. The values you put in `DATABASE_URL` decide which database you touch: pointed at the production branch, local `npm run dev`, `db:seed` and `db:migrate` all act on production data.

```bash
npm install
```

```bash
npm run dev
```

Opens on `http://localhost:3000` (the `dev` entry in `.claude/launch.json` uses the same port). With no `HCP_API_KEY` the queue shows a "not connected yet" banner and only the data already in the database.

| Script | Use |
|---|---|
| `npm test` | Vitest suite (scoring fixtures, HCP mappers and webhooks, queue, tracker, export, pay periods). `npm run test:watch` for watch mode. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `next typegen` then `tsc --noEmit`. |
| `npm run build` | Production build. CI builds with a placeholder `DATABASE_URL`. |
| `npm run format` | Prettier over the repo. |
| `npm run db:studio` | Drizzle Studio on `DATABASE_URL`. |
| `npm run dev:seed-hcp` | Loads 6 employees and 16 HCP-shaped jobs through the real sync upserts, for building and demos without an API key. **Never run it against production**: its only guard is `VERCEL_ENV === 'production'`, which is not set on your machine, so it will happily write to whichever database `.env.local` points at. |
| `npm run hcp:verify` | Read-only HCP day-1 probe (section 2.5). |

Print the queue for a day without signing in (development only; the date is optional):

```bash
node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/dev/print-queue.ts 2026-10-13
```

**Regenerate the scoring fixtures with Excel.** Only needed if the step configuration or scoring rules change. Requires Windows, Microsoft Excel, `pywin32` and the original workbook `RSE ENERGY GROUP CHECKLISTS CAO 3JUL2026.xlsx`, which is not in the repo (`*.xlsx` is git-ignored because it is client data). The script fills the template with about 60 scenarios, recalculates in Excel and writes `checklists.json` and `rollups.json`:

```bash
python -I scripts/workbook/gen_fixtures.py "<path to the workbook>" tests/scoring/fixtures
```

Then run `npm test`; the TypeScript scorer must reproduce Excel's numbers. The other scripts in `scripts/workbook/` are described in its README.

## 10. Known limitations

- **Daily crons.** The Hobby plan allows only daily schedules (`vercel.json`). Reconcile at 01:00 UTC and backfill at 07:30 UTC land an hour earlier in New Jersey (20:00 and 02:30) while New Jersey is on standard time. Sync code comments and `docs/planning/plan.md` still describe a 15-minute reconcile; `vercel.json` is what runs. Options: the pinger in 3.5, or upgrading the Vercel plan.
- **Freshness label ignores webhooks** (3.2): "Updated X ago" only reflects cron, Refresh and admin runs.
- **HCP assumptions unverified until `npm run hcp:verify` has been run.** Naive HCP timestamps are read as UTC and money is read as cents. Invoice and payment rows are refetched only when the job's `updated_at` increases, and there is no forced refetch.
- **Manual Refresh limit is app-wide**, one run per minute across all users, not per user.
- **No screens for** technician flags, excluded job types, or project type rules. The first two are SQL (3.7); project type keyword rules are fixed in `src/lib/hcp/project-type.ts`.
- **Technicians are never deactivated by the sync.** Someone who leaves HCP stays active until you set `active = false`.
- **Tracker coverage.** Only jobs with at least one active technician assigned are listed; unassigned jobs show in the queue under "Unassigned" but never count as missing.
- **Users table.** "Last login" is written only when a user is linked by email at first sign-in, and the invite flow stores the sign-in account id up front (when Neon Auth returns it), so invited users normally show a blank "Last login" and never get the "Never signed in" badge.
- **A failed "Open checklist"** (for example the job vanished) redirects to `/queue?error=...`, but the queue does not display that message, so the person just lands back on the queue.
- **Spreadsheet formulas are not neutralised in CSV exports.** `csvField` (`src/lib/export/csv.ts`) quotes commas, quotes and line breaks only. A customer name, notes or any text beginning with `=`, `+`, `-` or `@` is written as is and Excel may treat it as a formula. Open CSVs through Data > From Text/CSV rather than double-clicking, or use the JSON export. The fix is to prefix such cells with an apostrophe.
- **Neon Free plan.** The database scales to zero after 5 idle minutes, so the first request after a quiet period is a few hundred milliseconds slower (open question 18).
- **Docs lag the code.** `docs/planning/plan.md` predates the build (Next 15 and `middleware.ts` there; the app is Next 16 with `proxy.ts`). Where it disagrees with the code or this runbook, the code wins.

### 10.1 Remove sample data

`npm run dev:seed-hcp` writes rows whose HCP ids start with `emp_sample_`, `cus_sample_` and `job_sample_` (appointments, invoices and payments hang off the jobs), plus one `sync_runs` row with trigger `dev-seed` that otherwise shows up as a fake "last successful sync". Anything someone did to those jobs (checklists, answers, audit entries) goes with them. Download the JSON export first (section 7); the delete cannot be undone.

Run in the Neon console SQL Editor (database `rse_qaqc`, branch `main`). First look at what will go:

```sql
SELECT
  (SELECT count(*) FROM hcp_jobs WHERE starts_with(hcp_job_id, 'job_sample_')) AS jobs,
  (SELECT count(*) FROM technicians WHERE starts_with(hcp_employee_id, 'emp_sample_')) AS technicians,
  (SELECT count(*) FROM hcp_customers WHERE starts_with(hcp_customer_id, 'cus_sample_')) AS customers,
  (SELECT count(*) FROM checklists WHERE starts_with(hcp_job_id, 'job_sample_')) AS checklists,
  (SELECT count(*) FROM sync_runs WHERE "trigger" = 'dev-seed') AS sync_runs;
```

Then delete, in this order (foreign keys require it). If the editor rejects `BEGIN` and `COMMIT`, run the statements one at a time in the same order; each one is safe to repeat:

```sql
BEGIN;

-- 1. Audit rows for checklists on sample jobs (entity_id is "<checklist id>" or "<checklist id>:<step key>").
DELETE FROM audit_log
WHERE entity IN ('checklist', 'checklist_answer')
  AND split_part(entity_id, ':', 1) IN (
    SELECT id::text FROM checklists WHERE starts_with(hcp_job_id, 'job_sample_')
  );

-- 2. Checklists on sample jobs; answers and scores cascade. Call backs point at their parent, so they go first.
DELETE FROM checklists WHERE type = 'callback' AND starts_with(hcp_job_id, 'job_sample_');
DELETE FROM checklists WHERE starts_with(hcp_job_id, 'job_sample_');

-- 3. Sample jobs; assignees, appointments, invoices and payments cascade.
DELETE FROM hcp_jobs WHERE starts_with(hcp_job_id, 'job_sample_');

-- 4. Sample customers and technicians (nothing references them any more).
DELETE FROM hcp_customers WHERE starts_with(hcp_customer_id, 'cus_sample_');
DELETE FROM technicians WHERE starts_with(hcp_employee_id, 'emp_sample_');

-- 5. The seed script's sync run.
DELETE FROM sync_runs WHERE "trigger" = 'dev-seed';

COMMIT;
```

Afterwards run the preview query again (all zeros), then Run backfill now on `/admin/sync` and check the Data tiles.
