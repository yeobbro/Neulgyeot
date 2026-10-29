import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../../domain/constants";
import type { Db } from "../db/client";

export const SESSION_COOKIE = "ng_session";
const MAX_AGE_SECONDS = 8 * 3600;

export type Actor = {
  id: string;
  name: string;
  role: Role;
  regionId: string | null;
  providerId: string | null;
  recipientId: string | null;
  /** Region IDs the actor may see. `null` means every region (admin). */
  scopeRegionIds: string[] | null;
};

let warned = false;
function secret(): string {
  const s = process.env.NEULGYEOT_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.NEULGYEOT_ALLOW_DEV_SECRET !== "true") {
    throw new Error("NEULGYEOT_SESSION_SECRET (32+ chars) is required in production.");
  }
  if (!warned) {
    warned = true;
    console.warn("[neulgyeot] NEULGYEOT_SESSION_SECRET is not set; using an insecure development secret.");
  }
  return "neulgyeot-development-only-insecure-session-secret";
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ uid: userId, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: string; exp?: number };
    if (!data.uid || !data.exp || data.exp * 1000 < now) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Loads the actor fresh from the DB so deactivation or role changes apply immediately. */
export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  const [u] = await db.query<{
    id: string;
    name: string;
    role: Role;
    region_id: string | null;
    provider_id: string | null;
    recipient_id: string | null;
    is_active: boolean;
  }>(`SELECT id, name, role, region_id, provider_id, recipient_id, is_active FROM users WHERE id = $1`, [userId]);
  if (!u || !u.is_active) return null;
  let scope: string[] | null = [];
  if (u.role === "admin") scope = null;
  else if (u.role === "worker" && u.region_id) {
    const rows = await db.query<{ id: string }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM regions WHERE id = $1
         UNION ALL SELECT r.id FROM regions r JOIN tree t ON r.parent_id = t.id
       ) SELECT id FROM tree`,
      [u.region_id],
    );
    scope = rows.map((r) => r.id);
  }
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    regionId: u.region_id,
    providerId: u.provider_id,
    recipientId: u.recipient_id,
    scopeRegionIds: scope,
  };
}

export function demoLoginEnabled(): boolean {
  if (process.env.NEULGYEOT_DEMO_LOGIN === "true") return true;
  if (process.env.NEULGYEOT_DEMO_LOGIN === "false") return false;
  return process.env.NODE_ENV !== "production";
}
