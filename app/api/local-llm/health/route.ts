import { configFromEnv, health } from "@/lib/local-llm/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether a local LLM is configured and has the model loaded. Returns no prompt or record content. */
export async function GET() {
  try {
    return Response.json(await health(configFromEnv(process.env)), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ configured: true, ok: false, model: null, reason: "invalid_config" }, { headers: { "cache-control": "no-store" } });
  }
}
