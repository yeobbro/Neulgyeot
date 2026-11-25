import { test } from "node:test";
import assert from "node:assert/strict";
import { PATIENTS } from "../lib/demo/hospital-data";
import { initialAssessment } from "../lib/integrations/municipal-referral/defaults";
import { dischargeFacts, familyFacts, handoverFacts, ruleDraft } from "../lib/local-llm/facts";
import { parseDraftRequest, rateLimited } from "../lib/local-llm/request";
import { configFromEnv, generate, health, isLocalNetworkHost } from "../lib/local-llm/server";
import type { DraftFact } from "../lib/local-llm/types";
import { buildMessages, joinForField, parseModelOutput, sentenceProblems, stripCitationMarkers, verifySentences } from "../lib/local-llm/verify";
import { generateReportItems, periodFor } from "../lib/family-report/build";
import type { FamilyReport } from "../lib/family-report/types";

const patient = PATIENTS.find((p) => p.id === "SYN-P-0001")!;
const IDS = new Set(PATIENTS.map((p) => p.id));

const FACTS: DraftFact[] = [
  { id: "F1", text: "퇴원 예정일 2026-11-20", source: "discharge.plannedDate" },
  { id: "F2", text: "퇴원 후 동거 형태: 배우자와 동거", source: "assessment.livingArrangement" },
  { id: "F3", text: "재활 기록(2026-11-02): 보행 훈련 20분 참여. 계단 2단 오르기 연습 시 난간 사용.", source: "SYN-P-0001-N2" }
];

function stub(content: string | null, opts: { status?: number; models?: string[] } = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.endsWith("/models")) return new Response(JSON.stringify({ data: (opts.models ?? ["qwen2.5:7b"]).map((id) => ({ id })) }), { status: 200 });
    if ((opts.status ?? 200) !== 200) return new Response("{}", { status: opts.status });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const CFG = configFromEnv({ LOCAL_LLM_MODEL: "qwen2.5:7b" })!;

test("facts: minimum necessary — no name, birth date, phone, diagnosis or medication names in discharge/family facts", () => {
  const facts = dischargeFacts(patient, initialAssessment(patient));
  const all = facts.map((f) => f.text).join("\n");
  assert.ok(facts.length > 3);
  assert.deepEqual(facts.map((f) => f.id), facts.map((_, i) => `F${i + 1}`));
  for (const banned of [patient.name, patient.birthDate, "I69", "Amlodipine", "010-"]) assert.ok(!all.includes(banned), banned);

  const period = periodFor("weekly", "2026-11-03", { from: "2026-10-28", to: "2026-11-03" });
  const items = generateReportItems(patient, period, ["careSummary", "dailyLiving", "observations"]);
  const report = { items: items.map((i, n) => ({ ...i, included: n !== 0 })) } as FamilyReport;
  const fam = familyFacts(report);
  const sendable = report.items.filter((i) => i.included && i.text.trim() && !["보고 기간", "입원 병동"].includes(i.label));
  assert.equal(fam.length, sendable.length, "excluded items and report metadata are not sent");
  assert.ok(sendable.length < items.length);
  const hand = handoverFacts(patient);
  assert.ok(hand.some((f) => f.text.startsWith("최근 활력징후")));
});

test("request gate: synthetic demo patients only, declared dataClass, no identifiers, bounded facts", () => {
  const ok = parseDraftRequest({ kind: "handover", patientId: "SYN-P-0001", dataClass: "synthetic", facts: FACTS }, IDS);
  assert.ok(ok.ok);
  assert.deepEqual(parseDraftRequest({ kind: "handover", patientId: "REAL-123", dataClass: "synthetic", facts: FACTS }, IDS), { ok: false, reason: "real_data_blocked" });
  assert.deepEqual(parseDraftRequest({ kind: "handover", patientId: "SYN-P-0001", dataClass: "real", facts: FACTS }, IDS), { ok: false, reason: "real_data_blocked" });
  const phone = [{ id: "F1", text: "보호자 연락처 010-1234-5678", source: "x" }];
  assert.deepEqual(parseDraftRequest({ kind: "handover", patientId: "SYN-P-0001", dataClass: "synthetic", facts: phone }, IDS), { ok: false, reason: "identifier_in_facts" });
  assert.equal(parseDraftRequest({ kind: "x", patientId: "SYN-P-0001", dataClass: "synthetic", facts: FACTS }, IDS).ok, false);
  const dup = [FACTS[0], FACTS[0]];
  assert.equal(parseDraftRequest({ kind: "handover", patientId: "SYN-P-0001", dataClass: "synthetic", facts: dup }, IDS).ok, false);
  for (let i = 0; i < 12; i++) assert.equal(rateLimited("t", 12, 60_000, 1000), false);
  assert.equal(rateLimited("t", 12, 60_000, 1000), true);
  assert.equal(rateLimited("t", 12, 60_000, 70_000), false, "window resets");
});

