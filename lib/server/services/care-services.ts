import { z } from "zod";
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LABEL,
  SERVICE_TYPES,
  type Availability,
  type ReferralStatus,
  type ServiceType,
} from "../../domain/constants";
import { matchServices, type EligibilityRules, type MatchService } from "../../domain/matching";
import { checkReferralTransition } from "../../domain/transitions";
import { audit } from "../audit";
import { assertRecipientAccess, regionScopeSql, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { forbidden, invalid, notFound } from "../errors";
import { paginated } from "../http";
import { notify } from "./notifications";
import { expandRegion, regionLineage } from "./regions";

export type CatalogService = {
  id: string;
  providerId: string;
  providerName: string;
  providerRegionId: string;
  name: string;
  serviceType: ServiceType;
  serviceRegionIds: string[];
  eligibility: EligibilityRules;
  description: string;
  applicationMethod: string;
  scheduleLabel: string;
  isOperating: boolean;
  capacityStatus: Availability;
  capacityVerified: boolean;
  contactMethod: string;
  dataSource: string;
  sourceUpdatedAt: string;
  isDemoData: boolean;
};

type CatalogRow = {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_region_id: string;
  name: string;
  service_type: ServiceType;
  service_region_ids: string[];
  eligibility_rules: EligibilityRules;
  description: string;
  application_method: string;
  schedule_label: string;
  is_operating: boolean;
  capacity_status: Availability;
  capacity_verified: boolean;
  contact_method: string;
  data_source: string;
  source_updated_at: Date;
  is_demo_data: boolean;
};

const mapCatalog = (r: CatalogRow): CatalogService => ({
  id: r.id,
  providerId: r.provider_id,
  providerName: r.provider_name,
  providerRegionId: r.provider_region_id,
  name: r.name,
  serviceType: r.service_type,
  serviceRegionIds: r.service_region_ids,
  eligibility: r.eligibility_rules,
  description: r.description,
  applicationMethod: r.application_method,
  scheduleLabel: r.schedule_label,
  isOperating: r.is_operating,
  capacityStatus: r.capacity_status,
  capacityVerified: r.capacity_verified,
  contactMethod: r.contact_method,
  dataSource: r.data_source,
  sourceUpdatedAt: r.source_updated_at.toISOString(),
  isDemoData: r.is_demo_data,
});

const CATALOG_SELECT = `SELECT sc.*, p.name AS provider_name, p.region_id AS provider_region_id
  FROM service_catalog sc JOIN service_providers p ON p.id = sc.provider_id`;

export const serviceListQuery = z.object({
  serviceType: z.enum(SERVICE_TYPES).optional(),
  regionId: z.string().optional(),
  q: z.string().trim().max(50).optional(),
});

export async function listServices(db: Db, actor: Actor, q: z.infer<typeof serviceListQuery>) {
  requireRole(actor, ["admin", "worker", "provider"]);
  const params: unknown[] = [];
  const where: string[] = ["TRUE"];
  if (q.serviceType) {
    params.push(q.serviceType);
    where.push(`sc.service_type = $${params.length}`);
  }
  if (q.regionId) {
    params.push([...(await expandRegion(db, q.regionId)), ...(await regionLineage(db, q.regionId))]);
    where.push(`sc.service_region_ids && $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`(sc.name ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  return (await db.query<CatalogRow>(`${CATALOG_SELECT} WHERE ${where.join(" AND ")} ORDER BY sc.service_type, sc.name`, params)).map(mapCatalog);
}

export async function listProviders(db: Db, actor: Actor, q: { regionId?: string; serviceType?: ServiceType }) {
  requireRole(actor, ["admin", "worker", "provider"]);
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (q.regionId) {
    params.push(await expandRegion(db, q.regionId));
    where.push(`p.region_id = ANY($${params.length})`);
  }
  if (q.serviceType) {
    params.push(q.serviceType);
    where.push(`$${params.length} = ANY(p.service_types)`);
  }
  const rows = await db.query<{
    id: string;
    region_id: string;
    name: string;
    service_types: ServiceType[];
    address_label: string;
    latitude: number | null;
    longitude: number | null;
    availability_status: Availability;
    contact_label: string;
    is_demo_data: boolean;
  }>(`SELECT * FROM service_providers p WHERE ${where.join(" AND ")} ORDER BY p.name`, params);
  return rows.map((p) => ({
    id: p.id,
    regionId: p.region_id,
    name: p.name,
    serviceTypes: p.service_types,
    addressLabel: p.address_label,
    x: p.longitude,
    y: p.latitude,
    availabilityStatus: p.availability_status,
    contactLabel: p.contact_label,
    isDemoData: p.is_demo_data,
  }));
}

/** Candidate services for a recipient's needs (optionally narrowed to some types). */
export async function matchForRecipient(db: Db, actor: Actor, recipientId: string, onlyTypes?: ServiceType[]) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, recipientId);
  const [r] = await db.query<{ region_id: string; needs: ServiceType[]; attributes: Record<string, unknown> }>(
    `SELECT region_id, needs, attributes FROM care_recipients WHERE id = $1`,
    [recipientId],
  );
  const active = await db.query<{ service_id: string }>(
    `SELECT service_id FROM service_referrals WHERE recipient_id = $1 AND status IN ('requested','received','in_progress','in_service','suspended')`,
    [recipientId],
  );
  const needs = onlyTypes?.length ? r.needs.filter((n) => onlyTypes.includes(n)).concat(onlyTypes.filter((t) => !r.needs.includes(t))) : r.needs;
  const services = (await db.query<CatalogRow>(CATALOG_SELECT)).map(mapCatalog);
  const result = matchServices(
    {
      id: recipientId,
      regionIds: await regionLineage(db, r.region_id),
      needs,
      attributes: r.attributes as never,
      activeServiceIds: active.map((a) => a.service_id),
    },
    services.map(
      (s): MatchService => ({
        id: s.id,
        name: s.name,
        providerId: s.providerId,
        providerName: s.providerName,
        serviceType: s.serviceType,
        serviceRegionIds: s.serviceRegionIds,
        eligibility: s.eligibility,
        isOperating: s.isOperating,
        capacityStatus: s.capacityStatus,
        capacityVerified: s.capacityVerified,
        applicationMethod: s.applicationMethod,
        contactMethod: s.contactMethod,
        isDemoData: s.isDemoData,
      }),
    ),
  );
  return { needs, ...result, method: "rules" as const };
}

export type Referral = {
  id: string;
  recipientId: string;
  displayCode: string;
  serviceId: string;
  serviceName: string;
  serviceType: ServiceType;
  providerId: string;
  providerName: string;
  status: ReferralStatus;
  referredByName: string | null;
  referredAt: string;
  statusChangedAt: string;
  failureReason: string | null;
  resultNote: string | null;
};

type ReferralRow = {
  id: string;
  recipient_id: string;
  display_code: string;
  service_id: string;
  service_name: string;
  service_type: ServiceType;
  provider_id: string;
  provider_name: string;
  status: ReferralStatus;
  referred_by_name: string | null;
  referred_at: Date;
  status_changed_at: Date;
  failure_reason: string | null;
  result_note: string | null;
};

const mapReferral = (r: ReferralRow): Referral => ({
  id: r.id,
  recipientId: r.recipient_id,
  displayCode: r.display_code,
  serviceId: r.service_id,
  serviceName: r.service_name,
  serviceType: r.service_type,
  providerId: r.provider_id,
  providerName: r.provider_name,
  status: r.status,
  referredByName: r.referred_by_name,
  referredAt: r.referred_at.toISOString(),
  statusChangedAt: r.status_changed_at.toISOString(),
  failureReason: r.failure_reason,
  resultNote: r.result_note,
});

const REFERRAL_SELECT = `SELECT sr.*, r.display_code, sc.name AS service_name, sc.service_type, p.name AS provider_name, u.name AS referred_by_name
  FROM service_referrals sr JOIN care_recipients r ON r.id = sr.recipient_id JOIN service_catalog sc ON sc.id = sr.service_id
  JOIN service_providers p ON p.id = sr.provider_id LEFT JOIN users u ON u.id = sr.referred_by`;

export const referralListQuery = z.object({
  status: z.enum(REFERRAL_STATUSES).optional(),
  recipientId: z.string().optional(),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Providers only see referrals addressed to their own organization. */
export async function listReferrals(db: Db, actor: Actor, q: z.infer<typeof referralListQuery>) {
  requireRole(actor, ["admin", "worker", "provider"]);
  const params: unknown[] = [];
  const where: string[] = [];
  if (actor.role === "provider") {
    params.push(actor.providerId);
    where.push(`sr.provider_id = $${params.length}`);
  } else where.push(regionScopeSql(actor, "r.region_id", params));
  if (q.status) {
    params.push(q.status);
    where.push(`sr.status = $${params.length}`);
  }
  if (q.recipientId) {
    params.push(q.recipientId);
    where.push(`sr.recipient_id = $${params.length}`);
  }
  if (q.serviceType) {
    params.push(q.serviceType);
    where.push(`sc.service_type = $${params.length}`);
  }
  const w = where.join(" AND ");
  const [{ total }] = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM service_referrals sr JOIN care_recipients r ON r.id = sr.recipient_id JOIN service_catalog sc ON sc.id = sr.service_id WHERE ${w}`,
    params,
  );
  const rows = await db.query<ReferralRow>(`${REFERRAL_SELECT} WHERE ${w} ORDER BY sr.status_changed_at DESC, sr.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`, params);
  return paginated(rows.map(mapReferral), total, q.page, q.pageSize);
}

async function getReferralRow(db: Db, id: string) {
  const [row] = await db.query<ReferralRow & { region_id: string; assigned_user_id: string | null }>(
    `SELECT x.*, r2.region_id, r2.assigned_user_id FROM (${REFERRAL_SELECT} WHERE sr.id = $1) x JOIN care_recipients r2 ON r2.id = x.recipient_id`,
    [id],
  );
  if (!row) throw notFound("서비스 의뢰");
  return row;
}

async function assertReferralAccess(db: Db, actor: Actor, id: string) {
  const row = await getReferralRow(db, id);
  if (actor.role === "provider") {
    if (row.provider_id !== actor.providerId) throw notFound("서비스 의뢰");
  } else {
    requireRole(actor, ["admin", "worker"]);
    await assertRecipientAccess(db, actor, row.recipient_id);
  }
  return row;
}

export async function getReferral(db: Db, actor: Actor, id: string) {
  const row = await assertReferralAccess(db, actor, id);
  const history = await db.query<{ metadata: { from?: string; to?: string; note?: boolean }; created_at: Date; who: string | null }>(
    `SELECT l.metadata, l.created_at, u.name AS who FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.entity_type = 'referral' AND l.entity_id = $1 ORDER BY l.created_at, l.id`,
    [id],
  );
  return { ...mapReferral(row), history: history.map((h) => ({ from: h.metadata.from ?? null, to: h.metadata.to ?? null, at: h.created_at.toISOString(), actorName: h.who })) };
}

export const createReferralSchema = z
  .object({
    recipientId: z.string().min(1),
    serviceId: z.string().min(1),
    note: z.string().trim().max(1000).optional(),
    taskId: z.string().optional(),
    /** The staff member confirms they reviewed unverified conditions before referring. */
    confirmedReview: z.literal(true, { error: "추천 결과와 확인되지 않은 조건을 검토했다고 확인해야 합니다." }),
  })
  .strict();

export async function createReferral(db: Db, actor: Actor, input: z.infer<typeof createReferralSchema>) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, input.recipientId);
  const [svc] = await db.query<{ id: string; provider_id: string; name: string; is_operating: boolean }>(`SELECT id, provider_id, name, is_operating FROM service_catalog WHERE id = $1`, [input.serviceId]);
  if (!svc) throw notFound("서비스");
  if (!svc.is_operating) throw invalid("운영 중이 아닌 서비스에는 의뢰할 수 없습니다.");
  const [dup] = await db.query(
    `SELECT 1 FROM service_referrals WHERE recipient_id = $1 AND service_id = $2 AND status IN ('requested','received','in_progress','in_service','suspended')`,
    [input.recipientId, input.serviceId],
  );
  if (dup) throw invalid("같은 서비스에 진행 중인 의뢰가 이미 있습니다.");
  const id = await db.transaction(async (tx) => {
    const id = await nextId(tx, "SR");
    await tx.query(
      `INSERT INTO service_referrals (id, recipient_id, service_id, provider_id, status, referred_by, result_note) VALUES ($1,$2,$3,$4,'requested',$5,$6)`,
      [id, input.recipientId, svc.id, svc.provider_id, actor.id, input.note ?? null],
    );
    if (input.taskId) {
      const updated = await tx.query(`UPDATE action_tasks SET referral_id = $1, updated_at = now() WHERE id = $2 AND recipient_id = $3 RETURNING id`, [id, input.taskId, input.recipientId]);
      if (!updated.length) throw invalid("연결할 조치 업무가 이 대상자의 것이 아닙니다.");
    }
    await audit(tx, { actorId: actor.id, action: "referral.status_changed", entityType: "referral", entityId: id, recipientId: input.recipientId, metadata: { from: null, to: "requested" } });
    const providerUsers = await tx.query<{ id: string }>(`SELECT id FROM users WHERE provider_id = $1 AND is_active`, [svc.provider_id]);
    for (const u of providerUsers) {
      await notify(tx, { userId: u.id, type: "referral_received", title: "새 서비스 의뢰", message: `${svc.name} 의뢰가 도착했습니다.`, link: `/care/services?tab=referrals` });
    }
    return id;
  });
  return getReferral(db, actor, id);
}

export const updateReferralSchema = z
  .object({
    status: z.enum(REFERRAL_STATUSES),
    failureReason: z.string().trim().max(1000).optional(),
    resultNote: z.string().trim().max(2000).optional(),
  })
  .strict();

/** Providers move their own referrals through intake and delivery; staff can cancel or mark failure too. */
export async function updateReferral(db: Db, actor: Actor, id: string, input: z.infer<typeof updateReferralSchema>) {
  const row = await assertReferralAccess(db, actor, id);
  if (actor.role === "provider" && input.status === "cancelled") throw forbidden("의뢰 취소는 담당자만 할 수 있습니다.");
  const check = checkReferralTransition(row.status, input.status, { failureReason: input.failureReason });
  if (!check.ok) throw invalid(check.reason);
  if (row.status === input.status && !input.resultNote) throw invalid("변경할 내용이 없습니다.");
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE service_referrals SET status = $2, failure_reason = COALESCE($3, failure_reason), result_note = COALESCE($4, result_note),
         status_changed_at = CASE WHEN status <> $2 THEN now() ELSE status_changed_at END, updated_at = now() WHERE id = $1`,
      [id, input.status, input.failureReason ?? null, input.resultNote ?? null],
    );
    if (row.status !== input.status) {
      await audit(tx, { actorId: actor.id, action: "referral.status_changed", entityType: "referral", entityId: id, recipientId: row.recipient_id, metadata: { from: row.status, to: input.status, note: Boolean(input.resultNote) } });
    }
    if (input.status === "failed" || input.status === "suspended") {
      const title = input.status === "failed" ? `연계 실패 후속: ${row.service_name}` : `서비스 중단 확인: ${row.service_name}`;
      const taskId = await nextId(tx, "TASK");
      await tx.query(
        `INSERT INTO action_tasks (id, recipient_id, referral_id, task_type, title, description, priority, status, assignee_id, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'high','open',$7, now() + interval '3 days', $8)`,
        [
          taskId,
          row.recipient_id,
          id,
          input.status === "failed" ? "referral_failure" : "service_interruption",
          title,
          input.status === "failed" ? `실패 사유: ${input.failureReason}. 재의뢰 또는 대체 서비스를 검토하세요.` : "중단 사유를 확인하고 재개 또는 대체 서비스를 검토하세요.",
          row.assigned_user_id,
          actor.id,
        ],
      );
      await audit(tx, { actorId: actor.id, action: "task.created", entityType: "task", entityId: taskId, recipientId: row.recipient_id, metadata: { source: `referral.${input.status}` } });
      await notify(tx, {
        userId: row.assigned_user_id,
        type: input.status === "failed" ? "referral_failed" : "referral_suspended",
        title: input.status === "failed" ? "서비스 연계 실패" : "서비스 중단",
        message: `${row.display_code} · ${row.service_name}: ${REFERRAL_STATUS_LABEL[input.status]}`,
        link: `/care/tasks?focus=${taskId}`,
      });
    } else if (row.status !== input.status) {
      await notify(tx, {
        userId: row.assigned_user_id,
        type: "referral_status",
        title: "서비스 의뢰 상태 변경",
        message: `${row.display_code} · ${row.service_name}: ${REFERRAL_STATUS_LABEL[input.status]}`,
        link: `/care/recipients/${row.recipient_id}?tab=services`,
      });
    }
  });
  return getReferral(db, actor, id);
}
