# Water Supply Production Reporting

React (Vite + TypeScript) + Supabase app that replaces the manual Excel daily-log
workbook for a water utility, with BS-calendar-aware daily entry, a bulk
spreadsheet-style grid, and weekly/monthly/quarterly/6-month/annual reports
with PDF/Excel export.

## Stack
- Frontend: React 18 + TypeScript + Vite, Tailwind CSS, React Router
- Backend: Supabase (Postgres + Auth + RLS)
- Charts: Chart.js via react-chartjs-2
- Export: `xlsx` (SheetJS) for Excel, `jspdf` + `jspdf-autotable` for PDF
- Deploy: Vercel

## Aggregation rules (confirmed so far)
| Variable | Rule |
|---|---|
| operating_hours, backwash_time, backwash_unit, distribution | SUM over the period |
| lps | AVERAGE over the period (it's a rate) |
| flowmeter (start/end) | END reading − START reading for the period |
| production | SUM by default; **varies per pump — client to confirm which pumps should average instead** |

These rules live in two places that must stay in sync:
- `src/lib/aggregation.ts` (client-side; `PRODUCTION_OVERRIDES_BY_PUMP` is where per-pump exceptions go)
- `supabase/migrations/0003_rollups.sql` (`aggregation_rules` table + `get_period_totals()` function, which is what reports actually query)

When the client tells you which pumps need `production` averaged instead of summed, add a row to `aggregation_rules` (`variable='production', pump_id=<uuid>, rule='avg'`) and the matching entry in `PRODUCTION_OVERRIDES_BY_PUMP`.

## Local development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at https://supabase.com, then in the SQL editor (or via the CLI) run the migrations in order:
   ```bash
   supabase/migrations/0001_init.sql
   supabase/migrations/0002_rls.sql
   supabase/migrations/0003_rollups.sql
   ```
   Or with the Supabase CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

3. **Copy env vars**
   ```bash
   cp .env.example .env
   ```
   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project's API settings.

4. **Create your first project, pumps, and admin user**
   - Sign a user up via Supabase Auth (dashboard, or the app's login page once you wire up a sign-up flow — only sign-in is scaffolded here, since staff accounts are typically created by an admin, not self-service).
   - The `handle_new_user` trigger auto-creates a `profiles` row with role `operator`; promote the first user to `admin` directly in the table editor:
     ```sql
     update profiles set role = 'admin', project_id = '<project-uuid>' where id = '<user-uuid>';
     ```
   - Insert a row into `projects`, then add pumps via the Admin page (or SQL) once you can sign in.

5. **Run the dev server**
   ```bash
   npm run dev
   ```

## Historical data cutover

`scripts/migrate_excel.py` is a starting point for a one-off import of the
legacy workbook into `daily_entries`. It is **not wired up to the real sheet
layout** — open the actual Excel file, fill in `SHEET_LAYOUT` (which rows each
variable block starts at, how many pump rows, day-column offsets) and
implement `bs_to_gregorian()`, then run it once against a service-role key
(never the anon key, since it needs to bypass RLS for bulk insert). This
script is deliberately kept out of the deployed app.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, "Add New Project" → import the repo. Framework preset: **Vite**.
3. Under Project Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Every push to the connected branch redeploys automatically.
5. Build command / output directory are auto-detected from `vite.config.ts` (`npm run build` → `dist/`); no changes needed for a standard Vite project.

## What's scaffolded vs. what's next

Done:
- Full schema, RLS policies, and the configurable aggregation function
- Auth (sign-in) + role-based route protection
- Daily entry form (BS date picker, mobile-friendly numeric inputs, flowmeter validation)
- Bulk entry grid (read-only preview of a BS month, pump × day, matching the legacy tab layout)
- Report period picker → report detail with chart, table, PDF export, Excel export
- Dashboard with month-to-date totals and a missing-entries alert list
- Admin page for pumps and user roles

Next increments (flagged inline in code comments where relevant):
- Bulk entry grid: make cells click-to-edit (currently read-only preview) — wire each cell to the same `daily_entries` upsert used in the Data Entry form.
- Offline queueing for field entry (service worker + localStorage sync) — not yet implemented.
- Sign-up / invite flow for new staff accounts (currently: create via Supabase dashboard, admin promotes role).
- Confirm the `production` per-pump sum-vs-average split with the client and fill in `aggregation_rules` / `PRODUCTION_OVERRIDES_BY_PUMP` accordingly.
- Swap `bikram-sambat-js` in `src/lib/bsCalendar.ts` for your BS library of choice if you hit version/API mismatches — the rest of the app only depends on the functions this file exports, not the library directly.
