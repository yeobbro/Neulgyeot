/**
 * Server-side client for an OpenAI-compatible LOCAL inference server (Ollama, vLLM, llama.cpp, LM Studio).
 * Imported only by the API route handlers. Prompts and model output are never logged or stored.
 */
import { buildMessages, OutputError, parseModelOutput, PROMPT_VERSION, verifySentences } from "./verify";
import type { DraftFact, LocalDraftKind, LocalDraftResult, LocalLLMHealth } from "./types";

export interface LocalLLMConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  maxTokens: number;
}

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./];
/** http only to this machine or a private-network address literal; anything else must be https. */
export function isLocalNetworkHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || h === "host.docker.internal" || PRIVATE_V4.some((r) => r.test(h));
}

/** null = not configured (the UI then shows the rule-based draft). Throws on an unsafe URL. */
export function configFromEnv(env: Record<string, string | undefined>): LocalLLMConfig | null {
  const model = env.LOCAL_LLM_MODEL?.trim();
  if (!model) return null;
  const url = new URL(env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:11434");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalNetworkHost(url.hostname)))
    throw new Error("LOCAL_LLM_BASE_URL must use https (http only for localhost or a private network address)");
  const num = (v: string | undefined, d: number, min: number, max: number) => Math.min(Math.max(Number(v ?? d) || d, min), max);
  return {
    baseUrl: url.toString().replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1",
    model,
    apiKey: env.LOCAL_LLM_API_KEY || undefined,
    timeoutMs: num(env.LOCAL_LLM_TIMEOUT_MS, 120_000, 1000, 600_000),
    maxTokens: num(env.LOCAL_LLM_MAX_TOKENS, 900, 128, 8192)
  };
}

const headers = (c: LocalLLMConfig) => ({ "content-type": "application/json", ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) });

export async function health(c: LocalLLMConfig | null, fetchImpl: typeof fetch = fetch): Promise<LocalLLMHealth> {
  if (!c) return { configured: false, ok: false, model: null, reason: "not_configured" };
  try {
    const r = await fetchImpl(`${c.baseUrl}/models`, { headers: headers(c), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { configured: true, ok: false, model: c.model, reason: `http_${r.status}` };
    const j = (await r.json()) as { data?: { id?: string }[] };
    const found = (j.data ?? []).some((m) => m.id === c.model || m.id === `${c.model}:latest` || `${m.id}:latest` === c.model);
    return { configured: true, ok: found, model: c.model, reason: found ? null : "model_not_loaded" };
  } catch {
    return { configured: true, ok: false, model: c.model, reason: "unreachable" };
  }
}

const unavailable = (reason: string, message: string): LocalDraftResult => ({ status: "unavailable", reason, message });

/** Calls the local model once (one retry on network error / 503), then parses and re-verifies every sentence. */
export async function generate(
  c: LocalLLMConfig,
  kind: LocalDraftKind,
  facts: DraftFact[],
  fetchImpl: typeof fetch = fetch
): Promise<LocalDraftResult> {
  const started = Date.now();
  const body = JSON.stringify({
    model: c.model,
    messages: buildMessages(kind, facts),
    temperature: 0.2,
    max_tokens: c.maxTokens,
    response_format: { type: "json_object" },
    stream: false
  });
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchImpl(`${c.baseUrl}/chat/completions`, { method: "POST", headers: headers(c), body, signal: AbortSignal.timeout(c.timeoutMs) });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      if (timeout) return unavailable("timeout", "로컬 LLM 응답 시간이 초과되었습니다.");
      if (attempt === 0) continue;
      return unavailable("network", "로컬 LLM 서버에 연결하지 못했습니다.");
    }
    if (res.status === 503 && attempt === 0) continue;
    break;
  }
  if (!res) return unavailable("network", "로컬 LLM 서버에 연결하지 못했습니다.");
  if (res.status === 404) return unavailable("not_found", "설정한 모델을 로컬 LLM 서버에서 찾지 못했습니다.");
  if (res.status === 401 || res.status === 403) return unavailable("unauthorized", "로컬 LLM 서버 인증에 실패했습니다.");
  if (!res.ok) return unavailable(res.status >= 500 ? "server_error" : "client_error", `로컬 LLM 서버 오류 (${res.status})`);
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return unavailable("invalid_response", "로컬 LLM 응답 형식이 맞지 않습니다.");
  try {
    const { kept, rejected } = verifySentences(parseModelOutput(content), facts);
    if (!kept.length) return unavailable("no_result", "검증을 통과한 문장이 없습니다. 규칙 기반 초안을 사용해 주세요.");
    return { status: "ok", model: `local:${c.model}`, promptVersion: PROMPT_VERSION, sentences: kept, rejected, elapsedMs: Date.now() - started };
  } catch (e) {
    if (e instanceof OutputError) return unavailable(e.reason, e.message);
    throw e;
  }
}
