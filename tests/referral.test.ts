import { test } from "node:test";
import assert from "node:assert/strict";
import { PATIENTS, DEMO_FACILITY } from "../lib/demo/hospital-data";
import { initialAssessment, initialConsent } from "../lib/integrations/municipal-referral/defaults";
import type { ConsentRecord, SocialWorkAssessment } from "../lib/integrations/municipal-referral/types";
import {
  buildReferralEnvelope,
  consentChecks,
  draftStatus,
  validateAssessment,
  validateReferralEnvelope
} from "../lib/integrations/municipal-referral/validation";
import { createMockMunicipalAdapter, scenarioFor } from "../lib/integrations/municipal-referral/mock-adapter";
import { demoNow } from "../lib/demo/clock";

const patient = PATIENTS.find((p) => p.id === "SYN-P-0001")!;

function completeAssessment(): SocialWorkAssessment {
  return {
    ...initialAssessment(patient),
    cognition: "independentCommunication",
    livingArrangement: "spouse",
    housingType: "detached",
    barriers: ["bathroom"],
    requestedServices: ["visitingNursing", "homeModification"],
    socialWorkerNote: "내부 메모",
    savedAt: demoNow(0)
  };
}

function completeConsent(extra: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    ...initialConsent(patient),
    retention: "untilCaseClosure",
    consentAt: "2026-11-03T10:00",
    recorder: "정다은",
    consenterType: "patient",
    consenterName: patient.name,
    documentRef: "DEMO-CONSENT-0001",
    documentStatus: "verifiedDemo",
    review: { hospitalPrivacyReviewed: true, municipalRequirementChecked: true, legalBasisNote: "본인 동의 및 기관 검토 (DEMO)" },
    ...extra
  };
}

const ctx = { facilityId: DEMO_FACILITY.id, transferId: "DEMO-TR-0001-01" };

test("assessment prefill still requires social-worker input", () => {
  const issues = validateAssessment(initialAssessment(patient));
  const paths = issues.map((i) => i.path);
  assert.ok(paths.includes("cognition"));
  assert.ok(paths.includes("livingArrangement"));
  assert.ok(paths.includes("requestedServices"));
  assert.ok(!paths.includes("kAdl.eating"), "K-ADL is prefilled from EMR");
});

test("'other' options require free text", () => {
  const a = { ...completeAssessment(), requestedServices: ["other" as const], serviceOther: " " };
  assert.ok(validateAssessment(a).some((i) => i.path === "serviceOther"));
});

test("draft status progresses 작성 중 → 동의 확인 필요 → 전송 준비", () => {
  assert.equal(draftStatus(initialAssessment(patient), initialConsent(patient)), "작성 중");
  assert.equal(draftStatus(completeAssessment(), initialConsent(patient)), "동의 확인 필요");
  assert.equal(draftStatus(completeAssessment(), completeConsent()), "전송 준비");
});

test("consent gate is not a single checkbox: each condition blocks", () => {
  const blocked = (patch: Partial<ConsentRecord>) => consentChecks(completeConsent(patch)).some((c) => !c.ok);
  assert.equal(blocked({}), false);
  assert.equal(blocked({ withdrawn: true }), true);
  assert.equal(blocked({ documentStatus: "notVerified" }), true);
  assert.equal(blocked({ consenterType: "legalRepresentative", consenterName: "대리인", representativeAuthorityVerified: false }), true);
  assert.equal(blocked({ review: { hospitalPrivacyReviewed: false, municipalRequirementChecked: true, legalBasisNote: "검토 메모 (DEMO)" } }), true);
  assert.equal(blocked({ retention: null }), true);
});

test("sensitive categories require separate sensitive-information consent", () => {
  const c = completeConsent({ categories: ["identity", "principalDiagnosis"] });
  assert.equal(consentChecks(c).find((x) => x.id === "sensitive")?.ok, false);
  assert.equal(consentChecks({ ...c, sensitiveConsent: "granted" }).find((x) => x.id === "sensitive")?.ok, true);
});

