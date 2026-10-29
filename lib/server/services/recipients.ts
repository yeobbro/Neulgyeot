import { z } from "zod";
import { CARE_STATUSES, SERVICE_TYPES, type CareStatus, type ServiceType } from "../../domain/constants";
import { audit } from "../audit";
import { assertRecipientAccess, regionScopeSql, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { forbidden, invalid } from "../errors";
import { paginated } from "../http";
import { expandRegion } from "./regions";
import { NEEDS_REVIEW_SQL, UNCONNECTED_SQL } from "./sql";

export const recipientAttributesSchema = z
  .object({
    age: z.number().int().min(0).max(120).optional(),
    livingAlone: z.boolean().optional(),
    usesMobilityAid: z.boolean().optional(),
    hasCaregiver: z.boolean().optional(),
  })
  .strict();

export const recipientListQuery = z.object({
  q: z.string().trim().max(50).optional(),
  regionId: z.string().max(40).optional(),
  assignedUserId: z.string().max(40).optional(),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  status: z.enum(CARE_STATUSES).optional(),
  unconnected: z.enum(["true", "false"]).optional(),
  needsReview: z.enum(["true", "false"]).optional(),
  sort: z.enum(["updated_desc", "code_asc", "next_check_asc", "priority_desc"]).default("priority_desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RecipientListQuery = z.infer<typeof recipientListQuery>;

export type RecipientSummary = {
  id: string;
  displayCode: string;
  displayName: string;
  ageBand: string | null;
  regionId: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  careStatus: CareStatus;
  needs: ServiceType[];
  nextCheckAt: string | null;
  updatedAt: string;
  unconnected: boolean;
  needsReview: boolean;
  latestPriority: "high" | "medium" | "low" | "none" | null;
  openTasks: number;
  isDemoData: boolean;
};

type SummaryRow = {
  id: string;
  display_code: string;
  display_name: string;
  age_band: string | null;
  region_id: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  care_status: CareStatus;
  needs: ServiceType[];
  next_check_at: Date | null;
  updated_at: Date;
  unconnected: boolean;
  needs_review: boolean;
  latest_priority: RecipientSummary["latestPriority"];
  open_tasks: number;
  is_demo_data: boolean;
};

const mapSummary = (r: SummaryRow): RecipientSummary => ({
  id: r.id,
  displayCode: r.display_code,
  displayName: r.display_name,
  ageBand: r.age_band,
  regionId: r.region_id,
  assignedUserId: r.assigned_user_id,
  assignedUserName: r.assigned_user_name,
  careStatus: r.care_status,
  needs: r.needs,
  nextCheckAt: r.next_check_at?.toISOString() ?? null,
  updatedAt: r.updated_at.toISOString(),
  unconnected: r.unconnected,
  needsReview: r.needs_review,
  latestPriority: r.latest_priority,
  openTasks: r.open_tasks,
  isDemoData: r.is_demo_data,
});

const SUMMARY_SELECT = `
  r.id, r.display_code, r.display_name, r.age_band, r.region_id, r.assigned_user_id, u.name AS assigned_user_name,
  r.care_status, r.needs, r.next_check_at, r.updated_at, r.is_demo_data,
  ${UNCONNECTED_SQL} AS unconnected,
  ${NEEDS_REVIEW_SQL} AS needs_review,
  (SELECT a.priority FROM risk_assessments a WHERE a.recipient_id = r.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1) AS latest_priority,
  (SELECT count(*)::int FROM action_tasks t WHERE t.recipient_id = r.id AND t.status IN ('open','in_progress','waiting')) AS open_tasks`;

/** Builds WHERE clauses shared by the recipient list and the map drill-down. */
export async function recipientFilterSql(db: Db, actor: Actor, q: Partial<RecipientListQuery>, params: unknown[]) {
  const where: string[] = [regionScopeSql(actor, "r.region_id", params)];
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`(r.display_code ILIKE $${params.length} OR r.display_name ILIKE $${params.length})`);
  }
  if (q.regionId) {
    params.push(await expandRegion(db, q.regionId));
    where.push(`r.region_id = ANY($${params.length})`);
  }
  if (q.assignedUserId) {
    params.push(q.assignedUserId);
    where.push(`r.assigned_user_id = $${params.length}`);
  }
  if (q.serviceType) {
    params.push(q.serviceType);
    where.push(`$${params.length} = ANY(r.needs)`);
  }
  if (q.status) {
    params.push(q.status);
    where.push(`r.care_status = $${params.length}`);
  }
  if (q.unconnected) where.push(q.unconnected === "true" ? UNCONNECTED_SQL : `NOT ${UNCONNECTED_SQL}`);
  if (q.needsReview) where.push(q.needsReview === "true" ? NEEDS_REVIEW_SQL : `NOT ${NEEDS_REVIEW_SQL}`);
  return where.join(" AND ");
}

const ORDER: Record<RecipientListQuery["sort"], string> = {
  updated_desc: "r.updated_at DESC, r.id",
  code_asc: "r.display_code",
  next_check_asc: "r.next_check_at ASC NULLS LAST, r.id",
  priority_desc: `CASE (SELECT a.priority FROM risk_assessments a WHERE a.recipient_id = r.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1)
    WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, r.display_code`,
};

export async function listRecipients(db: Db, actor: Actor, q: RecipientListQuery) {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const where = await recipientFilterSql(db, actor, q, params);
  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM care_recipients r WHERE ${where}`, params);
  const offset = (q.page - 1) * q.pageSize;
  const rows = await db.query<SummaryRow>(
    `SELECT ${SUMMARY_SELECT} FROM care_recipients r LEFT JOIN users u ON u.id = r.assigned_user_id
     WHERE ${where} ORDER BY ${ORDER[q.sort]} LIMIT ${q.pageSize} OFFSET ${offset}`,
    params,
  );
  return paginated(rows.map(mapSummary), total, q.page, q.pageSize);
}

export async function getRecipientSummary(db: Db, actor: Actor, id: string): Promise<RecipientSummary & { attributes: z.infer<typeof recipientAttributesSchema>; staffNote: string | null }> {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, id);
  const [row] = await db.query<SummaryRow & { attributes: Record<string, unknown>; staff_note: string | null }>(
    `SELECT ${SUMMARY_SELECT}, r.attributes, r.staff_note FROM care_recipients r LEFT JOIN users u ON u.id = r.assigned_user_id WHERE r.id = $1`,
    [id],
  );
  return { ...mapSummary(row), attributes: row.attributes, staffNote: row.staff_note };
}

export const createRecipientSchema = z
  .object({
    displayName: z.string().trim().min(1).max(30),
    ageBand: z.string().trim().max(10).optional(),
    regionId: z.string().min(1),
    assignedUserId: z.string().optional(),
    needs: z.array(z.enum(SERVICE_TYPES)).max(SERVICE_TYPES.length).default([]),
    attributes: recipientAttributesSchema.default({}),
    nextCheckAt: z.iso.datetime({ offset: true }).optional(),
    staffNote: z.string().max(2000).optional(),
  })
  .strict();

export async function createRecipient(db: Db, actor: Actor, input: z.infer<typeof createRecipientSchema>) {
  requireRole(actor, ["admin", "worker"]);
  const [region] = await db.query<{ id: string; level: string }>(`SELECT id, level FROM regions WHERE id = $1`, [input.regionId]);
  if (!region || region.level !== "eupmyeondong") throw invalid("대상 지역은 읍·면·동 단위로 선택해야 합니다.");
  if (actor.role === "worker" && !actor.scopeRegionIds?.includes(region.id)) throw forbidden("담당 지역 밖의 대상자는 등록할 수 없습니다.");
  const assigned = input.assignedUserId ?? (actor.role === "worker" ? actor.id : null);
  if (assigned) await assertAssignable(db, assigned, region.id);
  return db.transaction(async (tx) => {
    const id = await nextId(tx, "R", 4);
    const code = `NG-${id.slice(2)}`;
    await tx.query(
      `INSERT INTO care_recipients (id, display_code, display_name, age_band, region_id, assigned_user_id, needs, attributes, next_check_at, staff_note, is_demo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, true)`,
      [id, code, input.displayName, input.ageBand ?? null, region.id, assigned, input.needs, JSON.stringify(input.attributes), input.nextCheckAt ?? null, input.staffNote ?? null],
    );
    await audit(tx, { actorId: actor.id, action: "recipient.created", entityType: "recipient", entityId: id, recipientId: id });
    return { id, displayCode: code };
  });
}

export const updateRecipientSchema = z
  .object({
    careStatus: z.enum(CARE_STATUSES).optional(),
    assignedUserId: z.string().nullable().optional(),
    needs: z.array(z.enum(SERVICE_TYPES)).optional(),
    attributes: recipientAttributesSchema.optional(),
    nextCheckAt: z.iso.datetime({ offset: true }).nullable().optional(),
    staffNote: z.string().max(2000).nullable().optional(),
  })
  .strict();

async function assertAssignable(db: Db, userId: string, regionId: string) {
  const [u] = await db.query<{ role: string; region_id: string | null; is_active: boolean }>(`SELECT role, region_id, is_active FROM users WHERE id = $1`, [userId]);
  if (!u || !u.is_active || u.role !== "worker") throw invalid("담당자는 활성 상태의 돌봄 담당자여야 합니다.");
  const scope = u.region_id ? await expandRegion(db, u.region_id) : [];
  if (!scope.includes(regionId)) throw invalid("선택한 담당자의 지역 범위 밖입니다.");
}

export async function updateRecipient(db: Db, actor: Actor, id: string, input: z.infer<typeof updateRecipientSchema>) {
  requireRole(actor, ["admin", "worker"]);
  const r = await assertRecipientAccess(db, actor, id);
  if (input.assignedUserId) await assertAssignable(db, input.assignedUserId, r.region_id);
  const cols: Record<string, unknown> = {
    care_status: input.careStatus,
    assigned_user_id: input.assignedUserId,
    needs: input.needs,
    attributes: input.attributes ? JSON.stringify(input.attributes) : undefined,
    next_check_at: input.nextCheckAt,
    staff_note: input.staffNote,
  };
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (!entries.length) throw invalid("변경할 항목이 없습니다.");
  const params: unknown[] = [id];
  const sets = entries.map(([k, v]) => {
    params.push(v);
    return `${k} = $${params.length}`;
  });
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE care_recipients SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
    await audit(tx, {
      actorId: actor.id,
      action: "recipient.updated",
      entityType: "recipient",
      entityId: id,
      recipientId: id,
      metadata: { fields: entries.map(([k]) => k), careStatus: input.careStatus, assignedUserId: input.assignedUserId },
    });
  });
  return getRecipientSummary(db, actor, id);
}

export async function listAssignableWorkers(db: Db, actor: Actor) {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const scope = actor.role === "admin" ? "TRUE" : regionScopeSql(actor, "u.region_id", params);
  return db.query<{ id: string; name: string; region_id: string }>(
    `SELECT id, name, region_id FROM users u WHERE role = 'worker' AND is_active AND ${scope} ORDER BY name`,
    params,
  );
}
