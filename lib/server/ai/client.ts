import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type AiRequest<S extends z.ZodType> = {
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
};
export type AiResponse<T> = { output: T; model: string };
export type AiGenerate = <S extends z.ZodType>(req: AiRequest<S>) => Promise<AiResponse<z.infer<S>>>;

export class AiError extends Error {
  constructor(
    public kind: "refusal" | "invalid_output" | "timeout" | "api_error",
    message: string,
  ) {
    super(message);
  }
}

let override: AiGenerate | null | undefined;
/** Tests replace the generator; `null` simulates "no API key". */
export function setAiGeneratorForTesting(fn: AiGenerate | null | undefined) {
  override = fn;
}

export function aiConfigured(): boolean {
  if (override !== undefined) return override !== null;
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.NEULGYEOT_AI_ENABLED !== "false";
}

export function aiModel(): string {
  return process.env.NEULGYEOT_AI_MODEL || DEFAULT_MODEL;
}

/** Returns a server-side generator, or null when AI is not configured. */
export function getAiGenerator(): AiGenerate | null {
  if (override !== undefined) return override;
  if (!aiConfigured()) return null;
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const model = aiModel();
  return async ({ system, user, schema, maxTokens = 8000 }) => {
    try {
      const res = await client.beta.messages.parse({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        // Server-side refusal fallback: a declined request is retried on a suitable model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (res.stop_reason === "refusal") throw new AiError("refusal", "AI가 이 요청에 응답하지 않았습니다.");
      if (res.stop_reason === "max_tokens") throw new AiError("invalid_output", "AI 응답이 길이 제한으로 잘렸습니다.");
      if (res.parsed_output == null) throw new AiError("invalid_output", "AI 응답이 요구한 형식과 맞지 않습니다.");
      return { output: res.parsed_output as z.infer<typeof schema>, model: res.model };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("timeout", "AI 응답 시간이 초과되었습니다.");
      if (err instanceof Anthropic.RateLimitError) throw new AiError("api_error", "AI 사용량 한도에 도달했습니다.");
      if (err instanceof Anthropic.AuthenticationError) throw new AiError("api_error", "AI API 인증에 실패했습니다. 키 설정을 확인하세요.");
      if (err instanceof Anthropic.APIError) throw new AiError("api_error", `AI API 오류 (${err.status ?? "연결"})`);
      throw new AiError("api_error", "AI 호출 중 오류가 발생했습니다.");
    }
  };
}
