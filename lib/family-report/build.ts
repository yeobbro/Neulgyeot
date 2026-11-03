import { K_ADL_LABEL, type Guardian, type Patient } from "../hospital/types";
import { latestKAdl, previousKAdl } from "../hospital/derive";
import type { ReadinessCheck } from "../integrations/municipal-referral/types";
import {
  FAMILY_CATEGORIES,
  type FamilyCategory,
  type FamilyReport,
  type GuardianSharingSetting,
  type ReportItem,
  type ReportPeriod
} from "./types";

export const DEFAULT_CATEGORIES: FamilyCategory[] = ["careSummary", "dailyLiving", "observations", "rehabSchedule", "communication"];
export const CONTACT_DEPARTMENT = "병동 간호사실 · 사회사업팀 (DEMO 연락처 02-000-0000)";

export function isSensitiveFamilyCategory(id: FamilyCategory): boolean {
  return FAMILY_CATEGORIES.some((c) => c.id === id && c.sensitive);
}

export function defaultSharingSetting(patient: Patient, guardian: Guardian): GuardianSharingSetting {
  const verified = guardian.authority !== "권한 확인 전";
  return {
    patientId: patient.id,
    guardianId: guardian.id,
    authorityVerified: verified,
    patientConsent: verified ? "동의" : "미확인",
    consentRecordedAt: verified ? patient.admissionDate : "",
    allowedCategories: verified ? [...DEFAULT_CATEGORIES] : [],
    sensitiveReview: { reviewed: false, legalBasisNote: "" },
    status: verified ? "활성" : "일시 중지"
  };
}

/** Sharing is possible only with verified authority, recorded patient consent and an active setting. */
export function sharingChecks(setting: GuardianSharingSetting): ReadinessCheck[] {
  return [
    { id: "authority", label: "보호자 권한 확인", ok: setting.authorityVerified, detail: "가족 관계만으로 열람 권한이 생기지 않습니다." },
    { id: "consent", label: "환자 동의 또는 법정대리인 권한 기록", ok: setting.patientConsent === "동의" },
    { id: "active", label: "공유 상태 활성", ok: setting.status === "활성" },
    { id: "scope", label: "공유 항목 1개 이상 지정", ok: setting.allowedCategories.length > 0 }
  ];
}

export function canShare(setting: GuardianSharingSetting): boolean {
  return sharingChecks(setting).every((c) => c.ok);
}

/** A category is selectable for a report only if the sharing setting allows it (and, for sensitive data, it was reviewed). */
export function categorySelectable(setting: GuardianSharingSetting, id: FamilyCategory): boolean {
  if (!setting.allowedCategories.includes(id)) return false;
  if (isSensitiveFamilyCategory(id)) {
    return setting.sensitiveReview.reviewed && setting.sensitiveReview.legalBasisNote.trim().length >= 5;
  }
  return true;
}

export function periodFor(kind: ReportPeriod["kind"], today: string, custom?: { from: string; to: string }): ReportPeriod {
  if (kind === "custom" && custom) return { kind, from: custom.from, to: custom.to };
  if (kind === "monthly") return { kind, from: "2026-10-04", to: today };
  return { kind: "weekly", from: "2026-10-28", to: today };
}

const inPeriod = (date: string, p: ReportPeriod) => date >= p.from && date <= p.to;

function avg(values: (number | null)[]): { value: number | null; count: number } {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length) return { value: null, count: 0 };
  return { value: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, count: v.length };
}

let seq = 0;
const itemId = (section: FamilyCategory) => `${section}-${(seq += 1)}`;

function item(section: FamilyCategory, label: string, text: string, origin: ReportItem["origin"], sources: string[], incomplete = false): ReportItem {
  return { id: itemId(section), section, label, text, origin, sources, incomplete, edited: false, included: true };
}

/**
 * Deterministic, rule-based draft generation from synthetic records.
 * This is NOT AI summarization. Every generated item lists its source records,
 * missing data is marked instead of being filled in, and staff must review and
 * approve before anything is shared.
 */
