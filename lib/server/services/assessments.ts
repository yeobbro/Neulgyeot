import { z } from "zod";
import { REVIEW_STATUSES, type RecordFlag, type RecordType, type ReferralStatus, type ReviewStatus, type ServiceType, type TaskStatus, type VisitStatus } from "../../domain/constants";
import { RULE_VERSION } from "../../domain/rules/config";
import { evaluateRules, type RuleInput, type RuleResult } from "../../domain/rules/engine";
import { interpretRecords, type RecordInterpretation } from "../ai/interpret";
import { audit } from "../audit";
import { assertRecipientAccess, regionScopeSql, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { conflict, notFound } from "../errors";
import { paginated } from "../http";
import { expandRegion } from "./regions";

export type Assessment = {
  id: string;
  recipientId: string;
  displayCode: string;
  method: "rules" | "rules+ai";
  ruleVersion: string;
  modelVersion: string | null;
  score: number;
  priority: "high" | "medium" | "low" | "none";
  signals: RuleResult[];
  aiStatus: "not_configured" | "succeeded" | "failed" | "skipped";
  aiResult: RecordInterpretation | null;
  aiError: string | null;
  sourceRecordIds: string[];
  dataInsufficient: boolean;
  windowStart: string;
  windowEnd: string;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  recipient_id: string;
  display_code: string;
  method: Assessment["method"];
  rule_version: string;
  model_version: string | null;
  score: number;
  priority: Assessment["priority"];
  detected_signals: RuleResult[];
  ai_status: Assessment["aiStatus"];
  ai_result: RecordInterpretation | null;
  ai_error: string | null;
  source_record_ids: string[];
  data_insufficient: boolean;
  window_start: Date;
  window_end: Date;
  review_status: ReviewStatus;
  review_note: string | null;
  reviewed_by_name: string | null;
  reviewed_at: Date | null;
  created_at: Date;
};

const map = (r: Row): Assessment => ({
  id: r.id,
  recipientId: r.recipient_id,
  displayCode: r.display_code,
  method: r.method,
  ruleVersion: r.rule_version,
  modelVersion: r.model_version,
  score: r.score,
  priority: r.priority,
  signals: r.detected_signals,
  aiStatus: r.ai_status,
  aiResult: r.ai_result,
  aiError: r.ai_error,
  sourceRecordIds: r.source_record_ids,
  dataInsufficient: r.data_insufficient,
  windowStart: r.window_start.toISOString(),
  windowEnd: r.window_end.toISOString(),
  reviewStatus: r.review_status,
  reviewNote: r.review_note,
  reviewedByName: r.reviewed_by_name,
  reviewedAt: r.reviewed_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
});

const SELECT = `SELECT a.*, r.display_code, u.name AS reviewed_by_name
  FROM risk_assessments a JOIN care_recipients r ON r.id = a.recipient_id LEFT JOIN users u ON u.id = a.reviewed_by`;

/** Loads the rule engine's input for one recipient. Shared by the API and the seed. */
export async function loadRuleInput(db: Db, recipientId: string, now: Date): Promise<RuleInput> {
  const records = await db.query<{ id: string; record_type: RecordType; visit_status: VisitStatus | null; scheduled_at: Date | null; recorded_at: Date; flags: RecordFlag[] }>(
    `SELECT id, record_type, visit_status, scheduled_at, recorded_at, flags FROM care_records
     WHERE recipient_id = $1 AND deleted_at IS NULL AND recorded_at <= $2`,
    [recipientId, now],
  );
  const referrals = await db.query<{ id: string; service_type: ServiceType; name: string; status: ReferralStatus; status_changed_at: Date }>(
    `SELECT sr.id, sc.service_type, sc.name, sr.status, sr.status_changed_at FROM service_referrals sr
     JOIN service_catalog sc ON sc.id = sr.service_id WHERE sr.recipient_id = $1`,
    [recipientId],
  );
  const tasks = await db.query<{ id: string; title: string; status: TaskStatus; due_at: Date | null }>(
    `SELECT id, title, status, due_at FROM action_tasks WHERE recipient_id = $1`,
    [recipientId],
  );
  return {
    now,
    records: records.map((r) => ({ id: r.id, recordType: r.record_type, visitStatus: r.visit_status, scheduledAt: r.scheduled_at, recordedAt: r.recorded_at, flags: r.flags })),
    referrals: referrals.map((r) => ({ id: r.id, serviceType: r.service_type, serviceName: r.name, status: r.status, statusChangedAt: r.status_changed_at })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.due_at })),
  };
}

/**
 * Runs the rule engine and, if configured and requested, AI record interpretation.
 * The AI never changes the rule score or priority; its output is stored separately.
 */
