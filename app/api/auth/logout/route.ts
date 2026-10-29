import { SESSION_COOKIE } from "@/lib/server/auth/session";
import { json } from "@/lib/server/http";

export async function POST() {
  const res = json({ ok: true });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}
