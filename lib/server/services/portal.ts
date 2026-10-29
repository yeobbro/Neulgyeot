import { z } from "zod";
import {
  SUPPORT_REQUEST_STATUSES,
  SUPPORT_REQUEST_TYPES,
  type ReferralStatus,
  type ServiceType,
  type SupportRequestStatus,
  type SupportRequestType,
} from "../../domain/constants";
import { checkSupportRequestTransition } from "../../domain/transitions";
import { audit } from "../audit";
import { assertPortalAccess, assertRecipientAccess, portalRecipientIds, regionScopeSql, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { forbidden, invalid, notFound } from "../errors";
import { paginated } from "../http";
import { notify } from "./notifications";

/** Plain-language referral status for residents and families. */
export const PORTAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  requested: "신청했어요",
  received: "기관에서 확인했어요",
  in_progress: "준비하고 있어요",
  in_service: "이용하고 있어요",
  suspended: "잠시 멈췄어요",
  completed: "이용이 끝났어요",
  failed: "연결되지 않았어요",
  cancelled: "취소되었어요",
};

async function resolveRecipient(db: Db, actor: Actor, recipientId: string | undefined, permission: "view_services" | "view_schedule" | "create_requests") {
  const allowed = await portalRecipientIds(db, actor);
  const id = recipientId ?? allowed[0];
  if (!id) throw forbidden("연결되고 동의가 확인된 대상자가 없습니다.");
  await assertPortalAccess(db, actor, id, permission);
  return id;
}

export async function portalContext(db: Db, actor: Actor) {
  requireRole(actor, ["recipient", "family"]);
  const ids = await portalRecipientIds(db, actor);
  const recipients = ids.length
    ? await db.query<{ id: string; display_name: string }>(`SELECT id, display_name FROM care_recipients WHERE id = ANY($1) ORDER BY id`, [ids])
    : [];
  const links = actor.role === "family"
    ? await db.query<{ recipient_id: string; relationship_label: string; consent_status: string; permissions: Record<string, boolean> }>(
        `SELECT recipient_id, relationship_label, consent_status, permissions FROM family_links WHERE user_id = $1`,
        [actor.id],
      )
    : [];
  return {
    recipients: recipients.map((r) => ({ id: r.id, displayName: r.display_name })),
    links: links.map((l) => ({ recipientId: l.recipient_id, relationship: l.relationship_label, consentStatus: l.consent_status, permissions: l.permissions })),
  };
}

/** Only service name, provider, plain status and contact — no staff notes, failure reasons or assessments. */
export async function portalServices(db: Db, actor: Actor, recipientId?: string) {
  requireRole(actor, ["recipient", "family"]);
  const id = await resolveRecipient(db, actor, recipientId, "view_services");
  const rows = await db.query<{ id: string; status: ReferralStatus; name: string; service_type: ServiceType; provider: string; contact: string; schedule: string; status_changed_at: Date }>(
    `SELECT sr.id, sr.status, sc.name, sc.service_type, p.name AS provider, sc.contact_method AS contact, sc.schedule_label AS schedule, sr.status_changed_at
     FROM service_referrals sr JOIN service_catalog sc ON sc.id = sr.service_id JOIN service_providers p ON p.id = sr.provider_id
     WHERE sr.recipient_id = $1 AND sr.status <> 'cancelled' ORDER BY sr.status_changed_at DESC`,
    [id],
  );
  return {
    recipientId: id,
    data: rows.map((r) => ({
      id: r.id,
      serviceName: r.name,
      serviceType: r.service_type,
      providerName: r.provider,
      status: r.status,
      statusLabel: PORTAL_STATUS_LABEL[r.status],
      contact: r.contact,
      schedule: r.schedule,
      updatedAt: r.status_changed_at.toISOString(),
    })),
  };
}

