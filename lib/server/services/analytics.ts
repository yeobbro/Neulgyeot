import { z } from "zod";
import { SERVICE_TYPES, TASK_STATUSES, type ServiceType, type TaskStatus } from "../../domain/constants";
import type { ReportStats } from "../../domain/report-template";
import { regionScopeSql, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { invalid } from "../errors";
import { expandRegion, listRegions, type Region } from "./regions";
import { NEEDS_REVIEW_SQL, UNCONNECTED_SQL } from "./sql";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.");

export const analyticsQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  regionId: z.string().optional(),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  unconnected: z.enum(["true", "false"]).optional(),
  needsReview: z.enum(["true", "false"]).optional(),
  taskStatus: z.enum([...TASK_STATUSES, "active"]).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;

/** Period boundaries in KST: [from 00:00, to+1 00:00). Defaults to the last 30 days. */
export function resolvePeriod(q: { from?: string; to?: string }, now = new Date()) {
  const kstToday = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const to = q.to ?? kstToday;
  const from = q.from ?? new Date(new Date(`${to}T00:00:00+09:00`).getTime() - 29 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
  if (from > to) throw invalid("시작일이 종료일보다 늦습니다.");
  const start = new Date(`${from}T00:00:00+09:00`);
  const end = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86_400_000);
  if ((end.getTime() - start.getTime()) / 86_400_000 > 366) throw invalid("기간은 최대 1년까지 선택할 수 있습니다.");
  return { from, to, start, end };
}

type Scope = { where: string; params: unknown[]; regions: Region[]; focus: Region | null };

/** Recipient filter (`r` alias) combining the actor's scope with the request filters. */
async function scopeFor(db: Db, actor: Actor, q: AnalyticsQuery): Promise<Scope> {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const where = [regionScopeSql(actor, "r.region_id", params)];
  const regions = await listRegions(db);
  let focus: Region | null = null;
  if (q.regionId) {
    focus = regions.find((r) => r.id === q.regionId) ?? null;
    if (!focus) throw invalid("지역을 찾을 수 없습니다.");
    params.push(await expandRegion(db, q.regionId));
    where.push(`r.region_id = ANY($${params.length})`);
  }
  if (q.serviceType) {
    params.push(q.serviceType);
    where.push(`$${params.length} = ANY(r.needs)`);
  }
  if (q.unconnected) where.push(q.unconnected === "true" ? UNCONNECTED_SQL : `NOT ${UNCONNECTED_SQL}`);
  if (q.needsReview) where.push(q.needsReview === "true" ? NEEDS_REVIEW_SQL : `NOT ${NEEDS_REVIEW_SQL}`);
  return { where: where.join(" AND "), params, regions, focus };
}

type DongMetrics = {
  regionId: string;
  recipients: number;
  unconnected: number;
  needsReview: number;
  openTasks: number;
  tasksCreated: number;
  tasksCompleted: number;
};

async function metricsByDong(db: Db, s: Scope, start: Date, end: Date, taskStatus?: AnalyticsQuery["taskStatus"]): Promise<Map<string, DongMetrics>> {
  const p = [...s.params];
  p.push(start, end);
  const si = p.length - 1;
  const ei = p.length;
  let taskFilter = "";
  if (taskStatus === "active") taskFilter = ` AND t.status IN ('open','in_progress','waiting')`;
  else if (taskStatus) {
    p.push(taskStatus);
    taskFilter = ` AND t.status = $${p.length}`;
  }
  const rows = await db.query<Omit<DongMetrics, "regionId"> & { region_id: string }>(
    `SELECT r.region_id,
       count(*) FILTER (WHERE r.care_status <> 'closed' AND r.created_at < $${ei})::int AS recipients,
       count(*) FILTER (WHERE r.care_status <> 'closed' AND ${UNCONNECTED_SQL})::int AS unconnected,
       count(*) FILTER (WHERE ${NEEDS_REVIEW_SQL})::int AS "needsReview",
       COALESCE(sum((SELECT count(*) FROM action_tasks t WHERE t.recipient_id = r.id AND t.status IN ('open','in_progress','waiting')${taskFilter})), 0)::int AS "openTasks",
       COALESCE(sum((SELECT count(*) FROM action_tasks t WHERE t.recipient_id = r.id AND t.created_at >= $${si} AND t.created_at < $${ei}${taskFilter})), 0)::int AS "tasksCreated",
       COALESCE(sum((SELECT count(*) FROM action_tasks t WHERE t.recipient_id = r.id AND t.created_at >= $${si} AND t.created_at < $${ei}
         AND t.status = 'completed' AND t.completed_at < $${ei}${taskFilter})), 0)::int AS "tasksCompleted"
     FROM care_recipients r WHERE ${s.where} GROUP BY r.region_id`,
    p,
  );
  return new Map(rows.map((r) => [r.region_id, { regionId: r.region_id, recipients: r.recipients, unconnected: r.unconnected, needsReview: r.needsReview, openTasks: r.openTasks, tasksCreated: r.tasksCreated, tasksCompleted: r.tasksCompleted }]));
}

const rate = (done: number, total: number) => (total === 0 ? null : Math.round((done / total) * 1000) / 10);

/** Resource counts per dong: services whose coverage includes the dong (directly or via an ancestor). */
async function resourcesByDong(db: Db, regions: Region[], serviceType?: ServiceType) {
  const p: unknown[] = [];
  let f = "";
  if (serviceType) {
    p.push(serviceType);
    f = `WHERE sc.service_type = $1`;
  }
  const services = await db.query<{ id: string; service_type: ServiceType; service_region_ids: string[]; is_operating: boolean }>(
    `SELECT id, service_type, service_region_ids, is_operating FROM service_catalog sc ${f}`,
    p,
  );
  const out = new Map<string, Partial<Record<ServiceType, number>>>();
  for (const dong of regions.filter((r) => r.level === "eupmyeondong")) {
    const lineage = new Set([dong.id, dong.parentId, regions.find((r) => r.id === dong.parentId)?.parentId].filter(Boolean) as string[]);
    const counts: Partial<Record<ServiceType, number>> = {};
    for (const s of services) {
      if (s.is_operating && s.service_region_ids.some((id) => lineage.has(id))) counts[s.service_type] = (counts[s.service_type] ?? 0) + 1;
    }
    out.set(dong.id, counts);
  }
  return out;
}

export type RegionCoverage = DongMetrics & {
  regionName: string;
  parentId: string | null;
  level: Region["level"];
  completionRate: number | null;
  resources: Partial<Record<ServiceType, number>>;
  resourceTotal: number;
  boundary: Region["boundary"];
};

/** Per-dong metrics for the map, plus totals rolled up to each 시·군·구. */
export async function mapCoverage(db: Db, actor: Actor, q: AnalyticsQuery) {
  const period = resolvePeriod(q);
  const s = await scopeFor(db, actor, { ...q, regionId: undefined });
  const byDong = await metricsByDong(db, s, period.start, period.end, q.taskStatus);
  const resources = await resourcesByDong(db, s.regions, q.serviceType);
  const visible = actor.role === "admin" ? null : new Set(actor.scopeRegionIds ?? []);
  const dongs = s.regions.filter((r) => r.level === "eupmyeondong" && (!visible || visible.has(r.id)));
  const toCoverage = (r: Region, m: Omit<DongMetrics, "regionId">, res: Partial<Record<ServiceType, number>>): RegionCoverage => ({
    regionId: r.id,
    regionName: r.name,
    parentId: r.parentId,
    level: r.level,
    ...m,
    completionRate: rate(m.tasksCompleted, m.tasksCreated),
    resources: res,
    resourceTotal: Object.values(res).reduce((a, b) => a + (b ?? 0), 0),
    boundary: r.boundary,
  });
  const empty = { recipients: 0, unconnected: 0, needsReview: 0, openTasks: 0, tasksCreated: 0, tasksCompleted: 0 };
  const dongCoverage = dongs.map((d) => toCoverage(d, byDong.get(d.id) ?? empty, resources.get(d.id) ?? {}));
  const sigungu = s.regions
    .filter((r) => r.level === "sigungu" && dongCoverage.some((d) => d.parentId === r.id))
    .map((g) => {
      const kids = dongCoverage.filter((d) => d.parentId === g.id);
      const sum = (k: keyof typeof empty) => kids.reduce((a, d) => a + d[k], 0);
      const m = { recipients: sum("recipients"), unconnected: sum("unconnected"), needsReview: sum("needsReview"), openTasks: sum("openTasks"), tasksCreated: sum("tasksCreated"), tasksCompleted: sum("tasksCompleted") };
      // Resources at district level: distinct services, not the sum over dongs.
      return toCoverage(g, m, {});
    });
  const districtResources = await resourcesBySigungu(db, s.regions, q.serviceType);
  for (const g of sigungu) {
    g.resources = districtResources.get(g.regionId) ?? {};
    g.resourceTotal = Object.values(g.resources).reduce((a, b) => a + (b ?? 0), 0);
  }
  return { period: { from: period.from, to: period.to }, dongs: dongCoverage, districts: sigungu, isDemoData: true };
}

async function resourcesBySigungu(db: Db, regions: Region[], serviceType?: ServiceType) {
  const p: unknown[] = [];
  let f = "";
  if (serviceType) {
    p.push(serviceType);
    f = `AND sc.service_type = $1`;
  }
  const services = await db.query<{ service_type: ServiceType; service_region_ids: string[] }>(`SELECT service_type, service_region_ids FROM service_catalog sc WHERE is_operating ${f}`, p);
  const out = new Map<string, Partial<Record<ServiceType, number>>>();
  for (const g of regions.filter((r) => r.level === "sigungu")) {
    const kids = new Set([g.id, g.parentId, ...regions.filter((r) => r.parentId === g.id).map((r) => r.id)].filter(Boolean) as string[]);
    const counts: Partial<Record<ServiceType, number>> = {};
    for (const s of services) if (s.service_region_ids.some((id) => kids.has(id))) counts[s.service_type] = (counts[s.service_type] ?? 0) + 1;
    out.set(g.id, counts);
  }
  return out;
}

/** KPI summary + breakdowns. Definitions are documented in docs/NEULGYEOT_API.md. */
export async function analyticsSummary(db: Db, actor: Actor, q: AnalyticsQuery): Promise<ReportStats & { resourcesByType: { serviceType: ServiceType; count: number }[] }> {
  const period = resolvePeriod(q);
  const s = await scopeFor(db, actor, q);
  const byDong = await metricsByDong(db, s, period.start, period.end, q.taskStatus);
  const all = [...byDong.values()];
  const total = (k: keyof Omit<DongMetrics, "regionId">) => all.reduce((a, m) => a + m[k], 0);

  // Group rows for the breakdown: dongs when a district is selected, otherwise districts.
  const groupLevel = s.focus?.level === "sigungu" || s.focus?.level === "eupmyeondong" ? "eupmyeondong" : "sigungu";
  const groups = new Map<string, ReportStats["byRegion"][number]>();
  for (const m of all) {
    const dong = s.regions.find((r) => r.id === m.regionId)!;
    const key = groupLevel === "eupmyeondong" ? dong.id : dong.parentId!;
    const name = s.regions.find((r) => r.id === key)?.name ?? key;
    const g = groups.get(key) ?? { regionId: key, regionName: name, recipients: 0, unconnected: 0, needsReview: 0, openTasks: 0 };
    g.recipients += m.recipients;
    g.unconnected += m.unconnected;
    g.needsReview += m.needsReview;
    g.openTasks += m.openTasks;
    groups.set(key, g);
  }

  const p = [...s.params, period.start, period.end];
  const si = p.length - 1;
  const ei = p.length;
  const [avg] = await db.query<{ days: number | null }>(
    `SELECT round(avg(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400)::numeric, 1)::float AS days
     FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id
     WHERE ${s.where} AND t.status = 'completed' AND t.completed_at >= $${si} AND t.completed_at < $${ei}`,
    p,
  );
  const referrals = await db.query<{ service_type: ServiceType; active: number; failed: number; suspended: number }>(
    `SELECT sc.service_type,
       count(*) FILTER (WHERE sr.status IN ('requested','received','in_progress','in_service'))::int AS active,
       count(*) FILTER (WHERE sr.status = 'failed' AND sr.status_changed_at >= $${si} AND sr.status_changed_at < $${ei})::int AS failed,
       count(*) FILTER (WHERE sr.status = 'suspended')::int AS suspended
     FROM service_referrals sr JOIN service_catalog sc ON sc.id = sr.service_id JOIN care_recipients r ON r.id = sr.recipient_id
     WHERE ${s.where} GROUP BY sc.service_type ORDER BY sc.service_type`,
    p,
  );
  const tasksByStatus = await db.query<{ status: TaskStatus; count: number }>(
    `SELECT t.status, count(*)::int AS count FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id
     WHERE ${s.where} AND t.created_at >= $${si} AND t.created_at < $${ei} GROUP BY t.status ORDER BY t.status`,
    p,
  );
  const resources = await resourcesBySigungu(db, s.regions, q.serviceType);
  const resourceTotals = new Map<ServiceType, number>();
  const districtIds = s.focus
    ? [s.focus.level === "eupmyeondong" ? s.focus.parentId! : s.focus.id].filter((id) => s.regions.find((r) => r.id === id)?.level === "sigungu")
    : s.regions.filter((r) => r.level === "sigungu" && (actor.role === "admin" || actor.scopeRegionIds?.includes(r.id))).map((r) => r.id);
  for (const id of districtIds) for (const [t, n] of Object.entries(resources.get(id) ?? {})) resourceTotals.set(t as ServiceType, (resourceTotals.get(t as ServiceType) ?? 0) + (n ?? 0));

  const created = total("tasksCreated");
  const completed = total("tasksCompleted");
  return {
    periodStart: period.from,
    periodEnd: period.to,
    regionName: s.focus?.name ?? (actor.role === "admin" ? "전체 지역" : "담당 지역"),
    recipients: total("recipients"),
    needsReview: total("needsReview"),
    unconnected: total("unconnected"),
    openTasks: total("openTasks"),
    tasksCreated: created,
    tasksCompleted: completed,
    completionRate: rate(completed, created),
    avgResolutionDays: avg?.days ?? null,
    byRegion: [...groups.values()].sort((a, b) => a.regionId.localeCompare(b.regionId)),
    referralsByType: referrals.map((r) => ({ serviceType: r.service_type, active: r.active, failed: r.failed, suspended: r.suspended })),
    tasksByStatus: tasksByStatus.map((t) => ({ status: t.status, count: t.count })),
    resourcesByType: [...resourceTotals.entries()].map(([serviceType, count]) => ({ serviceType, count })).sort((a, b) => a.serviceType.localeCompare(b.serviceType)),
  };
}

/** Weekly series over the period (weeks start on the period start date). */
export async function analyticsTrends(db: Db, actor: Actor, q: AnalyticsQuery) {
  const period = resolvePeriod(q);
  const s = await scopeFor(db, actor, q);
  const p = [...s.params, period.start, period.end];
  const si = p.length - 1;
  const ei = p.length;
  const bucket = (col: string) => `floor(EXTRACT(EPOCH FROM (${col} - $${si}::timestamptz)) / 604800)::int`;
  const series = async (sql: string) => {
    const rows = await db.query<{ w: number; n: number }>(sql, p);
    return new Map(rows.map((r) => [r.w, r.n]));
  };
  const created = await series(
    `SELECT ${bucket("t.created_at")} AS w, count(*)::int AS n FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id
     WHERE ${s.where} AND t.created_at >= $${si} AND t.created_at < $${ei} GROUP BY 1`,
  );
  const completed = await series(
    `SELECT ${bucket("t.completed_at")} AS w, count(*)::int AS n FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id
     WHERE ${s.where} AND t.status = 'completed' AND t.completed_at >= $${si} AND t.completed_at < $${ei} GROUP BY 1`,
  );
  const newRecipients = await series(
    `SELECT ${bucket("r.created_at")} AS w, count(*)::int AS n FROM care_recipients r
     WHERE ${s.where} AND r.created_at >= $${si} AND r.created_at < $${ei} GROUP BY 1`,
  );
  const gaps = await series(
    `SELECT ${bucket("sr.status_changed_at")} AS w, count(*)::int AS n FROM service_referrals sr JOIN care_recipients r ON r.id = sr.recipient_id
     WHERE ${s.where} AND sr.status IN ('failed','suspended') AND sr.status_changed_at >= $${si} AND sr.status_changed_at < $${ei} GROUP BY 1`,
  );
  const weeks = Math.ceil((period.end.getTime() - period.start.getTime()) / 604_800_000);
  const points = Array.from({ length: weeks }, (_, w) => {
    const start = new Date(period.start.getTime() + w * 604_800_000 + 9 * 3600_000).toISOString().slice(0, 10);
    return { week: w, start, tasksCreated: created.get(w) ?? 0, tasksCompleted: completed.get(w) ?? 0, newRecipients: newRecipients.get(w) ?? 0, serviceGaps: gaps.get(w) ?? 0 };
  });
  return { period: { from: period.from, to: period.to }, points };
}
