import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { notFound } from "../errors";

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  channel: "in_app";
  readAt: string | null;
  createdAt: string;
};

/**
 * In-app notification only. No email/SMS/push channel exists, so nothing is
 * reported as "sent" externally. `dedupeKey` prevents repeated reminders.
 */
export async function notify(
  db: Db,
  n: { userId: string | null; type: string; title: string; message: string; link?: string; dedupeKey?: string },
) {
  if (!n.userId) return;
  const [pref] = await db.query<{ in_app: boolean }>(`SELECT in_app FROM notification_preferences WHERE user_id = $1`, [n.userId]);
  if (pref && !pref.in_app) return;
  if (n.dedupeKey) {
    const [exists] = await db.query(`SELECT 1 FROM notifications WHERE dedupe_key = $1`, [n.dedupeKey]);
    if (exists) return;
  }
  const id = await nextId(db, "NTF");
  await db.query(
    `INSERT INTO notifications (id, user_id, type, title, message, link, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [id, n.userId, n.type, n.title, n.message, n.link ?? null, n.dedupeKey ?? null],
  );
}

export async function listNotifications(db: Db, actor: Actor, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const rows = await db.query<{
    id: string;
    type: string;
    title: string;
    message: string;
    link: string | null;
    channel: "in_app";
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT * FROM notifications WHERE user_id = $1 ${opts.unreadOnly ? "AND read_at IS NULL" : ""}
     ORDER BY created_at DESC, id DESC LIMIT $2`,
    [actor.id, opts.limit ?? 50],
  );
  const [{ unread }] = await db.query<{ unread: number }>(
    `SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [actor.id],
  );
  return {
    unread,
    data: rows.map(
      (r): Notification => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        link: r.link,
        channel: r.channel,
        readAt: r.read_at?.toISOString() ?? null,
        createdAt: r.created_at.toISOString(),
      }),
    ),
  };
}

export async function markNotificationsRead(db: Db, actor: Actor, ids: string[] | "all") {
  if (ids === "all") {
    await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [actor.id]);
    return;
  }
  const rows = await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2) RETURNING id`, [actor.id, ids]);
  if (rows.length === 0 && ids.length > 0) throw notFound("알림");
}

/**
 * Generates due-soon / overdue reminders for open tasks. Idempotent per task
 * and day, so it can run on every dashboard load.
 */
export async function syncTaskDueNotifications(db: Db, now = new Date()) {
  const soon = new Date(now.getTime() + 2 * 86_400_000);
  const day = now.toISOString().slice(0, 10);
  const rows = await db.query<{ id: string; title: string; assignee_id: string | null; due_at: Date; recipient_id: string }>(
    `SELECT id, title, assignee_id, due_at, recipient_id FROM action_tasks
     WHERE status IN ('open','in_progress','waiting') AND due_at IS NOT NULL AND due_at < $1 AND assignee_id IS NOT NULL`,
    [soon],
  );
  for (const t of rows) {
    const overdue = t.due_at < now;
    await notify(db, {
      userId: t.assignee_id,
      type: overdue ? "task_overdue" : "task_due_soon",
      title: overdue ? "기한이 지난 조치" : "기한 임박 조치",
      message: `${t.title} (기한 ${t.due_at.toISOString().slice(0, 10)})`,
      link: `/care/tasks?focus=${t.id}`,
      dedupeKey: overdue ? `task_overdue:${t.id}:${day}` : `task_due_soon:${t.id}`,
    });
  }
}

export async function getPreferences(db: Db, actor: Actor) {
  const [p] = await db.query<{ in_app: boolean; schedule_reminders: boolean; request_updates: boolean }>(
    `SELECT in_app, schedule_reminders, request_updates FROM notification_preferences WHERE user_id = $1`,
    [actor.id],
  );
  return { inApp: p?.in_app ?? true, scheduleReminders: p?.schedule_reminders ?? true, requestUpdates: p?.request_updates ?? true };
}

export async function setPreferences(db: Db, actor: Actor, p: { inApp: boolean; scheduleReminders: boolean; requestUpdates: boolean }) {
  await db.query(
    `INSERT INTO notification_preferences (user_id, in_app, schedule_reminders, request_updates, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (user_id) DO UPDATE SET in_app = EXCLUDED.in_app, schedule_reminders = EXCLUDED.schedule_reminders,
       request_updates = EXCLUDED.request_updates, updated_at = now()`,
    [actor.id, p.inApp, p.scheduleReminders, p.requestUpdates],
  );
  return getPreferences(db, actor);
}
