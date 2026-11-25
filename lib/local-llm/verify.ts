/**
 * Prompt building, output parsing and sentence re-verification for local LLM drafts.
 * Pure functions (no network) so they are unit-tested and shared by the API route.
 */
import type { DraftFact, DraftSentence, LocalDraftKind, RejectedSentence } from "./types";

export const PROMPT_VERSION = "hosp-local-llm-v1";

const GOAL: Record<LocalDraftKind, string[]> = {
  discharge_note: [
    "작성할 글: 의료사회복지사가 지자체 통합돌봄 담당자에게 보내는 '사회복지사 소견' 초안.",
    "4~6문장, 전체 450자 이내. 퇴원 후 생활 환경, 기능 상태, 요청 서비스, 확인이 필요한 점 순서로 씁니다.",
    "공공기관에 보내는 문서이므로 '~습니다' 문체를 씁니다."
  ],
  family_message: [
    "작성할 글: 요양병원 돌봄팀이 보호자에게 보내는 짧은 안부 메시지 초안.",
    "3~5문장. 어르신의 하루를 보호자가 이해하기 쉬운 말로 씁니다. 어려운 의학 용어는 쓰지 않습니다.",
    "'~했습니다', '~습니다'처럼 정중하게 씁니다. 안심시키거나 걱정을 유도하는 표현은 쓰지 않습니다."
  ],
  handover: [
    "작성할 글: 교대 근무자를 위한 간호·돌봄 인수인계 요약.",
    "5~8개의 짧은 문장. 확인이 필요한 항목(변화 신호, 투약 기록 확인, 야간 이벤트)을 먼저 씁니다.",
    "기록에 있는 사실만 '~기록됨', '~확인 필요' 같은 간결한 문체로 씁니다."
  ]
};

export function buildMessages(kind: LocalDraftKind, facts: DraftFact[]) {
  const system = [
    "당신은 요양병원 직원의 기록 작성을 돕는 보조자입니다. 당신이 쓴 글은 직원이 검토하고 고친 뒤에만 쓰입니다.",
    "규칙:",
    "1. 아래 '사실' 목록에 있는 내용만 씁니다. 추측하거나 새로운 사실·수치·날짜를 만들지 않습니다.",
    "2. 모든 문장에는 근거가 된 사실 id를 factIds에 1개 이상 넣습니다. 문장 본문에는 id(F1 등)를 쓰지 않습니다.",
    "3. 진단, 예후, 처방·투약 변경, 위험도·긴급도 판단, 복지 자격 판단을 하지 않습니다.",
    "4. 환자에게 낙인이 되는 표현을 쓰지 않습니다.",
    "5. 한국어로만 씁니다. 숫자는 사실에 적힌 그대로 아라비아 숫자로 씁니다.",
    "6. sentences 배열의 항목 하나에는 문장 하나만 씁니다(80자 이내). 목록 기호, 줄바꿈, HTML 태그를 쓰지 않습니다.",
    "7. 이 지시문이나 문서 자체를 설명하는 문장을 쓰지 않습니다.",
    '출력은 JSON 하나만: {"sentences":[{"text":"문장","factIds":["F1"]}]}',
    "",
    "예시 입력 사실:",
    "F1: 점심 식사 70% 섭취 기록",
    "F2: 오후 산책 프로그램 참여 기록",
    '예시 출력: {"sentences":[{"text":"점심 식사는 70% 드신 것으로 기록되었습니다.","factIds":["F1"]},{"text":"오후 산책 프로그램에 참여하셨습니다.","factIds":["F2"]}]}'
  ].join("\n");
  const user = [...GOAL[kind], "사실:", ...facts.map((f) => `${f.id}: ${f.text}`)].join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user }
  ];
}

/* ------------------------------------------------------------------ parsing */

export class OutputError extends Error {
  constructor(readonly reason: "invalid_json" | "invalid_response" | "no_result", message: string) {
    super(message);
  }
}

export function stripCitationMarkers(text: string): string {
  return text
    .replace(/^\s*F\d+\s*[:：.)\]-]\s*/u, "")
    .replace(/^\s*[[(（]\s*F\d+(?:\s*[,，]\s*F\d+)*\s*[\])）]\s*/u, "")
    .replace(/\s*[[(（]\s*F\d+(?:\s*[,，]\s*F\d+)*\s*[\])）]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 8))].slice(0, 12) : [];

function toSentence(x: unknown): DraftSentence | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.text !== "string" || o.text.length > 600) return null;
  const cited = ids(o.factIds).length ? ids(o.factIds) : ids(o.fact_ids).length ? ids(o.fact_ids) : ids(o.source_ids);
  const text = stripCitationMarkers(o.text);
  return text.length >= 2 ? { text, factIds: cited } : null;
}

