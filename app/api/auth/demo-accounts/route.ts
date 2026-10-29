import { ROLE_LABEL, type Role } from "@/lib/domain/constants";
import { demoLoginEnabled } from "@/lib/server/auth/session";
import { getDb } from "@/lib/server/db/client";
import { errorResponse, json } from "@/lib/server/http";

/** Lists synthetic demo accounts only (is_demo_data). */
export async function GET() {
  try {
    if (!demoLoginEnabled()) return json({ enabled: false, data: [] });
    const db = await getDb();
    const rows = await db.query<{ id: string; name: string; role: Role }>(`SELECT id, name, role FROM users WHERE is_demo_data AND is_active ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'worker' THEN 1 WHEN 'provider' THEN 2 ELSE 3 END, id`);
    return json({ enabled: true, data: rows.map((r) => ({ ...r, roleLabel: ROLE_LABEL[r.role] })) });
  } catch (err) {
    return errorResponse(err);
  }
}
