import { SERVICE_TYPE_LABEL, type ServiceType } from "./constants";

/** Structured draft produced from a transcript. Same shape for AI and rule-based output. */
export type StructuredDraft = {
  summary: string;
  observations: string[];
  requestedSupport: string[];
  checkItems: string[];
  followUps: string[];
  serviceTypes: ServiceType[];
};

const SERVICE_KEYWORDS: Record<ServiceType, string[]> = {
  meal: ["식사", "도시락", "반찬", "끼니"],
  home_care: ["방문 돌봄", "요양보호", "돌봄 방문", "목욕"],
  mobility: ["이동", "병원 동행", "외출", "차량"],
  daily_living: ["청소", "빨래", "장보기", "가사"],
  housing: ["주거", "난방", "보일러", "수리", "곰팡이"],
  community_program: ["경로당", "프로그램", "모임", "복지관"],
  health_welfare_counsel: ["상담", "보건소", "복지 상담"],
  family_support: ["가족", "보호자", "자녀"],
};

const REQUEST_HINTS = ["원하", "요청", "필요하", "바라", "부탁"];
const CHECK_HINTS = ["확인", "모르", "?", "불분명", "아직"];
const FOLLOW_HINTS = ["다음", "예정", "재방문", "연락드리", "다시"];

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。]|다\.|요\.)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Deterministic keyword-based structuring used when AI is not configured.
 * It only sorts the worker's own sentences into sections; it never adds facts.
 */
export function structureTranscriptByRules(transcript: string): StructuredDraft {
  const parts = sentences(transcript);
  const draft: StructuredDraft = {
    summary: parts.slice(0, 2).join(" "),
    observations: [],
    requestedSupport: [],
    checkItems: [],
    followUps: [],
    serviceTypes: [],
  };
  for (const s of parts) {
    if (REQUEST_HINTS.some((h) => s.includes(h))) draft.requestedSupport.push(s);
    else if (FOLLOW_HINTS.some((h) => s.includes(h))) draft.followUps.push(s);
    else if (CHECK_HINTS.some((h) => s.includes(h))) draft.checkItems.push(s);
    else draft.observations.push(s);
  }
  const types = new Set<ServiceType>();
  for (const [type, words] of Object.entries(SERVICE_KEYWORDS) as [ServiceType, string[]][]) {
    if (words.some((w) => transcript.includes(w))) types.add(type);
  }
  draft.serviceTypes = [...types];
  return draft;
}

/** Renders a reviewed draft into the text saved as the official record. */
export function draftToRecordContent(d: StructuredDraft): string {
  const section = (title: string, items: string[]) => (items.length ? `[${title}]\n${items.map((i) => `- ${i}`).join("\n")}` : "");
  return [
    d.summary ? `[요약]\n${d.summary}` : "",
    section("관찰 내용", d.observations),
    section("요청한 지원", d.requestedSupport),
    section("확인 필요", d.checkItems),
    section("후속 조치 제안", d.followUps),
    d.serviceTypes.length ? `[관련 서비스]\n${d.serviceTypes.map((t) => SERVICE_TYPE_LABEL[t]).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
