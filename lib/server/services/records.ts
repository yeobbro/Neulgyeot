import { z } from "zod";
import {
  RECORD_FLAGS,
  RECORD_TYPES,
  VISIT_STATUSES,
  type RecordFlag,
  type RecordType,
  type SourceType,
  type VisitStatus,
} from "../../domain/constants";
import { audit } from "../audit";
import { assertRecipientAccess, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { forbidden, invalid, notFound } from "../errors";
import { notify } from "./notifications";

export type CareRecord = {
  id: string;
  recipientId: string;
  recordType: RecordType;
  visitStatus: VisitStatus | null;
  scheduledAt: string | null;
  recordedAt: string;
  content: string;
  flags: RecordFlag[];
  createdBy: string | null;
  createdByName: string | null;
  sourceType: SourceType;
  relatedReferralId: string | null;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
};

type Row = {
  id: string;
  recipient_id: string;
  record_type: RecordType;
  visit_status: VisitStatus | null;
  scheduled_at: Date | null;
  recorded_at: Date;
  content: string;
  flags: RecordFlag[];
  created_by: string | null;
  created_by_name: string | null;
  source_type: SourceType;
  related_referral_id: string | null;
  created_at: Date;
  updated_at: Date;
  revision_count: number;
};

const map = (r: Row): CareRecord => ({
  id: r.id,
  recipientId: r.recipient_id,
  recordType: r.record_type,
  visitStatus: r.visit_status,
  scheduledAt: r.scheduled_at?.toISOString() ?? null,
  recordedAt: r.recorded_at.toISOString(),
  content: r.content,
  flags: r.flags,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  sourceType: r.source_type,
  relatedReferralId: r.related_referral_id,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  revisionCount: r.revision_count,
});

const SELECT = `SELECT c.*, u.name AS created_by_name,
  (SELECT count(*)::int FROM record_revisions rv WHERE rv.record_id = c.id) AS revision_count
  FROM care_records c LEFT JOIN users u ON u.id = c.created_by`;

export async function listRecords(db: Db, actor: Actor, recipientId: string, opts: { limit?: number; recordType?: RecordType } = {}) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, recipientId);
  const params: unknown[] = [recipientId];
  let extra = "";
  if (opts.recordType) {
    params.push(opts.recordType);
    extra = ` AND c.record_type = $${params.length}`;
  }
  const rows = await db.query<Row>(
    `${SELECT} WHERE c.recipient_id = $1 AND c.deleted_at IS NULL${extra} ORDER BY COALESCE(c.scheduled_at, c.recorded_at) DESC, c.id DESC LIMIT ${opts.limit ?? 200}`,
    params,
  );
  return rows.map(map);
}

