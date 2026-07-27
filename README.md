# Triton Board

### 🔗 Live board: **https://triton-dashboard-cari.vercel.app**

A live, editable project board + research log for the **Triton Kernel Agent — RL Training**
project. Modules → tasks with owners and status, and each task has its own detail page
with progress notes, experiments, auto-generated metric charts, and uploaded plots.
Everything syncs in real time across everyone's browser.

> **Access model:** password-protected. The board sits behind one **shared team password**
> (Supabase Auth), and the database rejects any request without a valid login (Row Level
> Security). So even someone who reads the Supabase key out of the page source gets nothing.

---

## Stack

- **Next.js 16** (App Router, TypeScript) — UI
- **Supabase** — Postgres, Realtime, Auth, Storage (the entire backend; the app talks to it directly from the browser)
- **Vercel** — hosting; **auto-deploys on every push to `main`**
- `react-markdown` + `remark-gfm` for the markdown fields. Charts are hand-rolled SVG/CSS (no chart library).

## Project structure

```
app/
  layout.tsx            root layout (mounts the navbar)
  page.tsx              "/"  → <AuthGate><Board/></AuthGate>
  task/[id]/page.tsx    "/task/:id" → <AuthGate><TaskDetail/></AuthGate>
  analytics/page.tsx    "/analytics" → <AuthGate><Analytics/></AuthGate>
  globals.css           all styles (design tokens at top)
components/
  Navbar.tsx            top navbar: brand, LIVE badge, Board / Analytics nav
  Board.tsx             the board: modules, tasks, ownership table, team roster
  TaskDetail.tsx        task page: notes, experiments, metric charts, plots, activity timeline
  Analytics.tsx         analytics: KPIs, completion, workload, module progress
  AuthGate.tsx          shared-password login gate (wraps all pages)
  MarkdownField.tsx     reusable click-to-edit markdown field
lib/
  supabase.ts           browser Supabase client (reads env vars)
  auth.ts               TEAM_EMAIL constant for the shared login
  types.ts              TypeScript types
  time.ts               relative/absolute time formatting
  status.ts             status labels + click-cycle order
  activity.ts           activity-timeline logging helper
supabase/
  migrations/           numbered DB migrations (see "Database" below)
  seed.sql              initial plan data (optional)
```

## Features

- Board: add/edit/delete **modules** (pipeline stages or cross-cutting foundations) and **tasks**; click a status pill to **cycle status**; **assign** people; auto **ownership** table; team **roster**; per-task and board-level **"last updated"** stamps.
- Task detail (`/task/:id`, opened from a task title): **progress notes**, **experiments** (each with numeric **metrics** that auto-render as comparison **bar charts**), **plots/images** uploaded per experiment, and an **activity timeline** (auto-logged events + free-form notes).
- Analytics (`/analytics`): task **KPIs**, overall **completion**, **workload by member**, per-module **progress**.
- **Markdown** everywhere freeform (objectives, notes) — click to edit, renders on blur.
- Realtime: edits write straight to Supabase and appear in every open browser.

---

## Run locally (working on the existing board)

You need the project's two Supabase values. They're **not in the repo** (`.env.local` is
git-ignored). Get them from a maintainer, or from Vercel → `Eason's projects` →
`triton-dashboard` → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — this holds the Supabase **publishable** key (`sb_publishable_…`); it's safe to expose in a browser, and access is protected by the login + RLS, not by hiding this key.

```bash
git clone https://github.com/CARI-Fields/triton-dashboard.git
cd triton-dashboard
cp .env.local.example .env.local     # then paste the two values in
npm install
npm run dev                          # http://localhost:3000
```

Log in with the team password. **Note:** local dev talks to the **same live database**, so
edits you make locally are real for everyone. To experiment safely, spin up your own free
Supabase project, run the SQL below against it, and point `.env.local` at it instead.

Always run `npm run build` before pushing — it type-checks the whole app.

## Environment variables (who needs what)

Nothing secret is in the repo — request the values you need and put them in your own
`.env.local` (copy from [`.env.local.example`](.env.local.example)):

