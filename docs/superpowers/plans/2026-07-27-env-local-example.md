# Environment Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, copyable `.env.local.example` containing every environment variable consumed by Triton Board.

**Architecture:** Keep real `.env*` files ignored while explicitly allowing one committed template. Match the `.env.local.example` filename already used by README, CONTRIBUTING, the setup screen, and the migration script.

**Tech Stack:** Next.js environment variables, Node `--env-file`, Git ignore rules, shell verification.

## Global Constraints

- Never place a working URL, key, password, token, or database connection string in the template.
- Keep `.env.local` and every other real `.env*` file ignored.
- Maintain one template only: `.env.local.example`.
- `SUPABASE_DB_URL` remains commented, optional, migration-only, and clearly sensitive.

---

### Task 1: Add and verify the local environment template

**Files:**
- Create: `.env.local.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `lib/supabase.ts`; optional `SUPABASE_DB_URL` from `scripts/migrate.mjs`.
- Produces: a committed template that `cp .env.local.example .env.local` can copy without exposing real credentials.

- [ ] **Step 1: Verify the template is currently missing and ignored**

Run:

```bash
test ! -e .env.local.example
git check-ignore -q .env.local.example
```

Expected: both commands exit `0`, proving the file is absent and the current
`.env*` rule would ignore it.

- [ ] **Step 2: Create the safe template**

Create `.env.local.example` with exactly:

```dotenv
# Copy this file to .env.local and replace only the placeholder values.
# Never commit .env.local or paste real credentials into this example.

# Browser-visible Supabase project configuration.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_publishable_key

# Optional: required only for `npm run db:migrate` / `npm run db:baseline`.
# Sensitive database-admin credential — keep the real value only in .env.local.
# SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:DB_PASSWORD@SESSION_POOLER_HOST:5432/postgres
```

- [ ] **Step 3: Allow only the example through Git ignore rules**

Add immediately after `.env*` in `.gitignore`:

```gitignore
!.env.local.example
```

- [ ] **Step 4: Verify ignore behavior and variable coverage**

Run:

```bash
test -f .env.local.example
git check-ignore -q .env.local
test "$(git check-ignore .env.local.example | wc -l)" -eq 0
test "$(rg -c '^NEXT_PUBLIC_SUPABASE_URL=' .env.local.example)" -eq 1
test "$(rg -c '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local.example)" -eq 1
test "$(rg -c '^# SUPABASE_DB_URL=' .env.local.example)" -eq 1
git diff --check
```

Expected: every command exits `0`; `.env.local` remains ignored,
`.env.local.example` is visible to Git, each consumed variable appears exactly
once, and the diff has no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.local.example
git commit -m "docs: add local environment template"
```
