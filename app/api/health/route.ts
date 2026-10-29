import { aiConfigured } from "@/lib/server/ai/client";
import { getDb } from "@/lib/server/db/client";
import { json } from "@/lib/server/http";

/** Liveness only; exposes no data or configuration values. */
export async function GET() {
  let db = "ok";
  try {
    await (await getDb()).query("SELECT 1");
  } catch {
    db = "error";
  }
  return json({ status: db === "ok" ? "ok" : "degraded", db, ai: aiConfigured() ? "configured" : "not_configured" }, db === "ok" ? 200 : 503);
}
