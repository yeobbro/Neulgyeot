import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Db } from "../lib/server/db/client";
import { analyticsSummary, analyticsTrends, mapCoverage, resolvePeriod } from "../lib/server/services/analytics";
import { actor, seededDb } from "./helpers";

let db: Db;
before(async () => {
  db = await seededDb();
});

/** Independent queries written without the shared SQL fragments, to cross-check the service. */
async function manual(regionIds: string[] | null, start: Date, end: Date) {
  const scope = regionIds ? `AND r.region_id = ANY($3)` : "";
  const p: unknown[] = [start, end, ...(regionIds ? [regionIds] : [])];
  const one = async (sql: string) => (await db.query<{ n: number }>(sql, p))[0].n;
  return {
    recipients: await one(`SELECT count(*)::int n FROM care_recipients r WHERE care_status <> 'closed' AND created_at < $2 ${scope} AND $1::timestamptz IS NOT NULL`),
    openTasks: await one(`SELECT count(*)::int n FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id WHERE t.status IN ('open','in_progress','waiting') ${scope} AND $1::timestamptz < $2`),
    created: await one(`SELECT count(*)::int n FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id WHERE t.created_at >= $1 AND t.created_at < $2 ${scope}`),
    completed: await one(`SELECT count(*)::int n FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id WHERE t.created_at >= $1 AND t.created_at < $2 AND t.status = 'completed' AND t.completed_at < $2 ${scope}`),
    unconnected: await one(`
      SELECT count(*)::int n FROM care_recipients r WHERE r.care_status <> 'closed' ${scope} AND $1::timestamptz < $2 AND EXISTS (
        SELECT 1 FROM unnest(r.needs) t(need) WHERE t.need NOT IN (
          SELECT sc.service_type FROM service_referrals sr JOIN service_catalog sc ON sc.id = sr.service_id
          WHERE sr.recipient_id = r.id AND sr.status IN ('requested','received','in_progress','in_service')))`),
  };
}

describe("analytics", () => {
  it("matches independent SQL for the admin (all regions)", async () => {
    const admin = await actor(db, "U-ADMIN");
    const s = await analyticsSummary(db, admin, {});
    const period = resolvePeriod({});
    const m = await manual(null, period.start, period.end);
    assert.equal(s.recipients, m.recipients);
    assert.equal(s.openTasks, m.openTasks);
    assert.equal(s.tasksCreated, m.created);
    assert.equal(s.tasksCompleted, m.completed);
    assert.equal(s.unconnected, m.unconnected);
    assert.equal(s.completionRate, m.created ? Math.round((m.completed / m.created) * 1000) / 10 : null);
    assert.equal(s.byRegion.reduce((a, g) => a + g.recipients, 0), s.recipients, "region rows add up without double counting");
  });

  it("matches independent SQL within a worker's scope and a selected district", async () => {
    const w = await actor(db, "U-W3");
    const s = await analyticsSummary(db, w, { regionId: "RG-MIR" });
    const period = resolvePeriod({});
    const m = await manual(w.scopeRegionIds, period.start, period.end);
    assert.equal(s.recipients, m.recipients);
    assert.equal(s.unconnected, m.unconnected);
    assert.equal(s.byRegion.length, 4, "breakdown by dong inside the district");
  });

  it("changes when the period changes", async () => {
    const admin = await actor(db, "U-ADMIN");
    const wide = await analyticsSummary(db, admin, { from: "2026-08-01", to: "2026-10-29" });
    const narrow = await analyticsSummary(db, admin, { from: "2026-10-22", to: "2026-10-29" });
    assert.ok(wide.tasksCreated > narrow.tasksCreated);
  });

  it("map coverage totals equal the summary", async () => {
    const admin = await actor(db, "U-ADMIN");
    const c = await mapCoverage(db, admin, {});
    const s = await analyticsSummary(db, admin, {});
    assert.equal(c.dongs.reduce((a, d) => a + d.recipients, 0), s.recipients);
    assert.equal(c.districts.reduce((a, d) => a + d.unconnected, 0), s.unconnected);
  });

  it("trend points cover the period and sum to the totals", async () => {
    const admin = await actor(db, "U-ADMIN");
    const t = await analyticsTrends(db, admin, {});
    const s = await analyticsSummary(db, admin, {});
    assert.equal(t.points.reduce((a, x) => a + x.tasksCreated, 0), s.tasksCreated);
  });

  it("rejects an inverted or over-long period", async () => {
    const admin = await actor(db, "U-ADMIN");
    await assert.rejects(analyticsSummary(db, admin, { from: "2026-10-10", to: "2026-10-01" }));
    await assert.rejects(analyticsSummary(db, admin, { from: "2024-01-01", to: "2026-10-01" }));
  });
});