export async function getRecord(db: Db, actor: Actor, id: string) {
  requireRole(actor, ["admin", "worker"]);
  const [row] = await db.query<Row>(`${SELECT} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!row) throw notFound("기록");
  await assertRecipientAccess(db, actor, row.recipient_id);
  const revisions = await db.query<{ id: number; previous: Record<string, unknown>; edited_by_name: string | null; edited_at: Date }>(
    `SELECT rv.id, rv.previous, u.name AS edited_by_name, rv.edited_at FROM record_revisions rv
     LEFT JOIN users u ON u.id = rv.edited_by WHERE rv.record_id = $1 ORDER BY rv.edited_at DESC`,
    [id],
  );
  return {
    ...map(row),
    revisions: revisions.map((r) => ({ id: r.id, previous: r.previous, editedByName: r.edited_by_name, editedAt: r.edited_at.toISOString() })),
  };
}

const recordFields = {
  recordType: z.enum(RECORD_TYPES),
  visitStatus: z.enum(VISIT_STATUSES).nullable().optional(),
  scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  recordedAt: z.iso.datetime({ offset: true }).optional(),
  content: z.string().trim().min(1, "기록 내용을 입력하세요.").max(5000),
  flags: z.array(z.enum(RECORD_FLAGS)).max(RECORD_FLAGS.length).default([]),
  relatedReferralId: z.string().nullable().optional(),
};

export const createRecordSchema = z
  .object({ ...recordFields, sourceType: z.enum(["manual", "voice"]).default("manual") })
  .strict()
  .superRefine((v, ctx) => {
    if (v.recordType !== "visit" && v.visitStatus) ctx.addIssue({ code: "custom", path: ["visitStatus"], message: "방문 기록에만 방문 상태가 있습니다." });
    if (v.recordType === "visit" && !v.visitStatus) ctx.addIssue({ code: "custom", path: ["visitStatus"], message: "방문 상태를 선택하세요." });
    if (v.visitStatus === "scheduled" && !v.scheduledAt) ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "예정 일시를 입력하세요." });
  });

export async function createRecord(db: Db, actor: Actor, recipientId: string, input: z.infer<typeof createRecordSchema>) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, recipientId);
  if (input.relatedReferralId) {
    const [ref] = await db.query(`SELECT 1 FROM service_referrals WHERE id = $1 AND recipient_id = $2`, [input.relatedReferralId, recipientId]);
    if (!ref) throw invalid("연결한 서비스 의뢰가 이 대상자의 것이 아닙니다.");
  }
  return db.transaction(async (tx) => {
    const id = await nextId(tx, "REC");
    await tx.query(
      `INSERT INTO care_records (id, recipient_id, record_type, visit_status, scheduled_at, recorded_at, content, flags, created_by, source_type, related_referral_id)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now()),$7,$8,$9,$10,$11)`,
      [id, recipientId, input.recordType, input.visitStatus ?? null, input.scheduledAt ?? null, input.recordedAt ?? null, input.content, input.flags, actor.id, input.sourceType, input.relatedReferralId ?? null],
    );
    await tx.query(`UPDATE care_recipients SET updated_at = now() WHERE id = $1`, [recipientId]);
    await audit(tx, {
      actorId: actor.id,
      action: "record.created",
      entityType: "record",
      entityId: id,
      recipientId,
      metadata: { recordType: input.recordType, visitStatus: input.visitStatus ?? null, flags: input.flags, sourceType: input.sourceType },
    });
    if (input.flags.includes("emergency_mention")) {
      const [r] = await tx.query<{ assigned_user_id: string | null; display_code: string }>(`SELECT assigned_user_id, display_code FROM care_recipients WHERE id = $1`, [recipientId]);
      await notify(tx, {
        userId: r.assigned_user_id,
        type: "emergency_mention",
        title: "긴급 상황 언급 기록",
        message: `${r.display_code} 기록에 긴급 상황 언급이 표시되었습니다. 기관 공식 절차를 확인하세요.`,
        link: `/care/recipients/${recipientId}?tab=records`,
      });
    }
    return { id };
  });
}

export const updateRecordSchema = z
  .object({
    visitStatus: recordFields.visitStatus,
    scheduledAt: recordFields.scheduledAt,
    recordedAt: recordFields.recordedAt,
    content: recordFields.content.optional(),
    flags: z.array(z.enum(RECORD_FLAGS)).optional(),
  })
  .strict();

/** Authors edit their own records; admins any. Every edit keeps the previous version. */
export async function updateRecord(db: Db, actor: Actor, id: string, input: z.infer<typeof updateRecordSchema>) {
  requireRole(actor, ["admin", "worker"]);
  const [row] = await db.query<Row>(`${SELECT} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!row) throw notFound("기록");
  await assertRecipientAccess(db, actor, row.recipient_id);
  if (actor.role !== "admin" && row.created_by !== actor.id) throw forbidden("다른 담당자가 작성한 기록은 수정할 수 없습니다.");
  if (input.visitStatus && row.record_type !== "visit") throw invalid("방문 기록에만 방문 상태가 있습니다.");
  const cols: Record<string, unknown> = {
    visit_status: input.visitStatus,
    scheduled_at: input.scheduledAt,
    recorded_at: input.recordedAt,
    content: input.content,
    flags: input.flags,
  };
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (!entries.length) throw invalid("변경할 항목이 없습니다.");
  const previous = Object.fromEntries(entries.map(([k]) => [k, (row as unknown as Record<string, unknown>)[k]]));
  const params: unknown[] = [id];
  const sets = entries.map(([k, v]) => {
    params.push(v);
    return `${k} = $${params.length}`;
  });
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO record_revisions (record_id, previous, edited_by) VALUES ($1, $2, $3)`, [id, JSON.stringify(previous), actor.id]);
    await tx.query(`UPDATE care_records SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
    await audit(tx, {
      actorId: actor.id,
      action: "record.updated",
      entityType: "record",
      entityId: id,
      recipientId: row.recipient_id,
      metadata: { fields: entries.map(([k]) => k), visitStatus: input.visitStatus },
    });
  });
  return getRecord(db, actor, id);
}

/** Soft delete, admin only. The row and its revisions stay for audit. */
export async function deleteRecord(db: Db, actor: Actor, id: string, reason: string) {
  requireRole(actor, ["admin"]);
  const [row] = await db.query<{ recipient_id: string }>(`SELECT recipient_id FROM care_records WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!row) throw notFound("기록");
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE care_records SET deleted_at = now() WHERE id = $1`, [id]);
    await audit(tx, { actorId: actor.id, action: "record.deleted", entityType: "record", entityId: id, recipientId: row.recipient_id, metadata: { reasonLength: reason.length } });
  });
}
