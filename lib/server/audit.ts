import type { Db } from "./db/client";

/**
 * Append-only audit trail. `metadata` holds field names and status values,
 * never free-text record content, so logs stay free of sensitive narrative.
 */
export async function audit(
  db: Db,
  entry: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    recipientId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, recipient_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.actorId, entry.action, entry.entityType, entry.entityId, entry.recipientId ?? null, JSON.stringify(entry.metadata ?? {})],
  );
}
