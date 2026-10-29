import {
  RECORD_TYPE_LABEL,
  REFERRAL_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  TASK_STATUS_LABEL,
  VISIT_STATUS_LABEL,
  type RecordType,
  type ReferralStatus,
  type ReviewStatus,
  type TaskStatus,
  type VisitStatus,
} from "../../domain/constants";
import { assertRecipientAccess, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";

export type TimelineEvent = {
  at: string;
  kind: "record" | "assessment" | "review" | "referral" | "referral_status" | "task" | "task_status" | "request" | "staff";
  title: string;
  detail: string | null;
  actorName: string | null;
  link: string | null;
  /** True when the event is an AI/rule inference rather than an official record. */
  isInference: boolean;
};

/** Every case event for one recipient, newest first. */
export async function recipientTimeline(db: Db, actor: Actor, recipientId: string): Promise<TimelineEvent[]> {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, recipientId);
  const events: TimelineEvent[] = [];
  const base = `/care/recipients/${recipientId}`;

  const records = await db.query<{ id: string; record_type: RecordType; visit_status: VisitStatus | null; scheduled_at: Date | null; recorded_at: Date; source_type: string; name: string | null }>(
    `SELECT c.id, c.record_type, c.visit_status, c.scheduled_at, c.recorded_at, c.source_type, u.name
     FROM care_records c LEFT JOIN users u ON u.id = c.created_by WHERE c.recipient_id = $1 AND c.deleted_at IS NULL`,
    [recipientId],
  );
  for (const r of records) {
    const visit = r.record_type === "visit" && r.visit_status;
    events.push({
      at: (r.visit_status === "scheduled" && r.scheduled_at ? r.scheduled_at : r.recorded_at).toISOString(),
      kind: "record",
      title: visit
        ? r.visit_status === "scheduled"
          ? "방문 일정 등록"
          : `방문 ${VISIT_STATUS_LABEL[r.visit_status!]}`
        : `${RECORD_TYPE_LABEL[r.record_type]} 기록 작성`,
      detail: `${r.id}${r.source_type === "voice" ? " · 음성 기록 초안에서 저장" : ""}`,
      actorName: r.name,
      link: `${base}?tab=records#${r.id}`,
      isInference: false,
    });
  }

  const assessments = await db.query<{ id: string; created_at: Date; priority: string; method: string; review_status: ReviewStatus; reviewed_at: Date | null; reviewer: string | null }>(
    `SELECT a.id, a.created_at, a.priority, a.method, a.review_status, a.reviewed_at, u.name AS reviewer
     FROM risk_assessments a LEFT JOIN users u ON u.id = a.reviewed_by WHERE a.recipient_id = $1`,
    [recipientId],
  );
  for (const a of assessments) {
    events.push({
      at: a.created_at.toISOString(),
      kind: "assessment",
      title: a.method === "rules+ai" ? "규칙·AI 분석 실행" : "규칙 기반 분석 실행",
      detail: a.id,
      actorName: null,
      link: `/care/assessments/${a.id}`,
      isInference: true,
    });
    if (a.reviewed_at) {
      events.push({
        at: a.reviewed_at.toISOString(),
        kind: "review",
        title: `담당자 검토: ${REVIEW_STATUS_LABEL[a.review_status]}`,
        detail: a.id,
        actorName: a.reviewer,
        link: `/care/assessments/${a.id}`,
        isInference: false,
      });
    }
  }

  const referrals = await db.query<{ id: string; referred_at: Date; name: string; who: string | null }>(
    `SELECT sr.id, sr.referred_at, sc.name, u.name AS who FROM service_referrals sr
     JOIN service_catalog sc ON sc.id = sr.service_id LEFT JOIN users u ON u.id = sr.referred_by WHERE sr.recipient_id = $1`,
    [recipientId],
  );
  for (const r of referrals) {
    events.push({ at: r.referred_at.toISOString(), kind: "referral", title: `서비스 의뢰: ${r.name}`, detail: r.id, actorName: r.who, link: `${base}?tab=services`, isInference: false });
  }

  const tasks = await db.query<{ id: string; title: string; created_at: Date; completed_at: Date | null; who: string | null }>(
    `SELECT t.id, t.title, t.created_at, t.completed_at, u.name AS who FROM action_tasks t LEFT JOIN users u ON u.id = t.created_by WHERE t.recipient_id = $1`,
    [recipientId],
  );
  for (const t of tasks) {
    events.push({ at: t.created_at.toISOString(), kind: "task", title: `조치 등록: ${t.title}`, detail: t.id, actorName: t.who, link: `/care/tasks?focus=${t.id}`, isInference: false });
  }

  // Status changes come from the audit log, which records every transition.
  const logs = await db.query<{ action: string; entity_id: string; metadata: Record<string, unknown>; created_at: Date; who: string | null }>(
    `SELECT l.action, l.entity_id, l.metadata, l.created_at, u.name AS who FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.recipient_id = $1 AND l.action IN ('referral.status_changed','task.status_changed','support_request.status_changed','recipient.updated')`,
    [recipientId],
  );
  for (const l of logs) {
    const to = l.metadata.to as string | undefined;
    if (l.action === "referral.status_changed" && to) {
      events.push({ at: l.created_at.toISOString(), kind: "referral_status", title: `서비스 ${REFERRAL_STATUS_LABEL[to as ReferralStatus]}`, detail: l.entity_id, actorName: l.who, link: `${base}?tab=services`, isInference: false });
    } else if (l.action === "task.status_changed" && to) {
      events.push({ at: l.created_at.toISOString(), kind: "task_status", title: `조치 ${TASK_STATUS_LABEL[to as TaskStatus]}`, detail: l.entity_id, actorName: l.who, link: `/care/tasks?focus=${l.entity_id}`, isInference: false });
    } else if (l.action === "support_request.status_changed" && to) {
      events.push({ at: l.created_at.toISOString(), kind: "request", title: "가족 문의 처리 상태 변경", detail: l.entity_id, actorName: l.who, link: `/care/requests`, isInference: false });
    } else if (l.action === "recipient.updated" && Array.isArray(l.metadata.fields) && (l.metadata.fields as string[]).includes("assigned_user_id")) {
      events.push({ at: l.created_at.toISOString(), kind: "staff", title: "담당자 변경", detail: null, actorName: l.who, link: null, isInference: false });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}
