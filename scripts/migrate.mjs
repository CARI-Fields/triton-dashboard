#!/usr/bin/env node
// Applies SQL migrations in supabase/migrations/ to the database in SUPABASE_DB_URL.
// Tracks what's been applied in a _migrations table, so it only runs new files.
//
//   npm run db:migrate     apply pending migrations
//   npm run db:baseline    mark all current migrations as applied WITHOUT running
//                          them (use once on a database that was set up by hand)
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const baseline = process.argv.includes("--baseline");
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL — add it to .env.local (see .env.local.example).");
  process.exit(1);
}

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations"
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())"
  );
  const applied = new Set(
    (await client.query("select name from _migrations")).rows.map((r) => r.name)
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("Up to date — nothing to apply.");
  }

  for (const file of pending) {
    if (baseline) {
      await client.query("insert into _migrations(name) values($1)", [file]);
      console.log(`baselined  ${file}  (marked applied, not run)`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`applying   ${file} ... `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _migrations(name) values($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(`\n${e.message}\n`);
      process.exit(1);
    }
  }
  console.log(baseline ? "Baseline complete." : "Migrations complete.");
} finally {
  await client.end();
}
