import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb } from "../lib/server/db/client";
import { applyMigrations, rollbackLast } from "../lib/server/db/migrate";
import { resetData, seed, seedIfEmpty } from "../lib/server/db/seed";
import { NOW } from "./helpers";

describe("database", () => {
  it("applies and rolls back migrations", async () => {
    const db = await openDb("memory://");
    const tables = async () => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`))[0].n;
    assert.ok((await tables()) >= 19);
    assert.deepEqual(await applyMigrations(db), [], "re-applying is a no-op");
    assert.equal(await rollbackLast(db), "001_init");
    assert.equal(await tables(), 1);
    assert.deepEqual(await applyMigrations(db), ["001_init"]);
    await db.close();
  });

  it("enforces foreign keys, CHECK constraints and required fields", async () => {
    const db = await openDb("memory://");
    await seed(db, NOW);
    await assert.rejects(db.query(`INSERT INTO care_records (id, recipient_id, record_type, recorded_at, content) VALUES ('X1','R-9999','visit', now(), 'x')`), /foreign key/i);
    await assert.rejects(db.query(`UPDATE action_tasks SET status = 'done' WHERE id = 'TASK-000001'`), /check/i);
    await assert.rejects(db.query(`UPDATE service_referrals SET status = 'failed', failure_reason = NULL WHERE id = 'SR-000001'`), /check/i);
    await assert.rejects(db.query(`INSERT INTO care_records (id, recipient_id, record_type, visit_status, recorded_at, content) VALUES ('X2','R-0001','phone','missed', now(), 'x')`), /check/i);
    await assert.rejects(db.query(`INSERT INTO care_records (id, recipient_id, record_type, recorded_at) VALUES ('X3','R-0001','phone', now())`), /null/i);
    await assert.rejects(db.query(`INSERT INTO users (id, name, email, role) VALUES ('U-X','x','admin@demo.neulgyeot.invalid','admin')`), /unique/i);
    await db.close();
  });

  it("seeds the documented volume and is idempotent", async () => {
    const db = await openDb("memory://");
    assert.equal(await seedIfEmpty(db, NOW), true);
    const count = async (t: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`))[0].n;
    const before = { recipients: await count("care_recipients"), records: await count("care_records"), referrals: await count("service_referrals"), assessments: await count("risk_assessments"), tasks: await count("action_tasks"), providers: await count("service_providers"), regions: await count("regions") };
    assert.ok(before.recipients >= 100 && before.records >= 500 && before.referrals >= 100 && before.assessments >= 30 && before.tasks >= 50 && before.providers >= 20);
    assert.ok(before.regions >= 10 && before.regions <= 20);
    assert.equal(await seedIfEmpty(db, NOW), false, "second run does nothing");
    assert.equal(await count("care_recipients"), before.recipients);
    await resetData(db);
    assert.equal(await count("care_recipients"), 0);
    await seed(db, NOW);
    assert.equal(await count("care_recipients"), before.recipients, "reset + seed reproduces the dataset");
    const [demo] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM care_recipients WHERE NOT is_demo_data`);
    assert.equal(demo.n, 0, "all seeded rows are marked as demo data");
    await db.close();
  });
});