test("config: off without a model; https or local-network http only", () => {
  assert.equal(configFromEnv({}), null);
  assert.equal(CFG.baseUrl, "http://127.0.0.1:11434/v1");
  assert.ok(configFromEnv({ LOCAL_LLM_MODEL: "m", LOCAL_LLM_BASE_URL: "http://192.168.0.20:11434" }));
  assert.ok(configFromEnv({ LOCAL_LLM_MODEL: "m", LOCAL_LLM_BASE_URL: "https://llm.hospital.example/v1" }));
  assert.throws(() => configFromEnv({ LOCAL_LLM_MODEL: "m", LOCAL_LLM_BASE_URL: "http://llm.example.com" }), /https/);
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "172.16.1.1", "[::1]"]) assert.ok(isLocalNetworkHost(h), h);
  assert.ok(!isLocalNetworkHost("8.8.8.8"));
});

test("prompt and parsing", () => {
  const msgs = buildMessages("family_message", FACTS);
  assert.match(msgs[1].content, /F1: 퇴원 예정일 2026-11-20/);
  assert.match(msgs[0].content, /진단, 예후/);
  const s = parseModelOutput('```json\n{"sentences":[{"text":"F1: 퇴원 예정일은 2026-11-20입니다.","factIds":["F1","F1"]},{"text":"배우자와 함께 지낼 예정입니다 (F2)","source_ids":["F2"]}]}\n```');
  assert.deepEqual(s, [
    { text: "퇴원 예정일은 2026-11-20입니다.", factIds: ["F1"] },
    { text: "배우자와 함께 지낼 예정입니다", factIds: ["F2"] }
  ]);
  assert.equal(parseModelOutput('{"sections":[{"title":"a","sentences":[{"text":"좋습니다","factIds":["F1"]}]}]}').length, 1);
  assert.equal(stripCitationMarkers("[F3] 난간을 사용했습니다 [F3, F4]"), "난간을 사용했습니다");
  assert.throws(() => parseModelOutput("모르겠습니다"), /JSON/);
  const split = parseModelOutput('{"sentences":[{"text":"체온은 36.6으로 기록되었습니다. 식사는 80% 드셨습니다.<br>② 산책에 참여하셨습니다.","factIds":["F1"]}]}');
  assert.deepEqual(split.map((x) => x.text), ["체온은 36.6으로 기록되었습니다.", "식사는 80% 드셨습니다.", "산책에 참여하셨습니다."]);
});

test("verification: invented numbers/dates, uncited or unsent ids, judgments and non-Korean are rejected", () => {
  assert.deepEqual(sentenceProblems("보행 훈련에 20분 참여했습니다.", [FACTS[2]]), []);
  assert.match(sentenceProblems("보행 훈련에 30분 참여했습니다.", [FACTS[2]]).join(), /수치 30/);
  assert.match(sentenceProblems("퇴원 예정일은 2026-11-21입니다.", [FACTS[0]]).join(), /날짜/);
  assert.deepEqual(sentenceProblems("11/20에 퇴원 예정입니다.", [FACTS[0]]), [], "M/D date matches the fact date");
  assert.match(sentenceProblems("11/21에 퇴원 예정입니다.", [FACTS[0]]).join(), /날짜/);
  assert.match(sentenceProblems("보호자가 이해하기 쉬운 표현으로 설명하였습니다.", [FACTS[0]]).join(), /글 자체/);
  assert.match(sentenceProblems("낙상 위험이 높습니다.", [FACTS[2]]).join(), /판단/);
  assert.match(sentenceProblems("안심하셔도 됩니다.", [FACTS[2]]).join(), /판단/);
  assert.match(sentenceProblems("보행 훈련에 참여하며 훌륭한 하루를 보내셨습니다.", [FACTS[2]]).join(), /평가 표현/);
  for (const t of ["식사와 수분 섭취는 정상 수준을 유지했습니다.", "재활 치료가 정기적으로 이루어졌습니다.", "어르신의 하루는 건강 관리가 잘 이뤄졌습니다.", "필요한 조치를 취해야 합니다.", "퇴원 후에는 낙상 위험 관리에 주의가 필요합니다.", "이는 거주 환경을 살펴보아야 할 필요가 있습니다."])
    assert.match(sentenceProblems(t, [FACTS[2]]).join(), /평가 표현/, t);
  assert.match(sentenceProblems("세 번 연습했습니다.", [FACTS[2]]).join(), /글자/);
  assert.match(sentenceProblems("Walking training done.", [FACTS[2]]).join(), /한국어/);
  assert.match(sentenceProblems("보행 훈련 20분 참여 기록이 없습니다.", [FACTS[2]]).join(), /부정/, "negation not in the cited fact");
  assert.deepEqual(sentenceProblems("수분 섭취 기록이 없습니다.", [{ id: "F7", text: "일상생활 기록: 수분 기록 없음", source: "x" }]), []);
  const { kept, rejected } = verifySentences(
    [
      { text: "퇴원 예정일은 2026-11-20입니다.", factIds: ["F1"] },
      { text: "배우자와 함께 지낼 예정입니다.", factIds: [] },
      { text: "보호자 연락처를 확인했습니다.", factIds: ["F9"] },
      { text: "퇴원 예정일은 2026-11-20입니다.", factIds: ["F1"] }
    ],
    FACTS
  );
  assert.equal(kept.length, 1);
  assert.deepEqual(rejected.map((r) => r.problems[0]), ["근거 표시 없음", "보내지 않은 근거 F9", "중복 문장"]);
  assert.equal(joinForField([{ text: "가나다.", factIds: ["F1"] }, { text: "라마바.", factIds: ["F1"] }], "discharge_note", 5), "가나다.");
  assert.equal(joinForField([{ text: "가.", factIds: ["F1"] }, { text: "나.", factIds: ["F1"] }], "handover"), "- 가.\n- 나.");
  assert.equal(ruleDraft(FACTS).length, 3);
});

