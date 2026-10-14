# RSE QA/QC Production Checklist

Private web app that replaces RSE Energy Group's per-employee Excel QA/QC checklist workbooks.
Jobs sync read-only from Housecall Pro; the call team fills an Appointment/Service Call Checklist
(34 steps + sub-items) and Call Back Checklists per job; completion is tracked per technician and pay period.

Status: **discovery and planning** (no application code yet). See:

- [`docs/discovery/workbook-analysis.md`](docs/discovery/workbook-analysis.md): exact cell map, every formula, Excel-verified scoring semantics, PRD corrections
- [`docs/planning/plan.md`](docs/planning/plan.md): step config, database schema, folder structure, Housecall Pro sync design, build order
- [`docs/planning/open-questions.md`](docs/planning/open-questions.md): questions for Ron/Relene and risks
- [`docs/reference/housecall-pro-api.md`](docs/reference/housecall-pro-api.md): verified API endpoints, webhooks, rate limits
- [`scripts/workbook/`](scripts/workbook/): openpyxl/Excel inspection tooling

Stack (fixed): Next.js App Router + TypeScript on Vercel, Neon Postgres (dedicated project), Neon Managed Better Auth
(magic link, invite only), Tailwind + shadcn/ui, Drizzle ORM, Vercel Cron. Housecall Pro API key is read-only and server-side only.