/** Upcoming scheduled visits only (time and type, no record content). */
export async function portalSchedule(db: Db, actor: Actor, recipientId?: string) {
  requireRole(actor, ["recipient", "family"]);
  const id = await resolveRecipient(db, actor, recipientId, "view_schedule");
  const rows = await db.query<{ id: string; scheduled_at: Date; record_type: string }>(
    `SELECT id, scheduled_at, record_type FROM care_records
     WHERE recipient_id = $1 AND deleted_at IS NULL AND visit_status = 'scheduled' AND scheduled_at >= now() ORDER BY scheduled_at LIMIT 20`,
    [id],
  );
  return { recipientId: id, data: rows.map((r) => ({ id: r.id, at: r.scheduled_at.toISOString(), kind: "방문 돌봄 확인" })) };
}

export const portalRequestSchema = z
  .object({
    recipientId: z.string().optional(),
    requestType: z.enum(SUPPORT_REQUEST_TYPES),
    title: z.string().trim().min(1, "제목을 입력하세요.").max(80),
    content: z.string().trim().min(1, "내용을 입력하세요.").max(2000),
    relatedReferralId: z.string().optional(),
  })
  .strict();

export async function createPortalRequest(db: Db, actor: Actor, input: z.infer<typeof portalRequestSchema>) {
  requireRole(actor, ["recipient", "family"]);
  const recipientId = await resolveRecipient(db, actor, input.recipientId, "create_requests");
  if (input.relatedReferralId) {
    const [ok] = await db.query(`SELECT 1 FROM service_referrals WHERE id = $1 AND recipient_id = $2`, [input.relatedReferralId, recipientId]);
    if (!ok) throw invalid("관련 서비스를 확인할 수 없습니다.");
  }
  const [r] = await db.query<{ assigned_user_id: string | null; display_code: string }>(`SELECT assigned_user_id, display_code FROM care_recipients WHERE id = $1`, [recipientId]);
  const id = await db.transaction(async (tx) => {
    const id = await nextId(tx, "REQ");
    await tx.query(
      `INSERT INTO support_requests (id, recipient_id, created_by, request_type, title, content, related_referral_id, assigned_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, recipientId, actor.id, input.requestType, input.title, input.content, input.relatedReferralId ?? null, r.assigned_user_id],
    );
    await audit(tx, { actorId: actor.id, action: "support_request.created", entityType: "support_request", entityId: id, recipientId, metadata: { requestType: input.requestType } });
    await notify(tx, { userId: r.assigned_user_id, type: "support_request", title: "새 문의 접수", message: `${r.display_code} 관련 문의: ${input.title}`, link: `/care/requests?focus=${id}` });
    return id;
  });
  return { id };
}

export type SupportRequest = {
  id: string;
  recipientId: string;
  displayCode?: string;
  requestType: SupportRequestType;
  title: string;
  content: string;
  status: SupportRequestStatus;
  assignedUserName: string | null;
  responseContent: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReqRow = {
  id: string;
  recipient_id: string;
  display_code: string;
  request_type: SupportRequestType;
  title: string;
  content: string;
  status: SupportRequestStatus;
  assigned_name: string | null;
  response_content: string | null;
  creator_name: string | null;
  created_at: Date;
  updated_at: Date;
};

const REQ_SELECT = `SELECT q.*, r.display_code, a.name AS assigned_name, c.name AS creator_name
  FROM support_requests q JOIN care_recipients r ON r.id = q.recipient_id LEFT JOIN users a ON a.id = q.assigned_user_id LEFT JOIN users c ON c.id = q.created_by`;

const mapReq = (r: ReqRow, staff: boolean): SupportRequest => ({
  id: r.id,
  recipientId: r.recipient_id,
  ...(staff ? { displayCode: r.display_code } : {}),
  requestType: r.request_type,
  title: r.title,
  content: r.content,
  status: r.status,
  assignedUserName: r.assigned_name,
  responseContent: r.response_content,
  createdByName: r.creator_name,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/** Portal users see requests they created for recipients they are still allowed to act for. */
export async function listPortalRequests(db: Db, actor: Actor) {
  requireRole(actor, ["recipient", "family"]);
  const ids = await portalRecipientIds(db, actor);
  if (!ids.length) return { data: [] };
  const rows = await db.query<ReqRow>(`${REQ_SELECT} WHERE q.created_by = $1 AND q.recipient_id = ANY($2) ORDER BY q.created_at DESC`, [actor.id, ids]);
  return { data: rows.map((r) => mapReq(r, false)) };
}

export const staffRequestListQuery = z.object({
  status: z.enum(SUPPORT_REQUEST_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listStaffRequests(db: Db, actor: Actor, q: z.infer<typeof staffRequestListQuery>) {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const where = [regionScopeSql(actor, "r.region_id", params)];
  if (q.status) {
    params.push(q.status);
    where.push(`q.status = $${params.length}`);
  }
  const w = where.join(" AND ");
  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM support_requests q JOIN care_recipients r ON r.id = q.recipient_id WHERE ${w}`, params);
  const rows = await db.query<ReqRow>(`${REQ_SELECT} WHERE ${w} ORDER BY CASE q.status WHEN 'received' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, q.created_at DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`, params);
  return paginated(rows.map((r) => mapReq(r, true)), total, q.page, q.pageSize);
}

export const updateRequestSchema = z
  .object({
    status: z.enum(SUPPORT_REQUEST_STATUSES),
    responseContent: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function updateSupportRequest(db: Db, actor: Actor, id: string, input: z.infer<typeof updateRequestSchema>) {
  requireRole(actor, ["admin", "worker"]);
  const [row] = await db.query<ReqRow>(`${REQ_SELECT} WHERE q.id = $1`, [id]);
  if (!row) throw notFound("문의");
  await assertRecipientAccess(db, actor, row.recipient_id);
  const check = checkSupportRequestTransition(row.status, input.status, { responseContent: input.responseContent ?? row.response_content });
  if (!check.ok) throw invalid(check.reason);
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE support_requests SET status = $2, response_content = COALESCE($3, response_content), assigned_user_id = COALESCE(assigned_user_id, $4), updated_at = now() WHERE id = $1`,
      [id, input.status, input.responseContent ?? null, actor.id],
    );
    await audit(tx, { actorId: actor.id, action: "support_request.status_changed", entityType: "support_request", entityId: id, recipientId: row.recipient_id, metadata: { from: row.status, to: input.status } });
    const [pref] = await tx.query<{ request_updates: boolean }>(`SELECT request_updates FROM notification_preferences WHERE user_id = (SELECT created_by FROM support_requests WHERE id = $1)`, [id]);
    if (pref?.request_updates !== false) {
      const [creator] = await tx.query<{ created_by: string }>(`SELECT created_by FROM support_requests WHERE id = $1`, [id]);
      await notify(tx, { userId: creator.created_by, type: "support_request_update", title: "문의 처리 상태가 바뀌었어요", message: row.title, link: `/portal#requests` });
    }
  });
  const [updated] = await db.query<ReqRow>(`${REQ_SELECT} WHERE q.id = $1`, [id]);
  return mapReq(updated, true);
}

/** Admin: revoke or grant a family link. Revocation applies on the next request (actors are loaded per request). */
export async function setFamilyConsent(db: Db, actor: Actor, linkId: string, status: "granted" | "revoked") {
  requireRole(actor, ["admin", "worker"]);
  const [link] = await db.query<{ recipient_id: string }>(`SELECT recipient_id FROM family_links WHERE id = $1`, [linkId]);
  if (!link) throw notFound("가족 연결");
  await assertRecipientAccess(db, actor, link.recipient_id);
  await db.query(`UPDATE family_links SET consent_status = $2, revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE NULL END WHERE id = $1`, [linkId, status]);
  await audit(db, { actorId: actor.id, action: `family_link.${status}`, entityType: "family_link", entityId: linkId, recipientId: link.recipient_id });
}

export async function listFamilyLinks(db: Db, actor: Actor, recipientId: string) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, recipientId);
  return db.query<{ id: string; relationship_label: string; consent_status: string; user_name: string; permissions: Record<string, boolean> }>(
    `SELECT f.id, f.relationship_label, f.consent_status, u.name AS user_name, f.permissions FROM family_links f JOIN users u ON u.id = f.user_id WHERE f.recipient_id = $1 ORDER BY f.id`,
    [recipientId],
  );
}
