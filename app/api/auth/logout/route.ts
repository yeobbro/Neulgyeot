import { readCookie, revokeSession, SESSION_COOKIE } from "@/lib/server/auth/session";
import { getDb } from "@/lib/server/db/client";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";

/** Revokes the session server-side (jti) and clears the cookie. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await revokeSession(await getDb(), readCookie(req.headers.get("cookie"), SESSION_COOKIE));
    const res = json({ ok: true });
    res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
