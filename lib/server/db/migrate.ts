import type { Db } from "./client";
import { migrations } from "./migrations";

export async function applyMigrations(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: string }>(`SELECT version FROM schema_migrations`)).map((r) => r.version));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    await db.transaction(async (tx) => {
      for (const stmt of splitStatements(m.up)) await tx.query(stmt);
      await tx.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [m.version]);
    });
    applied.push(m.version);
  }
  return applied;
}

/** Rolls back the most recent migration. */
export async function rollbackLast(db: Db): Promise<string | null> {
  const rows = await db.query<{ version: string }>(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`);
  if (!rows.length) return null;
  const m = migrations.find((x) => x.version === rows[0].version);
  if (!m) throw new Error(`Unknown migration ${rows[0].version}`);
  await db.transaction(async (tx) => {
    for (const stmt of splitStatements(m.down)) await tx.query(stmt);
    await tx.query(`DELETE FROM schema_migrations WHERE version = $1`, [m.version]);
  });
  return m.version;
}

/** Splits on semicolons at line ends; migrations avoid semicolons inside literals. */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
