#!/usr/bin/env node
// Verifies the Phase 6 legacy migration invariants against SUPABASE_DB_URL.
// Run: node --env-file=.env.local scripts/verify-legacy-migration.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL — add it to .env.local.");
  process.exit(1);
}

const useSsl = !/localhost|127\.0\.0\.1/.test(new URL(url).hostname);
const client = new pg.Client({
  connectionString: url,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
}

try {
  await client.connect();

  const template = await client.query(
    `select id, name from public.experiment_templates
     where id = '11111111-1111-4111-8111-111111111111'`,
  );
  check(
    "Imported Legacy Template exists",
    template.rowCount === 1 && template.rows[0].name === "Imported legacy experiments",
  );

  const templateId = template.rows[0]?.id ?? null;
  const experiments = await client.query(
    "select id from public.experiments where template_id is null",
  );
  check("no Experiment is left without a Template", experiments.rowCount === 0);

  if (templateId) {
    const values = await client.query(
      `select count(*)::int as total,
              count(*) filter (where v.template_id <> e.template_id)::int as cross_template
       from public.experiment_values v
       join public.experiments e on e.id = v.experiment_id`,
    );
    check("zero cross-Template Value rows", values.rows[0].cross_template === 0);

    const versions = await client.query(
      `select count(*)::int as experiments,
              count(distinct e.id)::int as with_migration_version
       from public.experiments e
       left join public.experiment_versions v
         on v.experiment_id = e.id and v.version_no = 1 and v.source = 'migration'`,
    );
    check(
      "every Experiment has a migration version",
      versions.rows[0].experiments === versions.rows[0].with_migration_version,
    );
  }

  const constraint = await client.query(
    `select count(*)::int as count from pg_constraint
     where conrelid = 'public.experiments'::regclass
       and conname = 'experiments_completed_decision_check'`,
  );
  check("legacy completed/Decision constraint dropped", constraint.rows[0].count === 0);

  const notNull = await client.query(
    `select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'experiments'
       and column_name = 'template_id'`,
  );
  check("experiments.template_id is NOT NULL", notNull.rows[0]?.is_nullable === "NO");

  const orphans = await client.query(
    `select count(*)::int as count from public.experiment_values v
     where not exists (
       select 1 from public.experiment_template_keys k
       where k.id = v.key_id and k.template_id = v.template_id
     )`,
  );
  check("zero orphan Value rows", orphans.rows[0].count === 0);

  const unattached = await client.query(
    `select count(*)::int as count from public.attachments
     where experiment_id is not null and template_key_id is null`,
  );
  check("every Experiment Attachment has a Template Key", unattached.rows[0].count === 0);
} catch (error) {
  console.error("Verification failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}

let failed = 0;
for (const entry of checks) {
  console.log(`${entry.ok ? "ok" : "FAIL"}  ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
  if (!entry.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n${failed} verification check(s) failed.`);
  process.exit(1);
}
console.log("\nLegacy migration verification passed.");
