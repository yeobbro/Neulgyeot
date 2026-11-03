"use client";

import { useState } from "react";
import { DEMO_FACILITY, MUNICIPALITIES } from "@/lib/demo/hospital-data";
import { demoNow } from "@/lib/demo/clock";
import { daysBetween } from "@/lib/hospital/derive";
import type { DischargePlan } from "@/lib/hospital/types";
import { createMockMunicipalAdapter, DEMO_DISCLAIMER, MockAdapterError } from "@/lib/integrations/municipal-referral/mock-adapter";
import type { TransferRecord, ValidationIssue } from "@/lib/integrations/municipal-referral/types";
import { buildReferralEnvelope, draftStatus, readinessChecks, validateAssessment } from "@/lib/integrations/municipal-referral/validation";
import { getAssessment, getConsent } from "@/lib/state/hospital-store";
import { Badge, Checklist, KV, Panel } from "@/components/ui/primitives";
import { useHospital } from "@/components/hospital/HospitalContext";
import { PatientBanner } from "@/components/hospital/PatientBanner";
import { AssessmentForm } from "./AssessmentForm";
import { ConsentPanel } from "./ConsentPanel";
import { PayloadPreview } from "./PayloadPreview";
import { TransferTimeline } from "./TransferTimeline";

const adapter = createMockMunicipalAdapter();

const STEPS = [
  { no: 1, label: "퇴원 계획", sub: "환자·퇴원 정보" },
  { no: 2, label: "사회복지 평가", sub: "기능·생활환경" },
  { no: 3, label: "동의·법적 검토", sub: "제3자 제공" },
  { no: 4, label: "전송 데이터", sub: "JSON 미리보기" },
  { no: 5, label: "전송·이력", sub: "모의 연계" }
] as const;

const ACTIVE: TransferRecord["status"][] = ["전송 완료", "수신 확인", "심사 중", "보완 요청", "승인"];

/** Hospital-side coordination status synchronized from the latest (mock) municipal status. */
function syncedCoordination(base: DischargePlan["coordinationStatus"], latest: TransferRecord | undefined): DischargePlan["coordinationStatus"] {
  if (!latest) return base;
  if (latest.status === "승인" || latest.status === "연계 종료") return "완료";
  if (latest.status === "반려") return "연계 준비";
  return "연계 진행";
}