export async function runAssessment(
  db: Db,
  actor: Actor | null,
  recipientId: string,
  opts: { now?: Date; useAi?: boolean } = {},
): Promise<Assessment> {
  if (actor) {
    requireRole(actor, ["admin", "worker"]);
    await assertRecipientAccess(db, actor, recipientId);
  }
  const now = opts.now ?? new Date();
  const input = await loadRuleInput(db, recipientId, now);
  const outcome = evaluateRules(input);

  let ai: Awaited<ReturnType<typeof interpretRecords>> = { status: "skipped", reason: "AI 해석을 요청하지 않았습니다." };
  if (opts.useAi) {
    const windowStart = new Date(outcome.window.start);
    const recent = await db.query<{ id: string; record_type: string; visit_status: string | null; recorded_at: Date; content: string }>(
      `SELECT id, record_type, visit_status, recorded_at, content FROM care_records
       WHERE recipient_id = $1 AND deleted_at IS NULL AND recorded_at BETWEEN $2 AND $3 ORDER BY recorded_at, id LIMIT 40`,
      [recipientId, windowStart, now],
    );
    ai = await interpretRecords(recent.map((r) => ({ id: r.id, type: r.record_type, visitStatus: r.visit_status, date: r.recorded_at.toISOString().slice(0, 10), content: r.content })));
  }

  const aiSucceeded = ai.status === "succeeded";
  const id = await db.transaction(async (tx) => {
    const id = await nextId(tx, "AS");
    await tx.query(
      `INSERT INTO risk_assessments (id, recipient_id, method, rule_version, model_version, score, priority, detected_signals, ai_status, ai_result, ai_error,
         source_record_ids, data_insufficient, window_start, window_end, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        recipientId,
        aiSucceeded ? "rules+ai" : "rules",
        RULE_VERSION,
        ai.status === "succeeded" ? ai.model : null,
        outcome.score,
        outcome.priority,
        JSON.stringify(outcome.signals),
        ai.status,
        ai.status === "succeeded" ? JSON.stringify(ai.result) : null,
        ai.status === "failed" ? ai.error : null,
        outcome.sourceRecordIds,
        outcome.dataInsufficient,
        outcome.window.start,
        outcome.window.end,
        actor?.id ?? null,
        now,
      ],
    );
    if (outcome.priority === "high" || outcome.priority === "medium") {
      await tx.query(`UPDATE care_recipients SET care_status = 'needs_review', updated_at = now() WHERE id = $1 AND care_status IN ('active','monitoring')`, [recipientId]);
    }
    await audit(tx, {
      actorId: actor?.id ?? null,
      action: "assessment.created",
      entityType: "assessment",
      entityId: id,
      recipientId,
      metadata: { priority: outcome.priority, score: outcome.score, signals: outcome.signals.map((s) => s.ruleId), aiStatus: ai.status },
    });
    return id;
  });
  const [row] = await db.query<Row>(`${SELECT} WHERE a.id = $1`, [id]);
  return map(row);
}

export async function getAssessment(db: Db, actor: Actor, id: string) {
  requireRole(actor, ["admin", "worker"]);
  const [row] = await db.query<Row>(`${SELECT} WHERE a.id = $1`, [id]);
  if (!row) throw notFound("분석 결과");
  await assertRecipientAccess(db, actor, row.recipient_id);
  return map(row);
}

export async function listRecipientAssessments(db: Db, actor: Actor, recipientId: string) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, recipientId);
  return (await db.query<Row>(`${SELECT} WHERE a.recipient_id = $1 ORDER BY a.created_at DESC, a.id DESC`, [recipientId])).map(map);
}

export const assessmentListQuery = z.object({
  reviewStatus: z.enum(REVIEW_STATUSES).optional(),
  priority: z.enum(["high", "medium", "low", "none"]).optional(),
  regionId: z.string().optional(),
  latestOnly: z.enum(["true", "false"]).default("true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listAssessments(db: Db, actor: Actor, q: z.infer<typeof assessmentListQuery>) {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const where = [regionScopeSql(actor, "r.region_id", params)];
  if (q.reviewStatus) {
    params.push(q.reviewStatus);
    where.push(`a.review_status = $${params.length}`);
  }
  if (q.priority) {
    params.push(q.priority);
    where.push(`a.priority = $${params.length}`);
  }
  if (q.regionId) {
    params.push(await expandRegion(db, q.regionId));
    where.push(`r.region_id = ANY($${params.length})`);
  }
  if (q.latestOnly === "true") where.push(`a.created_at = (SELECT max(a2.created_at) FROM risk_assessments a2 WHERE a2.recipient_id = a.recipient_id)`);
  const w = where.join(" AND ");
  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM risk_assessments a JOIN care_recipients r ON r.id = a.recipient_id WHERE ${w}`, params);
  const rows = await db.query<Row>(
    `${SELECT} WHERE ${w} ORDER BY CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, a.score DESC, a.created_at DESC
     LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    params,
  );
  return paginated(rows.map(map), total, q.page, q.pageSize);
}

export const reviewSchema = z
  .object({
    reviewStatus: z.enum(["accepted", "modified", "dismissed"]),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.reviewStatus === "accepted" || (v.reviewNote && v.reviewNote.length > 0), {
    message: "수정 또는 기각할 때는 검토 의견을 입력해야 합니다.",
    path: ["reviewNote"],
  });

export async function reviewAssessment(db: Db, actor: Actor, id: string, input: z.infer<typeof reviewSchema>) {
  const current = await getAssessment(db, actor, id);
  if (current.reviewStatus !== "pending") throw conflict("이미 검토된 분석 결과입니다.");
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE risk_assessments SET review_status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
      [id, input.reviewStatus, input.reviewNote ?? null, actor.id],
    );
    if (input.reviewStatus === "dismissed") {
      await tx.query(`UPDATE care_recipients SET care_status = 'monitoring', updated_at = now() WHERE id = $1 AND care_status = 'needs_review'`, [current.recipientId]);
    }
    await audit(tx, { actorId: actor.id, action: "assessment.reviewed", entityType: "assessment", entityId: id, recipientId: current.recipientId, metadata: { reviewStatus: input.reviewStatus } });
  });
  return getAssessment(db, actor, id);
}