test("envelope contains only approved categories (minimum necessary)", () => {
  const env = buildReferralEnvelope(patient, completeAssessment(), completeConsent(), ctx);
  assert.equal(env.clinicalSummary, undefined, "no clinical data without approved clinical categories");
  assert.equal(env.livingNeeds?.socialWorkerNote, undefined, "note excluded unless approved");
  assert.equal(env.subject.contact, null);
  assert.deepEqual(validateReferralEnvelope(env), []);

  const withDx = buildReferralEnvelope(
    patient,
    completeAssessment(),
    completeConsent({ categories: ["identity", "principalDiagnosis", "kAdl"], sensitiveConsent: "granted" }),
    ctx
  );
  assert.equal(withDx.clinicalSummary?.principalDiagnosis?.code, "I69.3");
  assert.equal(withDx.clinicalSummary?.medicationSummary, undefined);
  assert.equal(withDx.livingNeeds, undefined);
  assert.equal(JSON.stringify(withDx).includes("E11.9"), false, "secondary diagnoses never included");
  assert.deepEqual(validateReferralEnvelope(withDx), []);
});

test("validator rejects data outside consent scope and non-synthetic ids", () => {
  const env = buildReferralEnvelope(patient, completeAssessment(), completeConsent(), ctx);
  const tampered = { ...env, clinicalSummary: { fallRisk: "높음 구간" }, subject: { ...env.subject, patientId: "REAL-123" } };
  const paths = validateReferralEnvelope(tampered).map((i) => i.path);
  assert.ok(paths.includes("clinicalSummary.fallRisk"));
  assert.ok(paths.includes("subject.patientId"));
});

test("mock adapter: deterministic approve path and idempotent submit", async () => {
  const adapter = createMockMunicipalAdapter({ latencyMs: 0 });
  const env = buildReferralEnvelope(patient, completeAssessment(), completeConsent(), ctx);
  const opts = { idempotencyKey: "idem-1", traceId: "trace-1", now: demoNow(1), municipalityName: "DEMO시 늘봄구" };
  let rec = await adapter.submit(env, opts);
  const again = await adapter.submit(env, opts);
  assert.equal(again, rec, "same idempotency key returns the same transfer");
  assert.equal(rec.status, "전송 완료");
  const seen: string[] = [rec.status];
  let tick = 2;
  while (adapter.canAdvance(rec)) {
    rec = await adapter.advance(rec, demoNow(tick++));
    seen.push(rec.status);
  }
  assert.deepEqual(seen, ["전송 완료", "수신 확인", "심사 중", "승인", "연계 종료"]);
});

test("mock adapter: info-request path requires resubmission", async () => {
  const p2 = PATIENTS.find((p) => p.id === "SYN-P-0002")!;
  assert.equal(scenarioFor(p2.id), "infoRequest");
  const adapter = createMockMunicipalAdapter({ latencyMs: 0 });
  const consent = { ...completeConsent(), municipalityCode: p2.discharge.municipalityCode, consenterName: p2.name };
  const env = buildReferralEnvelope(p2, completeAssessment(), consent, { ...ctx, transferId: "DEMO-TR-0002-01" });
  let rec = await adapter.submit(env, { idempotencyKey: "idem-2", traceId: "t", now: demoNow(0), municipalityName: "x" });
  for (let i = 0; i < 3; i++) rec = await adapter.advance(rec, demoNow(i + 1));
  assert.equal(rec.status, "보완 요청");
  assert.ok(rec.reason);
  assert.equal(adapter.canAdvance(rec), false);
  rec = await adapter.resubmit(rec, demoNow(9), "욕실 구조 보완");
  assert.equal(rec.status, "전송 완료");
  const seen: string[] = [];
  while (adapter.canAdvance(rec)) {
    rec = await adapter.advance(rec, demoNow(10 + seen.length));
    seen.push(rec.status);
  }
  assert.deepEqual(seen, ["심사 중", "승인", "연계 종료"]);
});

test("mock adapter refuses envelopes that fail validation", async () => {
  const adapter = createMockMunicipalAdapter({ latencyMs: 0 });
  const env = buildReferralEnvelope(patient, completeAssessment(), completeConsent({ consentAt: "" }), ctx);
  await assert.rejects(adapter.submit(env, { idempotencyKey: "bad", traceId: "t", now: demoNow(0), municipalityName: "x" }));
});