test("generate: verified sentences kept; server down, bad JSON, unknown model → unavailable (UI falls back to rules)", async () => {
  const out = JSON.stringify({
    sentences: [
      { text: "퇴원 예정일은 2026-11-20입니다.", factIds: ["F1"] },
      { text: "보행 훈련 40분에 참여했습니다.", factIds: ["F3"] }
    ]
  });
  const s = stub(out);
  const r = await generate(CFG, "discharge_note", FACTS, s.fetchImpl);
  assert.equal(r.status, "ok");
  if (r.status === "ok") {
    assert.equal(r.sentences.length, 1);
    assert.equal(r.rejected.length, 1);
    assert.equal(r.model, "local:qwen2.5:7b");
  }
  const body = s.calls[0].body as { response_format: { type: string }; messages: { content: string }[] };
  assert.equal(body.response_format.type, "json_object");
  assert.equal((await generate(CFG, "handover", FACTS, stub(null, { status: 500 }).fetchImpl)).status, "unavailable");
  const bad = await generate(CFG, "handover", FACTS, stub("잘 모르겠습니다").fetchImpl);
  assert.equal(bad.status === "unavailable" && bad.reason, "invalid_json");
  const nf = await generate(CFG, "handover", FACTS, stub(null, { status: 404 }).fetchImpl);
  assert.equal(nf.status === "unavailable" && nf.reason, "not_found");
  const none = await generate(CFG, "handover", FACTS, stub('{"sentences":[{"text":"진단됨","factIds":["F1"]}]}').fetchImpl);
  assert.equal(none.status === "unavailable" && none.reason, "no_result");
});

test("health", async () => {
  assert.deepEqual(await health(null), { configured: false, ok: false, model: null, reason: "not_configured" });
  assert.equal((await health(CFG, stub("{}").fetchImpl)).ok, true);
  assert.equal((await health(CFG, stub("{}", { models: ["llama3"] }).fetchImpl)).reason, "model_not_loaded");
});

/** LOCAL_LLM_TEST_MODEL=qwen2.5:1.5b npm test */
test("live local LLM (skipped unless LOCAL_LLM_TEST_MODEL is set)", { skip: !process.env.LOCAL_LLM_TEST_MODEL }, async () => {
  const cfg = configFromEnv({ LOCAL_LLM_MODEL: process.env.LOCAL_LLM_TEST_MODEL, LOCAL_LLM_BASE_URL: process.env.LOCAL_LLM_BASE_URL, LOCAL_LLM_TIMEOUT_MS: "300000" })!;
  for (const [kind, facts] of [
    ["discharge_note", dischargeFacts(patient, initialAssessment(patient))],
    ["handover", handoverFacts(patient)]
  ] as const) {
    const r = await generate(cfg, kind, facts);
    console.log(kind, JSON.stringify(r, null, 1));
    if (r.status === "ok") for (const s of r.sentences) assert.ok(s.factIds.every((id) => facts.some((f) => f.id === id)));
  }
});
