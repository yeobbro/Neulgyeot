import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "./migrate";

/**
 * Minimal DB interface. The demo implementation is PGlite (PostgreSQL in WASM);
 * a production deployment can implement the same interface with `pg`.
 */
export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type PgLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

function wrap(pg: PgLike, root: PGlite): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (pg !== root) return fn(wrap(pg, root)); // nested: reuse outer transaction
      return root.transaction(async (tx) => fn(wrap(tx as unknown as PgLike, root)));
    },
    async close() {
      await root.close();
    },
  };
}

export async function openDb(dataDir: string, opts: { migrate?: boolean } = {}): Promise<Db> {
  const pg = dataDir === "memory://" ? new PGlite() : new PGlite(dataDir);
  await pg.waitReady;
  const db = wrap(pg as unknown as PgLike, pg);
  if (opts.migrate !== false) await applyMigrations(db);
  return db;
}

export function defaultDataDir(): string {
  if (process.env.NEULGYEOT_DB_DIR) return process.env.NEULGYEOT_DB_DIR;
  // Serverless filesystems are read-only except /tmp; data there is ephemeral.
  return process.env.VERCEL ? "/tmp/neulgyeot-pglite" : ".data/pglite";
}

const globalForDb = globalThis as unknown as { __neulgyeotDb?: Promise<Db> };

/** Process-wide connection. Auto-seeds demo data on first start unless disabled. */
export function getDb(): Promise<Db> {
  if (!globalForDb.__neulgyeotDb) {
    globalForDb.__neulgyeotDb = (async () => {
      const db = await openDb(defaultDataDir());
      if (process.env.NEULGYEOT_AUTO_SEED !== "false") {
        const { seedIfEmpty } = await import("./seed");
        await seedIfEmpty(db);
      }
      return db;
    })().catch((err) => {
      globalForDb.__neulgyeotDb = undefined;
      throw err;
    });
  }
  return globalForDb.__neulgyeotDb;
}

/** Tests inject their own in-memory database. */
export function setDbForTesting(db: Db | undefined) {
  globalForDb.__neulgyeotDb = db ? Promise.resolve(db) : undefined;
}
