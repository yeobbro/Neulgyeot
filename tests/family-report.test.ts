import { test } from "node:test";
import assert from "node:assert/strict";
import { PATIENTS } from "../lib/demo/hospital-data";
import {
  approvalChecks,
  canShare,
  categorySelectable,
  CONTACT_DEPARTMENT,
  DEFAULT_CATEGORIES,
  defaultSharingSetting,
  generateReportItems,
  periodFor
} from "../lib/family-report/build";
import { simulateDelivery } from "../lib/family-report/mock-delivery";
import type { FamilyReport } from "../lib/family-report/types";

const p1 = PATIENTS.find((p) => p.id === "SYN-P-0001")!;

test("family relationship alone does not grant sharing", () => {
  const unverified = p1.guardians.find((g) => g.authority === "권한 확인 전")!;
  assert.equal(canShare(defaultSharingSetting(p1, unverified)), false);
  assert.equal(canShare(defaultSharingSetting(p1, p1.guardians[0])), true);
});

test("sensitive categories are excluded by default and need explicit review", () => {
  const s = defaultSharingSetting(p1, p1.guardians[0]);
  assert.equal(categorySelectable(s, "diagnosis"), false);
  const allowed = { ...s, allowedCategories: [...s.allowedCategories, "diagnosis" as const] };
  assert.equal(categorySelectable(allowed, "diagnosis"), false, "allowed but not reviewed");
  const reviewed = { ...allowed, sensitiveReview: { reviewed: true, legalBasisNote: "검토 근거 (DEMO)" } };
  assert.equal(categorySelectable(reviewed, "diagnosis"), true);
});

test("draft items cite sources, exclude internal notes and never include diagnosis by default", () => {
  const items = generateReportItems(p1, periodFor("weekly", "2026-11-03"), DEFAULT_CATEGORIES);
  const text = JSON.stringify(items);
  assert.equal(text.includes("I69.3"), false);
  assert.equal(text.includes("Amlodipine"), false);
  const internal = p1.notes.filter((n) => !n.familyShareable).map((n) => n.id);
  internal.forEach((id) => assert.equal(text.includes(id), false, `internal note ${id} leaked`));
  items.filter((i) => i.origin !== "직원 작성").forEach((i) => assert.ok(i.sources.length > 0 || i.incomplete, `${i.label} lacks source`));
});

test("missing records are marked as incomplete rather than filled in", () => {
  const p4 = PATIENTS.find((p) => p.id === "SYN-P-0004")!; // on leave: last two days missing
  const items = generateReportItems(p4, periodFor("weekly", "2026-11-03"), ["dailyLiving"]);
  const meal = items.find((i) => i.label === "식사 섭취")!;
  assert.equal(meal.incomplete, true);
  assert.match(meal.text, /기록 5\/7일/);
});

test("approval requires staff review and completed staff fields", () => {
  const setting = defaultSharingSetting(p1, p1.guardians[0]);
  const period = periodFor("weekly", "2026-11-03");
  const report: FamilyReport = {
    id: "DEMO-FR-0001-01", patientId: p1.id, guardianId: "G1", period, categories: DEFAULT_CATEGORIES,
    items: generateReportItems(p1, period, DEFAULT_CATEGORIES), careTeamMessage: "", familyRequests: "",
    contactDepartment: CONTACT_DEPARTMENT, status: "검토 중", createdAt: "", createdBy: "", reviewConfirmed: false,
    approvedBy: null, approvedAt: null, deliveries: [], openedAt: null
  };
  assert.equal(approvalChecks(report, setting).every((c) => c.ok), false);
  const done: FamilyReport = {
    ...report,
    careTeamMessage: "이번 주 재활에 꾸준히 참여하셨습니다.",
    reviewConfirmed: true,
    items: report.items.map((i) => (i.origin === "직원 작성" ? { ...i, text: "특이 요청 없음" } : i))
  };
  assert.equal(approvalChecks(done, setting).every((c) => c.ok), true);
  assert.equal(approvalChecks(done, { ...setting, status: "철회" }).every((c) => c.ok), false, "revoked sharing blocks approval");
});

test("mock delivery is deterministic: fail-first guardian fails once then succeeds", () => {
  const p2 = PATIENTS.find((p) => p.id === "SYN-P-0002")!;
  const g = p2.guardians[0];
  const base = { deliveries: [] } as unknown as FamilyReport;
  const first = simulateDelivery(base, g, "t1");
  assert.equal(first.outcome, "전송 실패");
  const second = simulateDelivery({ ...base, deliveries: [first] }, g, "t2");
  assert.equal(second.outcome, "전송 완료");
});