| Variable | Who needs it | Where to get it | Sensitivity |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | anyone running the app locally | a maintainer, or Vercel → project → Settings → Environment Variables | low (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anyone running the app locally | same as above | low — publishable key, already ships in the browser |
| `SUPABASE_DB_URL` | **only** if you run DB migrations | a maintainer (Supabase session-pooler string + DB password) | **high — full DB admin; treat like a root password** |

Plus the **team login password** (to sign in to the running board) — shared out-of-band
(password manager / DM), not an env var.

> **Never commit `.env.local`.** It's git-ignored on purpose. Share secrets through a password
> manager or a direct message — never through git, because git history keeps them forever.

---

## Deploying & contributing

- The Vercel project `Eason's projects / triton-dashboard` is linked to
  [`CARI-Fields/triton-dashboard`](https://github.com/CARI-Fields/triton-dashboard).
- Pushes and merges to `main` deploy to
  **[triton-dashboard-cari.vercel.app](https://triton-dashboard-cari.vercel.app)**.
- Changes should go through **pull requests**. Branch protection is not currently enabled on the
  new repository, so repository admins should treat direct pushes to `main` as an exception.
  The full workflow is in **[`CONTRIBUTING.md`](CONTRIBUTING.md)**.
- If a deployment does not start, check the commit status and Vercel dashboard first. A maintainer
  can redeploy from **Deployments → ⋯ → Redeploy**.

**Adding a collaborator:** a `CARI-Fields` organization admin grants repository access under
GitHub **Settings → Collaborators and teams**; the contributor then follows
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Database (Supabase) & migrations

Schema changes live as `.sql` files in [`supabase/migrations/`](supabase/migrations) and are
applied with **one command** — no more pasting into the dashboard:

```bash
npm run db:migrate        # applies any migrations not yet applied
```

This needs `SUPABASE_DB_URL` in `.env.local` (Supabase → Project Settings → Database →
Connection string → **Session pooler**, with the DB password). Applied migrations are tracked
in a `_migrations` table, so it only ever runs new files.

Current migrations (run in order on a fresh database):

1. `0001_schema.sql` — `modules`, `tasks`, `members` + realtime
2. `0002_task_details.sql` — `tasks.notes`, `experiments`, `attachments`, `task-images` Storage bucket
3. `0003_plots_per_experiment.sql` — `attachments.experiment_id`
4. `0004_auth_lockdown.sql` — locks every table to the `authenticated` role
5. `0005_activity_and_timestamps.sql` — `activity` table (task timeline) + `updated_at` on `tasks` / `experiments`
6. `0006_experiment_workspace.sql` — structured Experiment context, Owner/Status/Baseline,
   Result/Decision fields, lifecycle timestamps, Experiment Activity linkage, indexes, and
   transaction-safe anonymous Activity triggers

`supabase/seed.sql` (initial plan data) is optional and separate — run it once via the SQL editor.

**To make a schema change:** add a new `NNNN_description.sql` file to `supabase/migrations/`, then
`npm run db:migrate`.

> First time on a database that was set up **by hand**, run `npm run db:baseline` **once** — it
> records the existing migrations as already-applied so they're never re-run (which matters:
> re-running `0001` would re-open public access before `0004` locks it again).

### Shared login

Auth is a single shared user. Create it in Supabase → **Authentication → Users → Add user**:

- **Email:** `team@triton-board.app` (must match `TEAM_EMAIL` in `lib/auth.ts`)
- **Password:** the team password
- ✅ **Auto Confirm User**

Change the password anytime by resetting that user's password in Supabase.

## Data model

| Table | Key fields |
|---|---|
| `modules` | `kind` (pipeline \| foundation), `name`, `objective` (markdown), `position` |
| `tasks` | `module_id`, `title`, `status` (todo \| in_progress \| done \| blocked), `assignees` (text[]), `notes` (markdown) |
| `members` | `name`, `initials` (roster / assignee options) |
| `experiments` | `experiment_no`, `task_id`, `owner_id`, `status`, explicit `baseline_experiment_id`, structured `data_spec` / `object_spec` / `environment_spec` / `config`, numeric `metrics`, `featured_metric_keys`, `result_summary`, `decision_outcome`, `decision_notes`, Markdown `notes`, lifecycle timestamps |
| `attachments` | `experiment_id` (+ `task_id`), `url`, `path`, `caption` — files live in the `task-images` Storage bucket |
| `activity` | `task_id`, nullable `experiment_id`, `text`, `kind`, timestamp — automatic Experiment events are anonymous because the Board uses one shared team account |

All tables have realtime enabled and an `"auth access"` RLS policy (`to authenticated`).

## Task + Experiment workflow

The current Board represents one Project:

```text
Project
└── Task
    └── Experiment
```

- Task is the collaboration and progress unit.
- Experiment is manually recorded evidence under exactly one Task.
- New Experiments require Name and Owner and start as `planned`.
- Before `running`, record at least one Dataset, a Model, NPU/GPU plus Server or Device,
  and at least one Config property (or `profile: "defaults"`).
- Before `analyzing`, record a numeric Metric or Result Summary.
- Before `completed`, record runnable context, Result, and Decision Outcome.
- Duplicate copies Task, Owner, Data, Object, Environment, and Config; it clears Result,
  Decision, Note, attachments, and run times. The source timeline is not copied; the
  duplicate starts a new timeline with `Experiment duplicated from EXP-####`. The Source
  is shown explicitly as the new Baseline.
- Baseline is never guessed. Without an explicit Baseline, Triton Board shows no Delta.
- Delta is always `current - baseline`, is derived at render time, and has no automatic
  good/bad interpretation.

Routes:

- `/` — Task Board
- `/task/[id]` — Task Detail with compact Experiment table
- `/experiments` — global Experiment database and saved views
- `/experiments/[id]` — full Experiment record and one-to-one Baseline summary
- `/experiments/compare?ids=<uuid>,<uuid>&baseline=<uuid>` — shareable multi-run comparison
- `/analytics` — existing Task analytics

Experiment edits use optimistic concurrency on `updated_at`. If a remote change arrives while
the form is dirty, the local draft is preserved and saving is blocked until the latest version
is loaded and the edit is reapplied.

## Not yet built / ideas

- Drag-to-reorder (items currently append by `position`)
- Per-person logins instead of one shared password (would give a real audit trail)
- Full history / audit log (the per-task activity timeline exists; realtime is still last-write-wins)
- Fully private images via signed URLs (currently public-read with random UUID paths; upload requires login)