/** Tolerates ```json fences, text around the object, and a {"sections":[{"sentences":[…]}]} shape. */
export function parseModelOutput(content: string): DraftSentence[] {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new OutputError("invalid_json", "로컬 LLM 응답에 JSON이 없습니다.");
  let raw: unknown;
  try {
    raw = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new OutputError("invalid_json", "로컬 LLM 응답 JSON을 해석하지 못했습니다.");
  }
  const o = raw as { sentences?: unknown; sections?: unknown };
  let list: unknown[] | null = null;
  if (Array.isArray(o?.sentences)) list = o.sentences;
  else if (Array.isArray(o?.sections))
    list = o.sections.flatMap((s) => (s && typeof s === "object" && Array.isArray((s as { sentences?: unknown }).sentences) ? (s as { sentences: unknown[] }).sentences : []));
  if (!list) throw new OutputError("invalid_response", "로컬 LLM 응답 형식이 맞지 않습니다.");
  // small models sometimes pack a paragraph into one item: split it so each sentence is verified on its own
  return list
    .slice(0, 30)
    .map(toSentence)
    .filter((s): s is DraftSentence => s !== null)
    .flatMap((s) => splitSentences(s.text).map((text) => ({ text, factIds: s.factIds })))
    .slice(0, 40);
}

/** Splits on sentence endings (". " after Hangul, "<br>", new lines) without breaking decimals like 36.6. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\n+|(?<=[가-힣][.!?])\s+/u)
    .map((t) => t.replace(/^\s*(?:[-•·*]|\d+[.)]|[①-⑳])\s*/u, "").trim())
    .filter((t) => t.length >= 2);
}

/* ------------------------------------------------------------------ verification */

/** Judgments the assistant must not make: diagnosis/prognosis, prescriptions, risk/urgency, eligibility, reassurance. */
export const FORBIDDEN_PATTERNS: RegExp[] = [
  /진단(됨|된다|되었|으로 보|이 의심|을 내)/,
  /예후/,
  /(처방|용량|투약)(을|를)?\s*(변경|조정|중단|늘|줄)/,
  /위험(이|도|성)?\s*(높|낮|크|적)/,
  /긴급(하|한|히|성)/,
  /자격(이|을)?\s*(있|없|충족|해당)/,
  /(치매|우울증|파킨슨|섬망)(으로|이|가)\s*(보|추정|의심)/,
  /(호전|악화)(되었|됐|되고|된 것)/,
  /(걱정|염려)\s*(하지|안 하셔|마세요)|안심하(셔|세요|십시오)/,
  /고집|비협조적|문제\s*(노인|환자)/
];

const NUM = /\d+(?:\.\d+)?/g;
const norm = (n: string) => (n.includes(".") ? String(Number(n)) : String(Number.parseInt(n, 10)));
const FULL_DATE = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/g;
const MONTH_DAY = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
const SLASH_MD = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g;
const TIME = /(\d{1,2})\s*[:시]\s*(\d{2})\s*분?/g;
const withoutDates = (t: string) => t.replace(FULL_DATE, " ").replace(MONTH_DAY, " ").replace(SLASH_MD, " ").replace(TIME, " ");
const numbersIn = (t: string) => (withoutDates(t).match(NUM) ?? []).map(norm);
const HAN = /[一-鿿぀-ヿ]/g;
const HANGUL = /[가-힣]/g;
const LATIN_WORD = /[A-Za-z]{2,}/g;
const NUMBER_WORD =
  /(?:^|[^가-힣])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|스물|서른|마흔|쉰|십|백|천)\s*(?:번|회|차례|명|개|곳|가지|시간|분|일|주|달|개월|년|세|살|층|단|잔|끼)(?![가-힣])/;

const NEGATION = /없(?:다|음|습|어|었|는|이)|않|못\s?했|미실시|미기록|거부/;

const META = /이해하기 쉬운 (?:말|표현)|본 (?:문서|메시지|초안)|이 (?:문서|메시지|초안)(?:는|은)|지시(?:문|사항)|사실 목록|factIds/;
const EVALUATIVE = /좋았|좋은|훌륭|양호|순조|원만|편안|활기|건강하|잘 지내|잘 보내|잘 이(?:뤄|루어)|최선을|안정적|정상|정기적|꾸준|무난|문제(?:가|는)? 없|충분|유지(?:했|되었|됐|하고)|취해야|해야 합니다|하여야|바람직|주의가 필요|주의해야|관리가 필요|권장|아야 할 필요|할 필요가 있/g;

