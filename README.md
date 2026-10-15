# RSE QA/QC Production Checklist

Private web app that replaces RSE Energy Group's per-employee Excel QA/QC checklist workbooks. Jobs sync
read-only from Housecall Pro (HCP). The call team, working from New Jersey-day queues, fills an
Appointment/Service Call Checklist (34 steps plus sub-items, 44 answerable items) and Call Back Checklists for each
job; scores follow the workbook formulas; managers track completion and production per technician and pay period.
Production: https://rse-qaqc-checklist.vercel.app (invite only).

## Status

All PRD v1 screens are built: call queue, checklist workspace (autosave, keyboard entry, HCP auto-check
suggestions, submit, manager reopen, call backs), completion tracker, production counts, and the admin area
(users, pay periods, sync, data export). Pending go-live items, in order:

- Set the first admin's password (Forgot password on the login page, or the bootstrap steps in the runbook)
- Set `HCP_API_KEY`, run `npm run hcp:verify`, record the findings in `docs/reference/`
- Register the HCP webhook and set `HCP_WEBHOOK_SECRET`; run the first backfill
- Remove dev sample data, confirm the pay period rule with Ron, invite users
- Dedicated email sender, custom subdomain

The step-by-step version is in [`docs/runbook.md`](docs/runbook.md).

## Stack

Next.js 16 (App Router) and TypeScript on Vercel (Hobby plan, daily crons), Neon Postgres with Drizzle ORM,
Neon Managed Better Auth (email + password, invite only), Tailwind CSS 4 and shadcn/ui, Vitest. Node 22 or newer.
The HCP API key is read-only and server side only.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, NEON_AUTH_*, CRON_SECRET, SEED_ADMIN_*
npm run db:migrate           # applies drizzle/ to the database in DATABASE_URL
npm run db:seed              # first admin and default settings (idempotent)
npm run dev                  # http://localhost:3000
```

`DATABASE_URL` decides which database you touch; the project has one Neon database, so use a Neon branch for
experiments. Without `HCP_API_KEY` the queue shows only what is already in the database.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm test` / `test:watch` | Vitest (scoring fixtures, HCP mappers and webhooks, queue, tracker, export) |
| `npm run lint` / `typecheck` / `format` | ESLint, `next typegen` + `tsc --noEmit`, Prettier |
| `npm run db:generate` / `db:migrate` / `db:studio` | Create a migration from the schema, apply migrations, Drizzle Studio |
| `npm run db:seed` | Create the first admin and default `app_settings` |
| `npm run dev:seed-hcp` | Load sample HCP-shaped jobs (development only; never against production) |
| `npm run hcp:verify` | Read-only HCP day-1 probe: time zone, timestamp format, money unit, page size |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test and build on pushes and pull requests to `main`.
A push to `main` deploys to production.

## Folder map

```
app/
  (auth)/login/            email + password sign-in (also forgot-password/, reset-password/)
  (app)/queue/             call queue by New Jersey day, grouped by technician
  (app)/checklists/        checklist workspace; job/[hcpJobId] finds or creates it
  (app)/tracker/           completion tracker per pay period (manager+)
  (app)/production/        production counts per technician (manager+)
  (app)/admin/             users, pay-periods, sync, export (admin)
  api/webhooks/hcp/        signed HCP webhook receiver
  api/cron/                reconcile and backfill (CRON_SECRET)
  api/sync/refresh/        queue Refresh button
  api/export/[format]/     CSV and JSON export (admin)
  api/auth/                Neon Auth proxy
  forbidden/, no-access/   role and account guards
components/                app shell, checklist workspace, queue, period select, ui (shadcn)
src/
  config/                  checklist-steps.ts: the 44 answer cells and their workbook mapping
  db/                      Drizzle client, schema/, seed.ts
  lib/                     auth, checklists, export, hcp (client, sync, webhooks), scoring, pay-periods, time
  server/                  actions/ (server actions) and queries/
drizzle/                   SQL migrations
scripts/                   verify-hcp.ts, dev/ (sample data), workbook/ (Python, Excel oracle)
tests/                     components, hcp, lib, scoring (with Excel fixtures), server
docs/                      discovery, planning, reference, runbook
proxy.ts                   session gate (Next 16 successor to middleware.ts)
vercel.json                cron schedules
```

## Documentation

- [`docs/runbook.md`](docs/runbook.md): operating the system: secrets, go-live, sync, users, pay periods, export, deploys
- [`docs/discovery/workbook-analysis.md`](docs/discovery/workbook-analysis.md): cell map, every formula, Excel-verified scoring
- [`docs/planning/plan.md`](docs/planning/plan.md): step config, schema, sync design, build order (predates the build)
- [`docs/planning/open-questions.md`](docs/planning/open-questions.md): questions for Ron and Relene, and risks
- [`docs/reference/housecall-pro-api.md`](docs/reference/housecall-pro-api.md): verified HCP endpoints, webhooks, rate limits
- [`scripts/workbook/README.md`](scripts/workbook/README.md): workbook inspection and fixture tooling