export function DischargeWorkspace() {
  const { patient, patients, state, dispatch } = useHospital();
  const [step, setStep] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; issues: ValidationIssue[] } | null>(null);

  const assessment = getAssessment(state, patient);
  const consent = getConsent(state, patient);
  const transfers = state.transfers.filter((t) => t.patientId === patient.id);
  const latest = transfers[0];
  const locked = Boolean(latest && ACTIVE.includes(latest.status));
  const status = draftStatus(assessment, consent);
  const checks = [
    { id: "dischargeDate", label: "퇴원 예정일 등록", ok: patient.discharge.plannedDate !== null },
    ...readinessChecks(assessment, consent),
    { id: "noActive", label: "진행 중인 연계 건 없음", ok: !locked }
  ];
  const ready = checks.every((c) => c.ok);
  const nextTransferNo = transfers.length + 1;
  const transferId = `DEMO-TR-${patient.id.slice(-4)}-${String(nextTransferNo).padStart(2, "0")}`;
  const envelope = latest && locked ? latest.envelope : buildReferralEnvelope(patient, assessment, consent, { facilityId: DEMO_FACILITY.id, transferId });
  const muni = MUNICIPALITIES.find((m) => m.code === consent.municipalityCode);
  const coordination = syncedCoordination(patient.discharge.coordinationStatus, latest);

  const stepDone: Record<number, boolean> = {
    1: patient.discharge.plannedDate !== null,
    2: validateAssessment(assessment).length === 0 && assessment.savedAt !== null,
    3: status === "전송 준비",
    4: status === "전송 준비",
    5: transfers.length > 0
  };

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const record = await adapter.submit(envelope, {
        idempotencyKey: `idem-${patient.id}-${nextTransferNo}`,
        traceId: `trace-${String(state.tick).padStart(4, "0")}`,
        now: demoNow(state.tick),
        municipalityName: muni?.name ?? consent.municipalityCode
      });
      dispatch({ type: "upsertTransfer", record, action: "지역연계 의뢰 모의 전송" });
    } catch (e) {
      if (e instanceof MockAdapterError) setError({ message: e.message, issues: e.issues });
      else setError({ message: "모의 전송 중 오류가 발생했습니다.", issues: [] });
    } finally {
      setBusy(false);
    }
  };

  const advance = async (t: TransferRecord) => {
    setBusy(true);
    const next = await adapter.advance(t, demoNow(state.tick));
    dispatch({ type: "upsertTransfer", record: next, action: "지자체 모의 상태 수신" });
    setBusy(false);
  };

  const resubmit = async (t: TransferRecord, note: string) => {
    setBusy(true);
    const next = await adapter.resubmit(t, demoNow(state.tick), note);
    dispatch({ type: "upsertTransfer", record: next, action: "보완 자료 모의 제출" });
    setBusy(false);
  };

  const plannedSoon = patients.filter((p) => p.discharge.plannedDate);

  return (
    <>
      <PatientBanner
        right={
          <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
            <Badge tone={status === "전송 준비" ? "green" : status === "동의 확인 필요" ? "amber" : "outline"}>
              {latest ? `연계 상태: ${latest.status}` : `작성 상태: ${status}`}
            </Badge>
            <span className="hint">연계 조정: {coordination}</span>
          </div>
        }
      />
      <div className="notice demo" role="note">{DEMO_DISCLAIMER} 모든 응답은 시나리오에 따른 모의 이벤트이며 실제 접수 확인이 아닙니다.</div>

      <nav className="stepper" aria-label="퇴원·지역연계 단계">
        {STEPS.map((s) => (
          <button
            key={s.no}
            type="button"
            className={`step ${stepDone[s.no] ? "done" : ""}`}
            aria-current={step === s.no ? "step" : undefined}
            onClick={() => setStep(s.no)}
          >
            <span className="step-no">{stepDone[s.no] ? "✓" : s.no}</span>
            <span className="step-label">{s.label}</span>
            <span className="step-sub">{s.sub}</span>
          </button>
        ))}
      </nav>

      {step === 1 && (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <Panel title="1. 퇴원 계획" id="plan">
            {patient.discharge.plannedDate === null ? (
              <div className="notice warn" style={{ marginBottom: 10 }}>퇴원 예정일이 등록되지 않은 환자입니다. 지역연계 전송을 시작할 수 없습니다.</div>
            ) : null}
            <KV
              items={[
                ["환자", `${patient.name} (${patient.id})`],
                ["생년월일", patient.birthDate],
                ["병동/침상", `${patient.ward} ${patient.room}-${patient.bed}`],
                ["퇴원 예정일", patient.discharge.plannedDate ? `${patient.discharge.plannedDate} (D-${daysBetween(DEMO_FACILITY.today, patient.discharge.plannedDate)})` : "미정"],
                ["예상 거주지", patient.discharge.destination],
                ["담당 사회복지사", patient.discharge.socialWorker],
                ["연계 조정 상태", <Badge key="c" tone={coordination === "완료" ? "green" : coordination === "계획 전" ? "outline" : "blue"}>{coordination}</Badge>],
                ["관할 지자체", `${patient.discharge.municipalityName} (${patient.discharge.municipalityCode})`]
              ]}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(2)} disabled={patient.discharge.plannedDate === null}>
                사회복지 평가로 →
              </button>
            </div>
          </Panel>
          <Panel title="퇴원 예정 환자" id="planned" flush>
            <table className="tbl">
              <thead>
                <tr>
                  <th>환자</th>
                  <th>퇴원 예정</th>
                  <th>담당</th>
                  <th>작성 상태</th>
                </tr>
              </thead>
              <tbody>
                {plannedSoon.map((p) => {
                  const t = state.transfers.find((x) => x.patientId === p.id);
                  return (
                    <tr key={p.id} style={p.id === patient.id ? { background: "var(--primary-soft)" } : undefined}>
                      <td>
                        <button type="button" className="btn-link" onClick={() => dispatch({ type: "selectPatient", patientId: p.id })}>
                          {p.name}
                        </button>{" "}
                        <span className="mono muted small">{p.id}</span>
                      </td>
                      <td>{p.discharge.plannedDate}</td>
                      <td>{p.discharge.socialWorker}</td>
                      <td>
                        {t ? <Badge tone="blue">{t.status}</Badge> : <Badge tone="outline">{draftStatus(getAssessment(state, p), getConsent(state, p))}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {step === 2 && (
        <AssessmentForm
          patient={patient}
          value={assessment}
          locked={locked}
          onChange={(patch) => dispatch({ type: "updateAssessment", patient, patch })}
          onSave={() => dispatch({ type: "saveAssessment", patient })}
        />
      )}

      {step === 3 && (
        <ConsentPanel
          patient={patient}
          value={consent}
          locked={locked}
          onChange={(patch) => dispatch({ type: "updateConsent", patient, patch })}
          onWithdraw={(withdrawn) => dispatch({ type: "setConsentWithdrawn", patient, withdrawn })}
        />
      )}

      {step === 4 && <PayloadPreview envelope={envelope} />}

      {step === 5 && (
        <>
          <Panel title="5. 지자체 연계 전송 (DEMO)" id="send">
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div>
                <p className="subhead">전송 조건</p>
                <Checklist checks={checks} />
              </div>
              <div className="stack">
                <KV
                  items={[
                    ["전송 ID", <span key="t" className="mono">{locked && latest ? latest.transferId : transferId}</span>],
                    ["수신", `${muni?.name ?? "-"} · ${consent.recipientOrganization}`],
                    ["스키마", `v${envelope.schemaVersion} · ${envelope.eventType}`],
                    ["포함 범위", `${envelope.consent.scope.length}개 항목`],
                    ["연결 방식", "모의 어댑터 (네트워크 호출 없음)"]
                  ]}
                />
                <div className="notice demo">{DEMO_DISCLAIMER}</div>
                <div>
                  <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={send} aria-describedby="send-hint">
                    {busy ? "모의 전송 중…" : "지자체로 의뢰 전송 (DEMO)"}
                  </button>
                </div>
                <span id="send-hint" className="hint">
                  {ready ? "모든 데모 조건이 충족되었습니다." : "모든 조건이 충족되어야 전송 버튼이 활성화됩니다."}
                </span>
                {error ? (
                  <div className="notice danger" role="alert">
                    {error.message}
                    {error.issues.length ? ` — ${error.issues.map((i) => i.path).join(", ")}` : ""}
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>
          <TransferTimeline transfers={transfers} busy={busy} canAdvance={adapter.canAdvance} onAdvance={advance} onResubmit={resubmit} />
        </>
      )}

      {step !== 5 && transfers.length > 0 ? (
        <p className="hint">
          최근 연계: <span className="mono">{latest.transferId}</span> · {latest.status} —{" "}
          <button type="button" className="btn-link" onClick={() => setStep(5)}>이력 보기</button>
        </p>
      ) : null}
    </>
  );
}
