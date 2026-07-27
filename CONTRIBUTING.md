# Contributing to Triton Board

Thanks for helping maintain the board! Here's the workflow.

## Setup (once)

1. Ask a maintainer to add you as a **collaborator** on the GitHub repo.
2. Clone and install:
   ```bash
   git clone https://github.com/CARI-Fields/triton-dashboard.git
   cd triton-dashboard
   npm install
   ```
3. Create `.env.local` from [`.env.local.example`](.env.local.example) and fill in the values a
   maintainer shares with you privately (see the **Environment variables** table in the README).
   **Never commit `.env.local`.**
4. `npm run dev` → <http://localhost:3000>, and log in with the team password.

## Making a change

`main` is protected — **don't commit to it directly.** Use a branch + pull request:

```bash
git checkout -b short-description
# ...make your change...
npm run build            # must pass (type-checks the whole app) before you push
git commit -am "Describe the change"
git push -u origin short-description
```

Then open a **Pull Request** against `main` on GitHub. Keep PRs focused and reasonably small.

### Database changes

If your change needs a schema change, add a **new** migration file in the same PR:
`supabase/migrations/NNNN_description.sql` (next number in sequence). **Never edit a migration
that's already been applied.** After merging, a maintainer runs `npm run db:migrate`.

## Review & deploy

- A maintainer reviews and merges your PR into `main`.
- The Vercel project `Eason's projects / triton-dashboard` watches this GitHub repository.
- Pushes and merges to `main` deploy production at
  <https://triton-dashboard-cari.vercel.app>.
- If a deployment does not start, check the GitHub commit status and the Vercel project dashboard;
  a maintainer can redeploy from **Deployments → ⋯ → Redeploy**.

## Good to know

- Local dev talks to the **live database** by default — be mindful. To experiment freely, point
  `.env.local` at your own free Supabase project instead.
- The board is protected by a shared password + database Row Level Security; see the README's
  security section.
- Not sure about something? Open a **draft PR** or a GitHub issue and ask.
