/**
 * DEMO / MOCK municipal referral adapter.
 *
 * Makes NO network calls. Every "response" is a scripted, deterministic demo
 * event and must never be presented as a real municipal receipt.
 *
 * A production adapter would instead run server-side only (never in the
 * browser) and use: OAuth 2.0 client credentials with narrowly scoped access,
 * TLS 1.3, server-to-server authentication, an Idempotency-Key header, schema
 * versioning, a trace ID per request, bounded retries with backoff, audit
 * events, and minimal status callbacks from the municipality. Tokens must never
 * be stored in browser storage or committed to the repository.
 */
import type { ReferralEnvelope, TransferEvent, TransferRecord, TransferStatus } from "./types";
import { validateReferralEnvelope } from "./validation";

export const DEMO_DISCLAIMER = "DEMO 연계 — 실제 지자체 시스템과 연결되어 있지 않습니다.";

export type DemoScenario = "approve" | "infoRequest" | "reject";

/** Deterministic scenario per synthetic patient, so reviewers can see every branch. */
export function scenarioFor(patientId: string): DemoScenario {
  if (patientId === "SYN-P-0002") return "infoRequest";
  if (patientId === "SYN-P-0005") return "reject";
  return "approve";
}

interface ScriptStep {
  status: TransferStatus;
  message: string;
  reason?: string;
}

const SCRIPTS: Record<DemoScenario, ScriptStep[]> = {
  approve: [
    { status: "수신 확인", message: "의뢰서 수신 확인 (모의 응답)" },
    { status: "심사 중", message: "통합돌봄 담당자 배정, 검토 진행 (모의 응답)" },
    { status: "승인", message: "연계 대상 검토 완료, 사례 접수 (모의 응답)" },
    { status: "연계 종료", message: "병원 측 연계 절차 종료. 이후 사례관리는 지자체 시스템에서 진행 (모의 응답)" }
  ],
  infoRequest: [
    { status: "수신 확인", message: "의뢰서 수신 확인 (모의 응답)" },
    { status: "심사 중", message: "통합돌봄 담당자 배정, 검토 진행 (모의 응답)" },
    {
      status: "보완 요청",
      message: "보완 자료 요청 (모의 응답)",
      reason: "주거 장애요인 상세(욕실 구조, 출입구 단차) 및 퇴원 후 식사 준비 가능 여부 보완 요청"
    }
  ],
  reject: [
    { status: "수신 확인", message: "의뢰서 수신 확인 (모의 응답)" },
    { status: "심사 중", message: "통합돌봄 담당자 배정, 검토 진행 (모의 응답)" },
    {
      status: "반려",
      message: "관할 확인 필요로 반려 (모의 응답)",
      reason: "퇴원 후 거주지가 수신 지자체 관할이 아닌 것으로 표시됨 — 주소지 관할 지자체로 재의뢰 필요"
    }
  ]
};

const AFTER_RESUBMIT: ScriptStep[] = [
  { status: "심사 중", message: "보완 자료 확인, 재검토 진행 (모의 응답)" },
  { status: "승인", message: "연계 대상 검토 완료, 사례 접수 (모의 응답)" },
  { status: "연계 종료", message: "병원 측 연계 절차 종료. 이후 사례관리는 지자체 시스템에서 진행 (모의 응답)" }
];

const TERMINAL: TransferStatus[] = ["반려", "연계 종료"];

export interface SubmitOptions {
  idempotencyKey: string;
  traceId: string;
  now: string;
  municipalityName: string;
}

export class MockAdapterError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(message);
    this.name = "MockAdapterError";
  }
}

export interface MunicipalReferralAdapter {
  readonly mode: "demo";
  submit(envelope: ReferralEnvelope, opts: SubmitOptions): Promise<TransferRecord>;
  advance(record: TransferRecord, now: string): Promise<TransferRecord>;
  resubmit(record: TransferRecord, now: string, note: string): Promise<TransferRecord>;
  canAdvance(record: TransferRecord): boolean;
}

function pendingSteps(record: TransferRecord): ScriptStep[] {
  const scenario = scenarioFor(record.patientId);
  if (record.resubmissions > 0) {
    const sinceResubmit = record.events.slice(record.events.map((e) => e.actor).lastIndexOf("병원 (DEMO)") + 1);
    return AFTER_RESUBMIT.slice(sinceResubmit.length);
  }
  const responses = record.events.filter((e) => e.actor === "지자체 모의 응답 (DEMO)").length;
  return SCRIPTS[scenario].slice(responses);
}

function withEvent(record: TransferRecord, event: TransferEvent, reason: string | null): TransferRecord {
  return {
    ...record,
    status: event.status,
    statusUpdatedAt: event.at,
    latestMessage: event.message,
    reason,
    events: [...record.events, event]
  };
}

export function createMockMunicipalAdapter(options: { latencyMs?: number } = {}): MunicipalReferralAdapter {
  const latency = options.latencyMs ?? 450;
  const byIdempotencyKey = new Map<string, TransferRecord>();
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency));

  const canAdvance = (record: TransferRecord): boolean => {
    if (TERMINAL.includes(record.status) || record.status === "보완 요청") return false;
    return pendingSteps(record).length > 0;
  };

  return {
    mode: "demo",
    canAdvance,

    async submit(envelope, opts) {
      await wait();
      const existing = byIdempotencyKey.get(opts.idempotencyKey);
      if (existing) return existing; // idempotent replay: no duplicate transfer

      const issues = validateReferralEnvelope(envelope);
      if (issues.length) throw new MockAdapterError("전송 전 검증 실패", issues);

      const record: TransferRecord = {
        transferId: envelope.transferId,
        patientId: envelope.subject.patientId,
        municipalityCode: envelope.destination.municipalityCode,
        municipalityName: opts.municipalityName,
        submittedAt: opts.now,
        status: "전송 완료",
        statusUpdatedAt: opts.now,
        idempotencyKey: opts.idempotencyKey,
        traceId: opts.traceId,
        schemaVersion: envelope.schemaVersion,
        reason: null,
        latestMessage: "모의 어댑터로 전송 처리 (실제 전송 아님)",
        events: [{ at: opts.now, status: "전송 완료", actor: "병원 (DEMO)", message: "모의 어댑터로 전송 처리 (실제 전송 아님)" }],
        envelope,
        resubmissions: 0
      };
      byIdempotencyKey.set(opts.idempotencyKey, record);
      return record;
    },

    async advance(record, now) {
      await wait();
      if (!canAdvance(record)) return record;
      const [step] = pendingSteps(record);
      return withEvent(record, { at: now, status: step.status, actor: "지자체 모의 응답 (DEMO)", message: step.message }, step.reason ?? null);
    },

    async resubmit(record, now, note) {
      await wait();
      if (record.status !== "보완 요청") return record;
      const next = withEvent(
        record,
        { at: now, status: "전송 완료", actor: "병원 (DEMO)", message: `보완 자료 제출 (DEMO): ${note.trim() || "보완 내용 기재"}` },
        null
      );
      return { ...next, resubmissions: record.resubmissions + 1 };
    }
  };
}
