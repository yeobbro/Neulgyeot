import { z } from "zod";
import { requireRole } from "@/lib/server/auth/permissions";
import { paginated, parseQuery, route } from "@/lib/server/http";

const q = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = route(async ({ db, actor, req }) => {
  requireRole(actor, ["admin"]);
  const f = parseQuery(req, q);
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (f.entityType) where.push(`l.entity_type = $${params.push(f.entityType)}`);
  if (f.entityId) where.push(`l.entity_id = $${params.push(f.entityId)}`);
  const w = where.join(" AND ");
  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM audit_logs l WHERE ${w}`, params);
  const rows = await db.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.recipient_id, l.metadata, l.created_at, u.name AS actor_name
     FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id WHERE ${w} ORDER BY l.created_at DESC, l.id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    params,
  );
  return paginated(rows, total, f.page, f.pageSize);
});
