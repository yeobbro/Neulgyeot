import type { Db } from "./client";

/** Readable sequential IDs such as REC-000123. Atomic via upsert. */
export async function nextId(db: Db, prefix: string, width = 6): Promise<string> {
  const [row] = await db.query<{ value: number }>(
    `INSERT INTO id_counters (prefix, value) VALUES ($1, 1)
     ON CONFLICT (prefix) DO UPDATE SET value = id_counters.value + 1
     RETURNING value`,
    [prefix],
  );
  return `${prefix}-${String(row.value).padStart(width, "0")}`;
}

export async function setCounter(db: Db, prefix: string, value: number) {
  await db.query(
    `INSERT INTO id_counters (prefix, value) VALUES ($1, $2)
     ON CONFLICT (prefix) DO UPDATE SET value = GREATEST(id_counters.value, EXCLUDED.value)`,
    [prefix, value],
  );
}
