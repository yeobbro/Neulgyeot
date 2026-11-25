/**
 * Local LLM drafts for Neulgyeot Hospital (늘곁 요양병원용).
 *
 * The model runs inside the hospital (Ollama on a workstation, or an on-premise vLLM server). It only PROPOSES
 * sentences from a numbered list of facts taken from the record; every sentence is re-verified here and a staff
 * member reviews, edits and saves the text. Nothing is applied automatically.
 */

export type LocalDraftKind = "discharge_note" | "family_message" | "handover";

export const LOCAL_DRAFT_LABEL: Record<LocalDraftKind, string> = {
  discharge_note: "퇴원·연계 사회복지사 소견 초안",
  family_message: "보호자 리포트 돌봄팀 메시지 초안",
  handover: "교대 인수인계 요약 초안"
};

/** One fact the model may use. `id` is what the model cites (F1, F2 …); `source` is the record it came from. */
export interface DraftFact {
  id: string;
  text: string;
  source: string;
}

export interface DraftSentence {
  text: string;
  factIds: string[];
}

export interface RejectedSentence {
  text: string;
  problems: string[];
}

export type LocalDraftResult =
  | {
      status: "ok";
      model: string;
      promptVersion: string;
      sentences: DraftSentence[];
      rejected: RejectedSentence[];
      elapsedMs: number;
    }
  | { status: "unavailable"; reason: string; message: string };

export interface LocalLLMHealth {
  configured: boolean;
  ok: boolean;
  model: string | null;
  reason: string | null;
}

export const MAX_FACTS = 40;
export const MAX_FACT_CHARS = 300;