export function generateReportItems(patient: Patient, period: ReportPeriod, categories: FamilyCategory[]): ReportItem[] {
  seq = 0;
  const items: ReportItem[] = [];
  const days = patient.dailyLiving.filter((d) => inPeriod(d.date, period));
  const dayIds = days.map((d) => `DL-${patient.id}-${d.date}`);
  const notes = patient.notes.filter((n) => inPeriod(n.at.slice(0, 10), period));
  const shareable = notes.filter((n) => n.familyShareable);
  const has = (c: FamilyCategory) => categories.includes(c);
  const totalDays = Math.max(1, Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) + 1);

  if (has("careSummary")) {
    items.push(item("careSummary", "보고 기간", `${period.from} ~ ${period.to} (${totalDays}일 중 일상기록 ${days.length}일)`, "기록 사실", dayIds, days.length < totalDays));
    items.push(item("careSummary", "입원 병동", `${patient.ward} ${patient.room}호 · 담당 간호사 ${patient.primaryNurse}`, "기록 사실", [patient.id]));
    const byType = shareable.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.type]: (acc[n.type] ?? 0) + 1 }), {});
    const summary = Object.entries(byType).map(([t, c]) => `${t} ${c}건`).join(", ");
    items.push(
      item(
        "careSummary",
        "주요 돌봄 활동",
        summary ? `보호자 공유 가능으로 표시된 기록: ${summary}` : "기간 내 보호자 공유 가능으로 표시된 기록이 없습니다.",
        "자동 집계 초안",
        shareable.map((n) => n.id),
        !summary
      )
    );
  }

  if (has("dailyLiving")) {
    const meal = avg(days.map((d) => d.mealIntakePct));
    const water = avg(days.map((d) => d.hydrationMl));
    const sleep = avg(days.map((d) => d.sleepHours));
    const act = avg(days.map((d) => d.activityMinutes));
    const fmt = (a: { value: number | null; count: number }, unit: string) =>
      a.value === null ? "기록 없음" : `평균 ${a.value}${unit} (기록 ${a.count}/${days.length}일)`;
    items.push(item("dailyLiving", "식사 섭취", fmt(meal, "%"), "자동 집계 초안", dayIds, meal.count < days.length || meal.count === 0));
    items.push(item("dailyLiving", "수분 섭취", fmt(water, "mL"), "자동 집계 초안", dayIds, water.count < days.length || water.count === 0));
    items.push(item("dailyLiving", "수면·휴식", fmt(sleep, "시간"), "자동 집계 초안", dayIds, sleep.count < days.length || sleep.count === 0));
    items.push(item("dailyLiving", "활동·이동", fmt(act, "분/일"), "자동 집계 초안", dayIds, act.count < days.length || act.count === 0));
    const cur = latestKAdl(patient);
    const prev = previousKAdl(patient);
    if (cur && prev) {
      const parts = (["eating", "mobility", "toileting"] as const)
        .filter((k) => cur[k] !== prev[k])
        .map((k) => `${{ eating: "식사", mobility: "이동", toileting: "화장실 사용" }[k]} ${K_ADL_LABEL[prev[k]]} → ${K_ADL_LABEL[cur[k]]}`);
      items.push(
        item(
          "dailyLiving",
          "일상생활 동작 변화",
          parts.length ? `${prev.assessedAt} 대비 ${cur.assessedAt} 평가: ${parts.join(", ")}` : `${prev.assessedAt} 대비 ${cur.assessedAt} 평가 항목 변동 기록 없음`,
          "기록 사실",
          [`KADL-${patient.id}-${prev.assessedAt}`, `KADL-${patient.id}-${cur.assessedAt}`]
        )
      );
    } else {
      items.push(item("dailyLiving", "일상생활 동작 변화", "비교 가능한 이전 평가 기록이 없습니다.", "기록 사실", [], true));
    }
  }

  if (has("observations")) {
    if (shareable.length === 0) {
      items.push(item("observations", "관찰 기록", "기간 내 보호자 공유로 표시된 관찰 기록이 없습니다.", "기록 사실", [], true));
    }
    shareable.forEach((n) => items.push(item("observations", `${n.at.slice(5, 10).replace("-", "/")} ${n.type}`, n.text, "기록 사실", [n.id])));
    patient.signals
      .filter((s) => ["식사", "수면", "활동"].includes(s.domain) && s.status !== "데이터 부족")
      .forEach((s) =>
        items.push(item("observations", "일상 관찰 변화", `${s.domain} 기록이 최근 평소와 다르게 기록되어 돌봄팀이 살펴보고 있습니다.`, "자동 집계 초안", [s.id]))
      );
    items.push(item("observations", "확인 필요 사항", "", "직원 작성", []));
  }

  if (has("rehabSchedule")) {
    const sessions = days.reduce((a, d) => a + d.rehabSessions, 0);
    items.push(item("rehabSchedule", "재활 참여", `기간 내 재활 치료 참여 기록 ${sessions}회`, "자동 집계 초안", dayIds));
    const upcoming = patient.schedule.filter((s) => s.date >= period.to);
    if (!upcoming.length) items.push(item("rehabSchedule", "예정 일정", "등록된 예정 일정이 없습니다.", "기록 사실", []));
    upcoming.forEach((s) => items.push(item("rehabSchedule", `${s.kind} · ${s.date}`, s.title, "기록 사실", [`SCH-${patient.id}-${s.id}`])));
  }

  if (has("diagnosis")) {
    const p = patient.diagnoses.find((d) => d.principal);
    items.push(item("diagnosis", "주진단", p ? `${p.display}` : "기록 없음", "기록 사실", p ? [`DX-${patient.id}-${p.code}`] : [], !p));
  }
  if (has("medication")) {
    patient.medications.forEach((m) => items.push(item("medication", m.name, `${m.frequency}`, "기록 사실", [`MED-${patient.id}-${m.id}`])));
  }
  if (has("testResults")) {
    items.push(item("testResults", "검사 결과", "이 데모에는 보호자 공유가 승인된 검사 결과 데이터가 없습니다.", "기록 사실", [], true));
  }
  return items;
}

export function approvalChecks(report: FamilyReport, setting: GuardianSharingSetting): ReadinessCheck[] {
  const included = report.items.filter((i) => i.included);
  const emptyStaff = included.filter((i) => i.origin === "직원 작성" && !i.text.trim());
  const outOfScope = report.categories.filter((c) => !categorySelectable(setting, c));
  return [
    ...sharingChecks(setting),
    { id: "scopeMatch", label: "리포트 항목이 공유 설정 범위 내", ok: outOfScope.length === 0 },
    { id: "items", label: "포함 항목 1개 이상", ok: included.length > 0 },
    { id: "staffText", label: "직원 작성 항목 작성 또는 제외", ok: emptyStaff.length === 0, detail: emptyStaff.map((i) => i.label).join(", ") || undefined },
    {
      id: "message",
      label: "돌봄팀 메시지 작성",
      ok: !report.categories.includes("communication") || report.careTeamMessage.trim().length > 0
    },
    { id: "review", label: "모든 항목의 출처·내용 검토 확인", ok: report.reviewConfirmed }
  ];
}
