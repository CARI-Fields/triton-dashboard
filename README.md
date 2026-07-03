# Triton Board

### 🔗 Live board: **https://triton-board.vercel.app**

A live, editable project board for the **Triton Kernel Agent — RL Training** project.
Everyone with the link can edit modules, tasks, statuses, and assignees, and changes
sync in real time. Built with Next.js + Supabase, deploys free on Vercel.

> **Access model:** password-protected. The board sits behind one shared team
> password (Supabase Auth), and the database rejects any request without a valid
> login (Row Level Security). See `supabase/migration-auth.sql` and `lib/auth.ts`.

---

## 1. Create the database (Supabase)

1. Go to <https://supabase.com>, sign in, and create a new **free** project. Pick a
   region close to your team. Wait ~2 min for it to provision.
2. Open **SQL Editor → New query**. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql)
   and click **Run**. This creates the tables, opens up access, and turns on realtime.
3. (Optional but recommended) New query again, paste [`supabase/seed.sql`](supabase/seed.sql),
   **Run**. This loads your current plan (SFT → RL pipeline, Harness + Skills foundations,
   and the four in-progress tasks). Skip this if you want to start empty.
4. Go to **Project Settings → API** and copy two values:
   - **Project URL**
   - **Project API keys → `anon` `public`**

## 2. Run it locally

```bash
cd triton-board
cp .env.local.example .env.local     # then edit .env.local
```

Put your two values in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Then:

```bash
npm install      # first time only
npm run dev
```

Open <http://localhost:3000>. If the env vars are missing you'll see a setup screen
instead of a crash.

## 3. Deploy for the team (Vercel)

1. Push this folder to a GitHub repo (it was `git init`-ed for you):
   ```bash
   git add -A
   git commit -m "Triton board"
   # create an empty repo on github.com, then:
   git remote add origin https://github.com/<you>/triton-board.git
   git push -u origin main
   ```
2. Go to <https://vercel.com>, **Add New → Project**, import that repo.
3. In the import screen, add the two **Environment Variables**
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — same values as
   `.env.local`.
4. **Deploy.** You get a URL like `https://triton-board.vercel.app`. Share it with the team.
   Every push to `main` redeploys automatically.

---

## What you can do in the board

- **Edit any text** — module names, objectives, task titles: click it, type, Enter to save.
- **Add / delete** modules (pipeline stages or foundations) and tasks.
- **Set status** — To do / In progress / Done / Blocked, per task.
- **Assign people** — click the `+` on a task; check teammates or type a new name.
- **Manage the roster** — add/remove teammates in the Team bar at the bottom.
- The **Ownership** table is derived automatically from task assignments.

Everything writes straight to Supabase and pushes to every open browser via realtime.

## Data model

`modules` (pipeline | foundation) → `tasks` (status, assignees[]) · `members` (roster).
See [`supabase/schema.sql`](supabase/schema.sql).

## Adding login later

The board is intentionally open (anon key + permissive RLS). To require per-person
login, enable an auth provider in Supabase, change the policies in `schema.sql` from
`using (true)` to `to authenticated using (true)`, and add Supabase Auth to the app.
Ask and this can be wired up.

## Notes / not yet built

- No drag-to-reorder yet (new items append; order is by creation). Easy to add.
- No history/audit log. Realtime is last-write-wins.
