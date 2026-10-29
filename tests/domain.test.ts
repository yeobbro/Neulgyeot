import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchServices, type MatchService } from "../lib/domain/matching";
import { buildTemplateNarrative, findUnsupportedNumbers, type ReportStats } from "../lib/domain/report-template";
import { checkReferralTransition, checkSupportRequestTransition, checkTaskTransition } from "../lib/domain/transitions";
import { draftToRecordContent, structureTranscriptByRules } from "../lib/domain/voice-structure";

const svc = (over: Partial<MatchService>): MatchService => ({
  id: "S1",
  name: "식사",
  providerId: "P",
  providerName: "기관",
  serviceType: "meal",
  serviceRegionIds: ["D1"],
  eligibility: {},
  isOperating: true,
  capacityStatus: "open",
  capacityVerified: true,
  applicationMethod: "전화",
  contactMethod: "가상",
  isDemoData: true,
  ...over,
});
const person = { id: "R", regionIds: ["DONG", "D1", "CITY"], needs: ["meal" as const], attributes: { age: 80, livingAlone: true }, activeServiceIds: [] };

describe("service matching", () => {
  it("filters in the documented order and explains each exclusion", () => {
    const r = matchServices(person, [
      svc({ id: "A" }),
      svc({ id: "B", serviceType: "housing" }),
      svc({ id: "C", serviceRegionIds: ["D2"] }),
      svc({ id: "D", eligibility: { minAge: 90 } }),
      svc({ id: "E", isOperating: false }),
      svc({ id: "F", capacityStatus: "closed" }),
    ]);
    assert.deepEqual(r.candidates.map((c) => c.serviceId), ["A"]);
    assert.deepEqual(Object.fromEntries(r.excluded.map((x) => [x.serviceId, x.step])), { B: 1, C: 2, D: 3, E: 4, F: 5 });
  });

  it("reports unknown attributes and unverified capacity as conditions to check, never as facts", () => {
    const r = matchServices({ ...person, attributes: {} }, [svc({ eligibility: { minAge: 65, livingAlone: true }, capacityVerified: false })]);
    assert.equal(r.candidates.length, 1);
    const c = r.candidates[0];
    assert.equal(c.status, "needs_check");
    assert.equal(c.availability.verified, false);
    assert.ok(c.unverifiedConditions.some((u) => u.includes("연령")));
    assert.ok(c.unverifiedConditions.some((u) => u.includes("독거")));
    assert.ok(c.unverifiedConditions.some((u) => u.includes("수용")));
  });

  it("excludes services already connected and ranks fully eligible ones first", () => {
    const r = matchServices({ ...person, activeServiceIds: ["X"] }, [svc({ id: "X" }), svc({ id: "Y", capacityVerified: false }), svc({ id: "Z" })]);
    assert.deepEqual(r.candidates.map((c) => c.serviceId), ["Z", "Y"]);
  });
});

describe("status transitions", () => {
  it("validates task transitions and required fields", () => {
    assert.equal(checkTaskTransition("open", "completed", { resultNote: "" }).ok, false);
    assert.equal(checkTaskTransition("open", "completed", { resultNote: "확인함" }).ok, true);
    assert.equal(checkTaskTransition("completed", "in_progress", {}).ok, false);
    assert.equal(checkTaskTransition("completed", "open", { reopenReason: "" }).ok, false);
    assert.equal(checkTaskTransition("cancelled", "open", { reopenReason: "재발" }).ok, true);
  });
  it("validates referral transitions", () => {
    assert.equal(checkReferralTransition("requested", "in_service", {}).ok, false);
    assert.equal(checkReferralTransition("received", "failed", {}).ok, false);
    assert.equal(checkReferralTransition("received", "failed", { failureReason: "정원" }).ok, true);
    assert.equal(checkReferralTransition("failed", "requested", {}).ok, false);
  });
  it("requires an answer before marking a request answered", () => {
    assert.equal(checkSupportRequestTransition("received", "answered", { responseContent: "" }).ok, false);
    assert.equal(checkSupportRequestTransition("received", "answered", { responseContent: "답변" }).ok, true);
  });
});

describe("rule-based voice structuring", () => {
  it("only reorganizes the worker's own sentences", () => {
    const t = "오늘 방문했다. 난방이 약하다고 하셨다. 식사 지원을 계속 원하신다. 다음 주에 보일러를 다시 확인할 예정이다.";
    const d = structureTranscriptByRules(t);
    assert.ok(d.requestedSupport.some((s) => s.includes("식사")));
    assert.ok(d.followUps.some((s) => s.includes("다음 주")));
    assert.ok(d.serviceTypes.includes("meal"));
    assert.ok(d.serviceTypes.includes("housing"));
    const all = [...d.observations, ...d.requestedSupport, ...d.checkItems, ...d.followUps].join(" ");
    for (const s of all.split(" ")) assert.ok(t.includes(s), `"${s}" must come from the transcript`);
    assert.ok(draftToRecordContent(d).includes("[요청한 지원]"));
  });
});

describe("report narrative validation", () => {
  const stats: ReportStats = {
    periodStart: "2026-10-01", periodEnd: "2026-10-29", regionName: "해솔구", recipients: 56, needsReview: 2, unconnected: 21, openTasks: 12,
    tasksCreated: 14, tasksCompleted: 2, completionRate: 14.3, avgResolutionDays: 5.8, byRegion: [], referralsByType: [], tasksByStatus: [],
  };
  it("accepts numbers that exist in the stats and rejects invented ones", () => {
    assert.deepEqual(findUnsupportedNumbers("대상자 56명 중 미연계 21건, 완료율 14.3%", stats), []);
    assert.deepEqual(findUnsupportedNumbers("만족도가 87% 향상", stats), ["87"]);
  });
  it("builds a template narrative whose every number is supported", () => {
    const text = buildTemplateNarrative(stats).sections.map((s) => s.body).join(" ");
    assert.deepEqual(findUnsupportedNumbers(text, stats), []);
  });
});
