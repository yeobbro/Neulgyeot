import type { RecordFlag, RecordType, ReferralStatus, ServiceType, TaskStatus, VisitStatus } from "../constants";
import { RULE_CONFIG, RULE_VERSION, type RuleConfig } from "./config";

/** Inputs are plain data so the engine is deterministic and testable without a DB. */
export type RuleRecord = {
  id: string;
  recordType: RecordType;
  visitStatus: VisitStatus | null;
  scheduledAt: Date | null;
  recordedAt: Date;
  flags: RecordFlag[];
};
export type RuleReferral = {
  id: string;
  serviceType: ServiceType;
  serviceName: string;
  status: ReferralStatus;
  statusChangedAt: Date;
};
export type RuleTask = { id: string; title: string; status: TaskStatus; dueAt: Date | null };
export type RuleInput = {
  now: Date;
  records: RuleRecord[];
  referrals: RuleReferral[];
  tasks: RuleTask[];
};

export type SignalType = keyof RuleConfig["weights"];

export const SIGNAL_LABEL: Record<SignalType, string> = {
  missed_visit: "예정 방문 미완료",
  repeated_missed_visits: "방문 미완료 반복",
  service_interruption: "서비스 중단 지속",
  referral_failure: "서비스 연계 실패",
  overdue_followup: "후속 조치 기한 경과",
  recorded_change: "기록상 생활 변화·지원 필요",
  no_recent_contact: "최근 접촉 기록 없음",
  multiple_signals: "여러 신호 동시 관찰",
  urgent_procedure_check: "긴급 상황 언급 — 공식 절차 확인",
};

export type Evidence = { entityType: "record" | "referral" | "task"; entityId: string };

export type RuleResult = {
  ruleId: string;
  signalType: SignalType;
  label: string;
  window: { start: string; end: string };
  occurredAt: string | null;
  evidence: Evidence[];
  sourceRecordIds: string[];
  reason: string;
  dataInsufficient: boolean;
  suggestedAction: string;
  weight: number;
};

export type RuleOutcome = {
  ruleVersion: string;
  score: number;
  priority: "high" | "medium" | "low" | "none";
  signals: RuleResult[];
  sourceRecordIds: string[];
  dataInsufficient: boolean;
  window: { start: string; end: string };
};

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();

function byTime<T>(get: (t: T) => Date) {
  return (a: T, b: T) => get(a).getTime() - get(b).getTime() || 0;
}

/**
 * Evaluates every rule. Pure: the same input always produces the same output
 * (lists are sorted by time then id before evaluation).
 */