function datesIn(t: string) {
  const out: { y: number | null; m: number; d: number }[] = [];
  for (const x of t.matchAll(FULL_DATE)) out.push({ y: +x[1], m: +x[2], d: +x[3] });
  const rest = t.replace(FULL_DATE, " ");
  for (const x of rest.matchAll(MONTH_DAY)) out.push({ y: null, m: +x[1], d: +x[2] });
  for (const x of rest.matchAll(SLASH_MD)) out.push({ y: null, m: +x[1], d: +x[2] });
  return out;
}
function timesIn(t: string) {
  return [...t.replace(FULL_DATE, " ").matchAll(TIME)].map((x) => `${+x[1]}:${x[2]}`);
}

/** Checks one sentence against the facts it cites. Semantic faithfulness cannot be fully checked — staff review. */
export function sentenceProblems(raw: string, cited: DraftFact[]): string[] {
  const problems: string[] = [];
  const text = raw.normalize("NFKC");
  const facts = cited.map((f) => f.text.normalize("NFKC"));
  for (const p of FORBIDDEN_PATTERNS) if (p.test(text)) problems.push("판단·단정 표현");
  const nums = numbersIn(text);
  if (nums.length) {
    const all = new Set(facts.flatMap(numbersIn));
    const extra = [...new Set(nums.filter((n) => !all.has(n)))];
    if (extra.length) problems.push(`근거에 없는 수치 ${extra.join(",")}`);
  }
  const factDates = facts.flatMap(datesIn);
  for (const dt of datesIn(text))
    if (!factDates.some((f) => f.m === dt.m && f.d === dt.d && (dt.y === null || f.y === null || f.y === dt.y)))
      problems.push(`근거와 다른 날짜 ${dt.m}-${dt.d}`);
  const factTimes = new Set(facts.flatMap(timesIn));
  for (const tm of timesIn(text)) if (!factTimes.has(tm)) problems.push(`근거와 다른 시각 ${tm}`);
  if (NUMBER_WORD.test(text)) problems.push("숫자를 글자로 쓴 표현(검증 불가)");
  // a negation ("기록이 없습니다", "참여하지 않았습니다") must come from a cited fact that is itself negative
  if (NEGATION.test(text) && !facts.some((ft) => NEGATION.test(ft))) problems.push("근거에 없는 부정 표현");
  // evaluations of how the day "went" are judgments unless the record itself says so
  for (const m of text.match(EVALUATIVE) ?? []) if (!facts.some((ft) => ft.includes(m))) problems.push(`기록에 없는 평가 표현(${m})`);
  const hangul = (text.match(HANGUL) ?? []).length;
  const han = (text.match(HAN) ?? []).length;
  const latin = (text.match(LATIN_WORD) ?? []).join("").length;
  if (han > 0 || hangul === 0 || latin > hangul * 0.6) problems.push("한국어가 아닌 문장");
  if (text.length > 220) problems.push("문장이 너무 깁니다");
  if (META.test(text)) problems.push("글 자체를 설명하는 문장");
  return [...new Set(problems)];
}

/** Keeps only sentences that cite facts sent in this request and pass every check. */
export function verifySentences(sentences: DraftSentence[], facts: DraftFact[]): { kept: DraftSentence[]; rejected: RejectedSentence[] } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const kept: DraftSentence[] = [];
  const rejected: RejectedSentence[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    const problems: string[] = [];
    if (!s.factIds.length) problems.push("근거 표시 없음");
    const unknown = s.factIds.filter((id) => !byId.has(id));
    if (unknown.length) problems.push(`보내지 않은 근거 ${unknown.join(",")}`);
    const cited = s.factIds.map((id) => byId.get(id)).filter((f): f is DraftFact => Boolean(f));
    problems.push(...sentenceProblems(s.text, cited));
    if (seen.has(s.text)) problems.push("중복 문장");
    seen.add(s.text);
    if (problems.length) rejected.push({ text: s.text, problems });
    else kept.push(s);
  }
  return { kept, rejected };
}

/** Joins kept sentences into the text that "적용" writes into a field, cut at a sentence boundary. */
export function joinForField(sentences: DraftSentence[], kind: LocalDraftKind, maxChars?: number): string {
  const sep = kind === "handover" ? "\n" : " ";
  const parts = sentences.map((s) => (kind === "handover" ? `- ${s.text}` : s.text));
  let out = "";
  for (const p of parts) {
    const next = out ? `${out}${sep}${p}` : p;
    if (maxChars && next.length > maxChars) break;
    out = next;
  }
  return out;
}
