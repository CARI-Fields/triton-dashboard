# Environment Template Design

## Goal

Provide a safe, copyable local environment template that matches the filenames
already referenced by README, CONTRIBUTING, the setup screen, and the migration
script.

## Chosen approach

Create one committed `.env.local.example` file.

- Prefer it over `.env.example` because local commands already load
  `.env.local`, and all existing documentation names `.env.local.example`.
- Do not maintain both filenames because duplicated templates can drift.
- Add `!.env.local.example` after `.env*` in `.gitignore` so real environment
  files remain ignored while the template is tracked.

## Template contents

The template contains no working credentials:

- `NEXT_PUBLIC_SUPABASE_URL` with a clearly fake project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` with a clearly fake publishable-key
  placeholder.
- `SUPABASE_DB_URL` commented out and labelled optional, migration-only, and
  sensitive.

The shared team login password is not an environment variable and remains
shared out of band.

## Safety and verification

- Confirm `.env.local` is still ignored.
- Confirm `.env.local.example` is no longer ignored.
- Check that every environment variable read by application and migration code
  appears exactly once in the template.
- Scan the template for real project references, passwords, tokens, and
  connection strings before handoff.