export function evaluateRules(input: RuleInput, config: RuleConfig = RULE_CONFIG): RuleOutcome {
  const now = input.now;
  const windowStart = new Date(now.getTime() - config.windowDays * DAY);
  const window = { start: iso(windowStart), end: iso(now) };
  const records = [...input.records].sort(
    (a, b) => byTime<RuleRecord>((r) => r.recordedAt)(a, b) || a.id.localeCompare(b.id),
  );
  const inWindow = records.filter((r) => r.recordedAt >= windowStart && r.recordedAt <= now);
  const dataInsufficient = inWindow.length < config.minRecordsForAnalysis;
  const signals: RuleResult[] = [];

  const push = (r: Omit<RuleResult, "label" | "weight" | "window"> & { window?: RuleResult["window"] }) =>
    signals.push({ ...r, window: r.window ?? window, label: SIGNAL_LABEL[r.signalType], weight: config.weights[r.signalType] });

  // R1/R2 — scheduled visits not completed
  const graceCutoff = new Date(now.getTime() - config.scheduledGraceHours * 3_600_000);
  const missed = inWindow.filter(
    (r) =>
      r.recordType === "visit" &&
      (r.visitStatus === "missed" ||
        (r.visitStatus === "scheduled" && r.scheduledAt !== null && r.scheduledAt < graceCutoff)),
  );
  if (missed.length > 0) {
    const ids = missed.map((r) => r.id);
    push({
      ruleId: "R1_MISSED_VISIT",
      signalType: "missed_visit",
      occurredAt: iso(missed[missed.length - 1].scheduledAt ?? missed[missed.length - 1].recordedAt),
      evidence: ids.map((id) => ({ entityType: "record", entityId: id })),
      sourceRecordIds: ids,
      reason: `최근 ${config.windowDays}일 안에 완료되지 않은 예정 방문 기록이 ${missed.length}건 있습니다.`,
      dataInsufficient,
      suggestedAction: "미완료 방문의 사유와 현재 상황을 담당자가 확인합니다.",
    });
    if (missed.length >= config.repeatedMissedVisits) {
      push({
        ruleId: "R2_REPEATED_MISSED_VISITS",
        signalType: "repeated_missed_visits",
        occurredAt: iso(missed[missed.length - 1].recordedAt),
        evidence: ids.map((id) => ({ entityType: "record", entityId: id })),
        sourceRecordIds: ids,
        reason: `방문 미완료가 ${config.windowDays}일 동안 ${missed.length}회 반복되었습니다 (기준 ${config.repeatedMissedVisits}회).`,
        dataInsufficient,
        suggestedAction: "방문 일정과 방식(시간대, 연락 방법)을 다시 조율할지 검토합니다.",
      });
    }
  }

  // R3 — service suspended for a while
  const suspendCutoff = new Date(now.getTime() - config.suspendedServiceDays * DAY);
  const suspended = input.referrals
    .filter((r) => r.status === "suspended" && r.statusChangedAt <= suspendCutoff)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const ref of suspended) {
    const days = Math.floor((now.getTime() - ref.statusChangedAt.getTime()) / DAY);
    push({
      ruleId: "R3_SERVICE_SUSPENDED",
      signalType: "service_interruption",
      window: { start: iso(ref.statusChangedAt), end: iso(now) },
      occurredAt: iso(ref.statusChangedAt),
      evidence: [{ entityType: "referral", entityId: ref.id }],
      sourceRecordIds: [],
      reason: `'${ref.serviceName}' 서비스가 ${days}일째 중단 상태입니다 (기준 ${config.suspendedServiceDays}일).`,
      dataInsufficient,
      suggestedAction: "중단 사유를 확인하고 재개 또는 대체 서비스를 검토합니다.",
    });
  }

  // R4 — failed referral without an active replacement of the same type
  const activeTypes = new Set(
    input.referrals
      .filter((r) => ["requested", "received", "in_progress", "in_service"].includes(r.status))
      .map((r) => r.serviceType),
  );
  const failed = input.referrals
    .filter((r) => r.status === "failed" && r.statusChangedAt >= windowStart && !activeTypes.has(r.serviceType))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const ref of failed) {
    push({
      ruleId: "R4_REFERRAL_FAILED",
      signalType: "referral_failure",
      occurredAt: iso(ref.statusChangedAt),
      evidence: [{ entityType: "referral", entityId: ref.id }],
      sourceRecordIds: [],
      reason: `'${ref.serviceName}' 연계가 실패했고 같은 유형의 진행 중인 대체 연계가 없습니다.`,
      dataInsufficient,
      suggestedAction: "재의뢰하거나 대체 서비스 후보를 검토합니다.",
    });
  }

  // R5 — overdue follow-up tasks
  const overdue = input.tasks
    .filter((t) => ["open", "in_progress", "waiting"].includes(t.status) && t.dueAt !== null && t.dueAt < now)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (overdue.length > 0) {
    push({
      ruleId: "R5_OVERDUE_FOLLOWUP",
      signalType: "overdue_followup",
      occurredAt: iso(overdue.reduce((min, t) => (t.dueAt! < min ? t.dueAt! : min), overdue[0].dueAt!)),
      evidence: overdue.map((t) => ({ entityType: "task", entityId: t.id })),
      sourceRecordIds: [],
      reason: `기한이 지난 미완료 후속 조치가 ${overdue.length}건 있습니다.`,
      dataInsufficient,
      suggestedAction: "지연 사유를 기록하고 담당자·기한을 다시 정합니다.",
    });
  }

  // R6 — structured flags recorded by staff
  const flagStart = new Date(now.getTime() - config.recordFlagWindowDays * DAY);
  const flagged = records.filter(
    (r) => r.recordedAt >= flagStart && r.recordedAt <= now && r.flags.some((f) => f === "condition_worse" || f === "needs_support"),
  );
  if (flagged.length > 0) {
    const ids = flagged.map((r) => r.id);
    push({
      ruleId: "R6_RECORDED_CHANGE",
      signalType: "recorded_change",
      window: { start: iso(flagStart), end: iso(now) },
      occurredAt: iso(flagged[flagged.length - 1].recordedAt),
      evidence: ids.map((id) => ({ entityType: "record", entityId: id })),
      sourceRecordIds: ids,
      reason: `최근 ${config.recordFlagWindowDays}일 기록 ${flagged.length}건에 생활 상태 악화 또는 추가 지원 필요가 표시되었습니다.`,
      dataInsufficient,
      suggestedAction: "기록 내용을 확인하고 필요한 지원 유형을 검토합니다.",
    });
  }

  // R7 — no completed contact recently
  const contactCutoff = new Date(now.getTime() - config.noContactDays * DAY);
  const contacts = records.filter(
    (r) => r.recordedAt <= now && (r.recordType !== "visit" || r.visitStatus === "completed") && r.recordType !== "observation",
  );
  const lastContact = contacts.length ? contacts[contacts.length - 1] : null;
  if (!lastContact || lastContact.recordedAt < contactCutoff) {
    push({
      ruleId: "R7_NO_RECENT_CONTACT",
      signalType: "no_recent_contact",
      window: { start: iso(contactCutoff), end: iso(now) },
      occurredAt: lastContact ? iso(lastContact.recordedAt) : null,
      evidence: lastContact ? [{ entityType: "record", entityId: lastContact.id }] : [],
      sourceRecordIds: lastContact ? [lastContact.id] : [],
      reason: lastContact
        ? `마지막 완료 접촉 기록이 ${Math.floor((now.getTime() - lastContact.recordedAt.getTime()) / DAY)}일 전입니다 (기준 ${config.noContactDays}일).`
        : "완료된 상담·방문·전화 기록이 없습니다.",
      dataInsufficient: true,
      suggestedAction: "안부 확인 일정을 잡습니다.",
    });
  }

  // R8 — emergency mention: never closed by the system, always routed to official procedure
  const urgent = records.filter((r) => r.recordedAt >= flagStart && r.recordedAt <= now && r.flags.includes("emergency_mention"));
  if (urgent.length > 0) {
    const ids = urgent.map((r) => r.id);
    push({
      ruleId: "R8_EMERGENCY_MENTION",
      signalType: "urgent_procedure_check",
      window: { start: iso(flagStart), end: iso(now) },
      occurredAt: iso(urgent[urgent.length - 1].recordedAt),
      evidence: ids.map((id) => ({ entityType: "record", entityId: id })),
      sourceRecordIds: ids,
      reason: "기록에 긴급 상황 언급이 표시되었습니다. 시스템은 긴급 여부를 판단하지 않습니다.",
      dataInsufficient,
      suggestedAction: "기관의 공식 긴급 대응 절차에 따라 즉시 확인합니다.",
    });
  }

  // R9 — several independent signal types at once
  const independent = new Set(signals.map((s) => s.signalType).filter((t) => t !== "repeated_missed_visits"));
  if (independent.size >= config.multipleSignalTypes) {
    const ids = [...new Set(signals.flatMap((s) => s.sourceRecordIds))].sort();
    push({
      ruleId: "R9_MULTIPLE_SIGNALS",
      signalType: "multiple_signals",
      occurredAt: null,
      evidence: signals.flatMap((s) => s.evidence),
      sourceRecordIds: ids,
      reason: `서로 다른 유형의 신호 ${independent.size}가지가 동시에 관찰됩니다.`,
      dataInsufficient,
      suggestedAction: "사례 전체를 검토하는 회의나 방문을 고려합니다.",
    });
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  const priority =
    signals.some((s) => s.signalType === "urgent_procedure_check") || score >= config.priorityThresholds.high
      ? "high"
      : score >= config.priorityThresholds.medium
        ? "medium"
        : score > 0
          ? "low"
          : "none";

  return {
    ruleVersion: RULE_VERSION,
    score,
    priority,
    signals,
    sourceRecordIds: [...new Set(signals.flatMap((s) => s.sourceRecordIds))].sort(),
    dataInsufficient,
    window,
  };
}
