/**
 * Database CLI for the PGlite demo database.
 *   npm run db:migrate   apply pending migrations
 *   npm run db:rollback  roll back the latest migration
 *   npm run db:seed      seed demo data if the database is empty
 *   npm run db:reset     delete all rows and re-seed (demo database only)
 * Stop the dev server first: PGlite allows one process per data directory.
 */
import { defaultDataDir, openDb } from "../lib/server/db/client";
import { applyMigrations, rollbackLast } from "../lib/server/db/migrate";
import { resetData, seed, seedIfEmpty } from "../lib/server/db/seed";

async function main() {
  const cmd = process.argv[2];
  const dir = defaultDataDir();
  // migrate/rollback manage the schema explicitly; the other commands migrate on open.
  const db = await openDb(dir, { migrate: cmd !== "migrate" && cmd !== "rollback" });
  try {
    if (cmd === "migrate") {
      const applied = await applyMigrations(db);
      console.log(applied.length ? `applied: ${applied.join(", ")}` : "already up to date");
    }
    else if (cmd === "rollback") console.log("rolled back:", await rollbackLast(db));
    else if (cmd === "seed") console.log((await seedIfEmpty(db)) ? "seeded demo data" : "database already has data; use db:reset to re-seed");
    else if (cmd === "reset") {
      await resetData(db);
      await seed(db);
      console.log("reset and re-seeded demo data");
    } else {
      console.error("usage: db.ts migrate|rollback|seed|reset");
      process.exitCode = 1;
    }
    console.log(`data directory: ${dir}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
