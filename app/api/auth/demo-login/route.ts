import { z } from "zod";
import { createSessionToken, demoLoginEnabled, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/auth/session";
import { homeFor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { AppError } from "@/lib/server/errors";
import { errorResponse, json, parseBody, rateLimit } from "@/lib/server/http";

const schema = z.object({ userId: z.string().min(1).max(40) }).strict();

/** Demo-only sign-in: choose a synthetic account. Disabled unless NEULGYEOT_DEMO_LOGIN allows it. */
export async function POST(req: Request) {
  try {
    if (!demoLoginEnabled()) throw new AppError("forbidden", "데모 로그인이 비활성화되어 있습니다.");
    rateLimit(`login:${req.headers.get("x-forwarded-for") ?? "local"}`, 30, 60_000);
    const { userId } = await parseBody(req, schema);
    const db = await getDb();
    const [u] = await db.query<{ id: string; role: string; is_active: boolean; is_demo_data: boolean }>(`SELECT id, role, is_active, is_demo_data FROM users WHERE id = $1`, [userId]);
    if (!u || !u.is_active || !u.is_demo_data) throw new AppError("not_found", "가상 계정을 찾을 수 없습니다.");
    const res = json({ ok: true, redirectTo: homeFor(u.role as never) });
    res.headers.append("set-cookie", serialize(createSessionToken(u.id)));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

function serialize(token: string) {
  const o = sessionCookieOptions;
  return `${SESSION_COOKIE}=${token}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;
}
