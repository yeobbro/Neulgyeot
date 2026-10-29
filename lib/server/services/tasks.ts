import { z } from "zod";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type Priority, type TaskStatus, type TaskType } from "../../domain/constants";
import { checkTaskTransition } from "../../domain/transitions";
import { audit } from "../audit";
import { assertRecipientAccess, regionScopeSql, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { invalid, notFound } from "../errors";
import { paginated } from "../http";
import { notify } from "./notifications";
import { expandRegion } from "./regions";

export type Task = {
  id: string;
  recipientId: string;
  displayCode: string;
  assessmentId: string | null;
  recordId: string | null;
  referralId: string | null;
  taskType: TaskType;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  isOverdue: boolean;
  completedAt: string | null;
  resultNote: string | null;
  delayReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  recipient_id: string;
  display_code: string;
  assessment_id: string | null;
  record_id: string | null;
  referral_id: string | null;
  task_type: TaskType;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  due_at: Date | null;
  is_overdue: boolean;
  completed_at: Date | null;
  result_note: string | null;
  delay_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

const map = (r: Row): Task => ({
  id: r.id,
  recipientId: r.recipient_id,
  displayCode: r.display_code,
  assessmentId: r.assessment_id,
  recordId: r.record_id,
  referralId: r.referral_id,
  taskType: r.task_type,
  title: r.title,
  description: r.description,
  priority: r.priority,
  status: r.status,
  assigneeId: r.assignee_id,
  assigneeName: r.assignee_name,
  dueAt: r.due_at?.toISOString() ?? null,
  isOverdue: r.is_overdue,
  completedAt: r.completed_at?.toISOString() ?? null,
  resultNote: r.result_note,
  delayReason: r.delay_reason,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const OVERDUE = `(t.status IN ('open','in_progress','waiting') AND t.due_at IS NOT NULL AND t.due_at < now())`;
const SELECT = `SELECT t.*, r.display_code, u.name AS assignee_name, ${OVERDUE} AS is_overdue
  FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id LEFT JOIN users u ON u.id = t.assignee_id`;

export const taskListQuery = z.object({
  status: z.enum([...TASK_STATUSES, "active"]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().optional(),
  recipientId: z.string().optional(),
  regionId: z.string().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  taskType: z.enum(TASK_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listTasks(db: Db, actor: Actor, q: z.infer<typeof taskListQuery>) {
  requireRole(actor, ["admin", "worker"]);
  const params: unknown[] = [];
  const where = [regionScopeSql(actor, "r.region_id", params)];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.status === "active") where.push(`t.status IN ('open','in_progress','waiting')`);
  else if (q.status) add("t.status = ?", q.status);
  if (q.priority) add("t.priority = ?", q.priority);
  if (q.assigneeId) add("t.assignee_id = ?", q.assigneeId);
  if (q.recipientId) add("t.recipient_id = ?", q.recipientId);
  if (q.taskType) add("t.task_type = ?", q.taskType);
  if (q.regionId) add("r.region_id = ANY(?)", await expandRegion(db, q.regionId));
  if (q.overdue) where.push(q.overdue === "true" ? OVERDUE : `NOT ${OVERDUE}`);
  const w = where.join(" AND ");
  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM action_tasks t JOIN care_recipients r ON r.id = t.recipient_id WHERE ${w}`, params);
  const rows = await db.query<Row>(
    `${SELECT} WHERE ${w}
     ORDER BY CASE WHEN ${OVERDUE} THEN 0 WHEN t.status IN ('open','in_progress','waiting') THEN 1 ELSE 2 END,
       CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_at ASC NULLS LAST, t.id
     LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    params,
  );
  return paginated(rows.map(map), total, q.page, q.pageSize);
}

export async function getTask(db: Db, actor: Actor, id: string) {
  requireRole(actor, ["admin", "worker"]);
  const [row] = await db.query<Row>(`${SELECT} WHERE t.id = $1`, [id]);
  if (!row) throw notFound("조치 업무");
  await assertRecipientAccess(db, actor, row.recipient_id);
  return map(row);
}

export const createTaskSchema = z
  .object({
    recipientId: z.string().min(1),
    assessmentId: z.string().optional(),
    recordId: z.string().optional(),
    referralId: z.string().optional(),
    taskType: z.enum(TASK_TYPES).default("manual"),
    title: z.string().trim().min(1, "제목을 입력하세요.").max(120),
    description: z.string().trim().max(2000).default(""),
    priority: z.enum(PRIORITIES).default("medium"),
    assigneeId: z.string().optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export async function createTask(db: Db, actor: Actor, input: z.infer<typeof createTaskSchema>) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, input.recipientId);
  // Linked entities must belong to the same recipient.
  const checks: [string | undefined, string][] = [
    [input.assessmentId, "risk_assessments"],
    [input.recordId, "care_records"],
    [input.referralId, "service_referrals"],
  ];
  for (const [id, table] of checks) {
    if (!id) continue;
    const [ok] = await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND recipient_id = $2`, [id, input.recipientId]);
    if (!ok) throw invalid("연결한 기록·분석·의뢰가 이 대상자의 것이 아닙니다.");
  }
  if (input.assigneeId) {
    const [u] = await db.query<{ role: string; is_active: boolean }>(`SELECT role, is_active FROM users WHERE id = $1`, [input.assigneeId]);
    if (!u || !u.is_active || !["worker", "admin"].includes(u.role)) throw invalid("담당자를 확인하세요.");
  }
  const assignee = input.assigneeId ?? actor.id;
  const id = await db.transaction(async (tx) => {
    const id = await nextId(tx, "TASK");
    await tx.query(
      `INSERT INTO action_tasks (id, recipient_id, assessment_id, record_id, referral_id, task_type, title, description, priority, assignee_id, due_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, input.recipientId, input.assessmentId ?? null, input.recordId ?? null, input.referralId ?? null, input.taskType, input.title, input.description, input.priority, assignee, input.dueAt ?? null, actor.id],
    );
    await audit(tx, { actorId: actor.id, action: "task.created", entityType: "task", entityId: id, recipientId: input.recipientId, metadata: { taskType: input.taskType, priority: input.priority, assigneeId: assignee } });
    if (assignee !== actor.id) {
      await notify(tx, { userId: assignee, type: "task_assigned", title: "조치 업무 지정", message: input.title, link: `/care/tasks?focus=${id}` });
    }
    return id;
  });
  return getTask(db, actor, id);
}

export const updateTaskSchema = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    assigneeId: z.string().optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    resultNote: z.string().trim().max(2000).optional(),
    delayReason: z.string().trim().max(1000).optional(),
    reopenReason: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function updateTask(db: Db, actor: Actor, id: string, input: z.infer<typeof updateTaskSchema>) {
  const current = await getTask(db, actor, id);
  if (input.status) {
    const check = checkTaskTransition(current.status, input.status, { resultNote: input.resultNote, reopenReason: input.reopenReason });
    if (!check.ok) throw invalid(check.reason);
  }
  if (input.assigneeId) {
    const [u] = await db.query<{ role: string; is_active: boolean }>(`SELECT role, is_active FROM users WHERE id = $1`, [input.assigneeId]);
    if (!u || !u.is_active || !["worker", "admin"].includes(u.role)) throw invalid("담당자를 확인하세요.");
  }
  const statusChanged = Boolean(input.status && input.status !== current.status);
  const fields: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    fields.push(`${col} = $${params.length}`);
  };
  if (input.status) set("status", input.status);
  if (statusChanged && input.status === "completed") fields.push("completed_at = now()");
  if (statusChanged && input.status === "open") fields.push("completed_at = NULL");
  if (input.assigneeId) set("assignee_id", input.assigneeId);
  if (input.priority) set("priority", input.priority);
  if (input.dueAt !== undefined) set("due_at", input.dueAt);
  if (input.resultNote !== undefined) set("result_note", input.resultNote);
  if (input.delayReason !== undefined) set("delay_reason", input.delayReason);
  if (!fields.length) throw invalid("변경할 항목이 없습니다.");
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE action_tasks SET ${fields.join(", ")}, updated_at = now() WHERE id = $1`, params);
    if (statusChanged) {
      await audit(tx, { actorId: actor.id, action: "task.status_changed", entityType: "task", entityId: id, recipientId: current.recipientId, metadata: { from: current.status, to: input.status, reopen: Boolean(input.reopenReason) } });
    }
    const other = Object.keys(input).filter((k) => k !== "status" && k !== "reopenReason");
    if (other.length) await audit(tx, { actorId: actor.id, action: "task.updated", entityType: "task", entityId: id, recipientId: current.recipientId, metadata: { fields: other, assigneeId: input.assigneeId } });
    if (input.assigneeId && input.assigneeId !== current.assigneeId && input.assigneeId !== actor.id) {
      await notify(tx, { userId: input.assigneeId, type: "task_assigned", title: "조치 업무 지정", message: current.title, link: `/care/tasks?focus=${id}` });
    }
    if (statusChanged && current.assigneeId && current.assigneeId !== actor.id) {
      await notify(tx, { userId: current.assigneeId, type: "task_status", title: "조치 상태 변경", message: `${current.title}: ${input.status}`, link: `/care/tasks?focus=${id}` });
    }
    // Completing every open task from a review clears the recipient's review flag.
    if (statusChanged && input.status === "completed") {
      const [left] = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM action_tasks WHERE recipient_id = $1 AND status IN ('open','in_progress','waiting')`, [current.recipientId]);
      if (left.n === 0) await tx.query(`UPDATE care_recipients SET care_status = 'monitoring', updated_at = now() WHERE id = $1 AND care_status = 'needs_review'`, [current.recipientId]);
    }
  });
  return getTask(db, actor, id);
}

export async function taskHistory(db: Db, actor: Actor, id: string) {
  await getTask(db, actor, id);
  const rows = await db.query<{ action: string; metadata: Record<string, unknown>; created_at: Date; who: string | null }>(
    `SELECT l.action, l.metadata, l.created_at, u.name AS who FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.entity_type = 'task' AND l.entity_id = $1 ORDER BY l.created_at, l.id`,
    [id],
  );
  return rows.map((r) => ({ action: r.action, metadata: r.metadata, at: r.created_at.toISOString(), actorName: r.who }));
}
