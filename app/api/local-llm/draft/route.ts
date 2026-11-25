import { PATIENTS } from "@/lib/demo/hospital-data";
import { parseDraftRequest, rateLimited } from "@/lib/local-llm/request";
import { configFromEnv, generate } from "@/lib/local-llm/server";
import type { LocalDraftResult } from "@/lib/local-llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNTHETIC_IDS = new Set(PATIENTS.map((p) => p.id));
const reply = (body: LocalDraftResult, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Proposes a draft from the given facts using the hospital's LOCAL LLM. The result is a draft for staff review:
 * nothing is saved or sent from here. Same-origin requests only; synthetic demo patients only.
 */
export async function POST(req: Request) {
  if (req.headers.get("x-neulgyeot-local-llm") !== "1") return reply({ status: "unavailable", reason: "forbidden", message: "요청 검증에 실패했습니다." }, 403);
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let same = false;
    try {
      same = new URL(origin).host === host;
    } catch {
      same = false;
    }
    if (!same) return reply({ status: "unavailable", reason: "forbidden", message: "허용되지 않은 출처의 요청입니다." }, 403);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(`draft:${ip}`)) return reply({ status: "unavailable", reason: "rate_limited", message: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429);

  let config;
  try {
    config = configFromEnv(process.env);
  } catch {
    return reply({ status: "unavailable", reason: "invalid_config", message: "로컬 LLM 주소 설정이 안전하지 않습니다 (https 또는 내부망 http만 허용)." });
  }
  if (!config) return reply({ status: "unavailable", reason: "not_configured", message: "로컬 LLM이 연결되어 있지 않습니다." });

  const parsed = parseDraftRequest(await req.json().catch(() => null), SYNTHETIC_IDS);
  if (!parsed.ok) {
    const message = parsed.reason === "real_data_blocked" ? "이 단계에서는 합성(DEMO) 환자 기록만 로컬 LLM에 보낼 수 있습니다." : "요청 형식이 올바르지 않습니다.";
    return reply({ status: "unavailable", reason: parsed.reason, message }, 400);
  }
  return reply(await generate(config, parsed.value.kind, parsed.value.facts));
}
