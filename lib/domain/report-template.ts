import { SERVICE_TYPE_LABEL, TASK_STATUS_LABEL, type ServiceType, type TaskStatus } from "./constants";

/** Aggregates computed by SQL. Every number in a report must come from here. */
export type ReportStats = {
  periodStart: string;
  periodEnd: string;
  regionName: string;
  recipients: number;
  needsReview: number;
  unconnected: number;
  openTasks: number;
  tasksCreated: number;
  tasksCompleted: number;
  completionRate: number | null; // 0–100, one decimal
  avgResolutionDays: number | null;
  byRegion: { regionId: string; regionName: string; recipients: number; unconnected: number; needsReview: number; openTasks: number }[];
  referralsByType: { serviceType: ServiceType; active: number; failed: number; suspended: number }[];
  tasksByStatus: { status: TaskStatus; count: number }[];
};

export type ReportSection = { title: string; body: string };
export type ReportNarrative = { sections: ReportSection[] };

const fmt = (n: number | null, unit = "") => (n === null ? "산출 불가" : `${n}${unit}`);

/** Deterministic narrative built only from the stats. Used when AI is off or fails validation. */
export function buildTemplateNarrative(s: ReportStats): ReportNarrative {
  const topRegions = [...s.byRegion].sort((a, b) => b.unconnected - a.unconnected).filter((r) => r.unconnected > 0).slice(0, 3);
  const failing = s.referralsByType.filter((r) => r.failed + r.suspended > 0).sort((a, b) => b.failed + b.suspended - (a.failed + a.suspended));
  return {
    sections: [
      {
        title: "요약",
        body: `${s.periodStart}부터 ${s.periodEnd}까지 ${s.regionName}의 등록 돌봄 대상자는 ${s.recipients}명이며, 확인 필요 사례 ${s.needsReview}건, 서비스 미연계 사례 ${s.unconnected}건, 미완료 조치 ${s.openTasks}건이 있습니다.`,
      },
      {
        title: "주요 통계",
        body: `기간 중 생성된 조치 ${s.tasksCreated}건 중 ${s.tasksCompleted}건이 완료되어 조치 완료율은 ${fmt(s.completionRate, "%")}입니다. 완료된 조치의 평균 소요 기간은 ${fmt(s.avgResolutionDays, "일")}입니다.`,
      },
      {
        title: "지역별 차이",
        body: topRegions.length
          ? `미연계 사례가 많은 지역은 ${topRegions.map((r) => `${r.regionName}(${r.unconnected}건)`).join(", ")}입니다.`
          : "선택한 범위에서 미연계 사례가 있는 지역이 없습니다.",
      },
      {
        title: "미연계 서비스 현황",
        body: failing.length
          ? failing.map((r) => `${SERVICE_TYPE_LABEL[r.serviceType]}: 연계 실패 ${r.failed}건, 중단 ${r.suspended}건`).join(" / ")
          : "연계 실패나 중단으로 집계된 서비스가 없습니다.",
      },
      {
        title: "후속 조치 현황",
        body: s.tasksByStatus.map((t) => `${TASK_STATUS_LABEL[t.status]} ${t.count}건`).join(", ") || "조치 업무가 없습니다.",
      },
      {
        title: "추가 확인이 필요한 사항",
        body: "이 보고서는 등록된 기록만 집계합니다. 기록되지 않은 돌봄 수요나 지역 외 서비스 이용은 반영되지 않습니다.",
      },
    ],
  };
}

/** Every number that a narrative is allowed to mention. */
export function allowedNumbers(s: ReportStats): Set<string> {
  const values: (number | null)[] = [
    s.recipients, s.needsReview, s.unconnected, s.openTasks, s.tasksCreated, s.tasksCompleted, s.completionRate, s.avgResolutionDays,
    ...s.byRegion.flatMap((r) => [r.recipients, r.unconnected, r.needsReview, r.openTasks]),
    ...s.referralsByType.flatMap((r) => [r.active, r.failed, r.suspended]),
    ...s.tasksByStatus.map((t) => t.count),
  ];
  const set = new Set<string>();
  for (const v of values) if (v !== null) set.add(String(v));
  // Dates in the period labels are allowed too.
  for (const d of [s.periodStart, s.periodEnd]) for (const part of d.split("-")) set.add(String(Number(part)));
  return set;
}

/**
 * Returns numbers in the text that are not in the stats. Ordinal-free
 * Korean prose rarely needs other numbers, so any extra number is treated as
 * unsupported and the AI narrative is rejected.
 */
export function findUnsupportedNumbers(text: string, s: ReportStats): string[] {
  const allowed = allowedNumbers(s);
  const found = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.filter((n) => !allowed.has(String(Number(n)))))];
}
