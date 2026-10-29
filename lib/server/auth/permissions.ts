import type { Role } from "../../domain/constants";
import type { Db } from "../db/client";
import { forbidden, notFound } from "../errors";
import type { Actor } from "./session";

export const STAFF_ROLES: Role[] = ["admin", "worker"];

export function requireRole(actor: Actor, roles: Role[]) {
  if (!roles.includes(actor.role)) throw forbidden();
}

export const isStaff = (a: Actor) => STAFF_ROLES.includes(a.role);

/**
 * SQL condition limiting recipients to the actor's region scope.
 * `col` is the region column; params are appended to `params`.
 */
export function regionScopeSql(actor: Actor, col: string, params: unknown[]): string {
  if (actor.role === "admin") return "TRUE";
  if (actor.role === "worker" && actor.scopeRegionIds?.length) {
    params.push(actor.scopeRegionIds);
    return `${col} = ANY($${params.length})`;
  }
  return "FALSE";
}

/**
 * Staff access check for one recipient. Returns 404 (not 403) when out of scope
 * so the existence of other regions' cases is not revealed.
 */
export async function assertRecipientAccess(db: Db, actor: Actor, recipientId: string): Promise<{ id: string; region_id: string }> {
  const [r] = await db.query<{ id: string; region_id: string }>(`SELECT id, region_id FROM care_recipients WHERE id = $1`, [recipientId]);
  if (!r) throw notFound("대상자");
  if (actor.role === "admin") return r;
  if (actor.role === "worker" && actor.scopeRegionIds?.includes(r.region_id)) return r;
  throw notFound("대상자");
}

/** Portal access: the recipient themself, or a family member with granted consent and the permission. */
export async function assertPortalAccess(
  db: Db,
  actor: Actor,
  recipientId: string,
  permission: "view_services" | "view_schedule" | "create_requests",
) {
  if (actor.role === "recipient") {
    if (actor.recipientId === recipientId) return;
    throw notFound("대상자");
  }
  if (actor.role !== "family") throw forbidden("대상자·가족 계정만 이용할 수 있습니다.");
  const [link] = await db.query<{ consent_status: string; permissions: Record<string, boolean> }>(
    `SELECT consent_status, permissions FROM family_links WHERE recipient_id = $1 AND user_id = $2`,
    [recipientId, actor.id],
  );
  if (!link || link.consent_status !== "granted") throw forbidden("동의가 확인된 연결만 정보를 볼 수 있습니다.");
  if (!link.permissions?.[permission]) throw forbidden("이 정보에 대한 열람 권한이 없습니다.");
}

/** Recipients a portal user can act for. */
export async function portalRecipientIds(db: Db, actor: Actor): Promise<string[]> {
  if (actor.role === "recipient") return actor.recipientId ? [actor.recipientId] : [];
  if (actor.role !== "family") return [];
  const rows = await db.query<{ recipient_id: string }>(
    `SELECT recipient_id FROM family_links WHERE user_id = $1 AND consent_status = 'granted' ORDER BY recipient_id`,
    [actor.id],
  );
  return rows.map((r) => r.recipient_id);
}
