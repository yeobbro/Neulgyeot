"use client";

import { useState } from "react";
import { DEMO_FACILITY, DEMO_STAFF } from "@/lib/demo/hospital-data";
import { demoNow } from "@/lib/demo/clock";
import {
  approvalChecks,
  canShare,
  categorySelectable,
  CONTACT_DEPARTMENT,
  DEFAULT_CATEGORIES,
  generateReportItems,
  periodFor,
  sharingChecks
} from "@/lib/family-report/build";
import { FAMILY_DEMO_DISCLAIMER, simulateDelivery } from "@/lib/family-report/mock-delivery";
import { FAMILY_CATEGORIES, SECTION_TITLE, type FamilyCategory, type FamilyReport, type ReportItem, type ReportPeriodKind } from "@/lib/family-report/types";
import { sharingKey } from "@/lib/state/hospital-store";
import { Badge, Checklist, Panel } from "@/components/ui/primitives";
import { useHospital } from "@/components/hospital/HospitalContext";
import { formatSources, OriginTag, REPORT_TONE, ReportPreview } from "./ReportPreview";

const EDITABLE: FamilyReport["status"][] = ["작성 중", "검토 중", "승인 완료"];

export function ReportComposer() {
  const { patient, state, dispatch } = useHospital();
  const [guardianId, setGuardianId] = useState(patient.guardians[0]?.id ?? "");
  const [kind, setKind] = useState<ReportPeriodKind>("weekly");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "2026-10-30", to: DEMO_FACILITY.today });
  const [selected, setSelected] = useState<FamilyCategory[]>(DEFAULT_CATEGORIES);
  const [activeId, setActiveId] = useState<string | null>(null);

  const guardian = patient.guardians.find((g) => g.id === guardianId) ?? patient.guardians[0];
  const setting = guardian ? state.sharing[sharingKey(patient.id, guardian.id)] : undefined;
  const patientReports = state.reports.filter((r) => r.patientId === patient.id);
  const report = patientReports.find((r) => r.id === activeId) ?? patientReports[0];
  const reportGuardian = report ? patient.guardians.find((g) => g.id === report.guardianId) : undefined;
  const reportSetting = report ? state.sharing[sharingKey(patient.id, report.guardianId)] : undefined;

  if (!guardian || !setting) {
    return <Panel title="리포트 작성" id="compose"><p className="muted">등록된 보호자가 없습니다.</p></Panel>;
  }

  const customInvalid = kind === "custom" && (!custom.from || !custom.to || custom.from > custom.to);
  const chosen = selected.filter((c) => categorySelectable(setting, c));
  const canGenerate = canShare(setting) && chosen.length > 0 && !customInvalid;

  const save = (next: FamilyReport, action: string | null) => dispatch({ type: "upsertReport", report: next, action });

  const generate = () => {
    const period = periodFor(kind, DEMO_FACILITY.today, custom);
    const n = state.reports.filter((r) => r.patientId === patient.id).length + 1;
    const created: FamilyReport = {
      id: `DEMO-FR-${patient.id.slice(-4)}-${String(n).padStart(2, "0")}`,
      patientId: patient.id,
      guardianId: guardian.id,
      period,
      categories: chosen,
      items: generateReportItems(patient, period, chosen),
      careTeamMessage: "",
      familyRequests: "",
      contactDepartment: CONTACT_DEPARTMENT,
      status: "작성 중",
      createdAt: demoNow(state.tick),
      createdBy: `${DEMO_STAFF.currentUser.name} (${DEMO_STAFF.currentUser.role})`,
      reviewConfirmed: false,
      approvedBy: null,
      approvedAt: null,
      deliveries: [],
      openedAt: null
    };
    setActiveId(created.id);
    save(created, "리포트 초안 생성");
  };

  /** Any content change after review/approval drops the report back to an unapproved state. */
  const edit = (patch: Partial<FamilyReport>) => {
    if (!report || !EDITABLE.includes(report.status)) return;
    const base = { ...report, ...patch, reviewConfirmed: patch.reviewConfirmed ?? false };
    const next: FamilyReport =
      report.status === "승인 완료" ? { ...base, status: "작성 중", approvedBy: null, approvedAt: null } : base;
    save(next, report.status === "승인 완료" ? "승인 후 수정 — 승인 해제" : null);
  };
  const editItem = (id: string, patch: Partial<ReportItem>) =>
    report && edit({ items: report.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  const checks = report && reportSetting ? approvalChecks(report, reportSetting) : [];
  const approvable = checks.every((c) => c.ok);
  const editable = report ? EDITABLE.includes(report.status) : false;

  const send = () => {
    if (!report || !reportGuardian || !reportSetting) return;
    if (!canShare(reportSetting)) return;
    const attempt = simulateDelivery(report, reportGuardian, demoNow(state.tick));
    save(
      { ...report, status: attempt.outcome, deliveries: [...report.deliveries, attempt] },
      attempt.outcome === "전송 완료" ? "보호자 모의 전송" : "보호자 모의 전송 실패"
    );
  };

  return (
    <>
      <Panel title="리포트 작성 조건" id="compose-setup">
        <div className="grid-3" style={{ alignItems: "start" }}>
          <div className="field">
            <label htmlFor="fr-guardian">보호자<span className="req">*</span></label>
            <select id="fr-guardian" className="select" value={guardian.id} onChange={(e) => setGuardianId(e.target.value)}>
              {patient.guardians.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.relationship}) — {canShare(state.sharing[sharingKey(patient.id, g.id)]) ? "공유 가능" : "공유 불가"}
                </option>
              ))}
            </select>
            <Checklist checks={sharingChecks(setting)} />
          </div>
          <fieldset>
            <legend>보고 기간<span className="req">*</span></legend>
            <div className="choice-row">
              {(["weekly", "monthly", "custom"] as const).map((k) => (
                <label className="check" key={k}>
                  <input type="radio" name="period" checked={kind === k} onChange={() => setKind(k)} />
                  {{ weekly: "주간", monthly: "월간", custom: "기간 지정" }[k]}
                </label>
              ))}
            </div>
            {kind === "custom" ? (
              <div className="grid-2">
                <input className="input" type="date" aria-label="시작일" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <input className="input" type="date" aria-label="종료일" value={custom.to} max={DEMO_FACILITY.today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </div>
            ) : (
              <span className="hint">
                {periodFor(kind, DEMO_FACILITY.today).from} ~ {DEMO_FACILITY.today}
              </span>
            )}
            {customInvalid ? <span className="err">기간을 올바르게 지정해 주세요.</span> : null}
            {kind === "monthly" ? <span className="hint">데모 데이터는 최근 7일만 있어 부족한 기간은 &lsquo;데이터 부족&rsquo;으로 표시됩니다.</span> : null}
          </fieldset>
          <fieldset>
            <legend>공유 항목<span className="req">*</span></legend>
            <div className="stack" style={{ gap: 3 }}>
              {FAMILY_CATEGORIES.map((c) => {
                const ok = categorySelectable(setting, c.id);
                return (
                  <label key={c.id} className={`check ${ok ? "" : "disabled"}`}>
                    <input
                      type="checkbox"
                      disabled={!ok}
                      checked={ok && selected.includes(c.id)}
                      onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                    />
                    {c.label}
                    {c.sensitive ? <Badge tone="amber">민감</Badge> : null}
                    {!ok ? <span className="hint">{c.sensitive ? "기본 제외 · 공유 설정 검토 필요" : "공유 설정에서 미허용"}</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-primary" disabled={!canGenerate} onClick={generate}>
            합성 기록으로 초안 생성
          </button>
          <span className="hint">초안은 규칙 기반 집계이며 AI 요약이 아닙니다. 기록에 없는 관찰은 만들지 않습니다.</span>
        </div>
      </Panel>

      {report && reportGuardian && reportSetting ? (
        <>
          <Panel
            title={`리포트 검토·편집 — ${report.id}`}
            id="compose-edit"
            actions={
              <>
                {patientReports.length > 1 ? (
                  <select className="select" aria-label="리포트 선택" style={{ width: 170 }} value={report.id} onChange={(e) => setActiveId(e.target.value)}>
                    {patientReports.map((r) => (
                      <option key={r.id} value={r.id}>{r.id} · {r.status}</option>
                    ))}
                  </select>
                ) : null}
                <Badge tone={REPORT_TONE[report.status]}>{report.status}</Badge>
              </>
            }
          >
            <p className="hint" style={{ marginBottom: 6 }}>
              보호자 {reportGuardian.name}({reportGuardian.relationship}) · {report.period.from} ~ {report.period.to} ·{" "}
              {editable ? "항목 문구를 수정하거나 제외할 수 있습니다. 승인 후 수정하면 승인이 해제됩니다." : "전송된 리포트는 수정할 수 없습니다."}
            </p>
            {report.categories
              .filter((c) => c !== "communication")
              .map((sec) => (
                <div key={sec} style={{ marginBottom: 8 }}>
                  <p className="subhead">{SECTION_TITLE[sec]}</p>
                  {report.items
                    .filter((i) => i.section === sec)
                    .map((i) => (
                      <div key={i.id} className={`item-edit ${i.included ? "" : "excluded"}`}>
                        <input
                          type="checkbox"
                          aria-label={`${i.label} 포함`}
                          checked={i.included}
                          disabled={!editable}
                          onChange={(e) => editItem(i.id, { included: e.target.checked })}
                        />
                        <span className="small">
                          <strong>{i.label}</strong>
                          <span style={{ display: "block" }}>
                            <OriginTag origin={i.origin} edited={i.edited} />
                            {i.incomplete ? <span className="origin auto">데이터 부족</span> : null}
                          </span>
                        </span>
                        <span className="stack" style={{ gap: 2 }}>
                          <textarea
                            className="textarea"
                            style={{ minHeight: 36 }}
                            aria-label={`${i.label} 내용`}
                            value={i.text}
                            disabled={!editable || !i.included}
                            placeholder={i.origin === "직원 작성" ? "돌봄팀이 작성하거나 제외해 주세요" : ""}
                            onChange={(e) => editItem(i.id, { text: e.target.value, edited: i.origin !== "직원 작성" })}
                          />
                          <span className="hint" title={i.sources.join(", ")}>출처: {i.sources.length ? formatSources(i.sources) : i.origin === "직원 작성" ? "직원 작성" : "없음"}</span>
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            {report.categories.includes("communication") ? (
              <div className="grid-2">
                <label className="field">
                  <span className="label">돌봄팀 메시지<span className="req">*</span></span>
                  <textarea className="textarea" disabled={!editable} value={report.careTeamMessage} onChange={(e) => edit({ careTeamMessage: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">보호자 협조 요청<span className="opt">선택</span></span>
                  <textarea className="textarea" disabled={!editable} value={report.familyRequests} onChange={(e) => edit({ familyRequests: e.target.value })} />
                  <span className="hint">담당 부서: {report.contactDepartment}</span>
                </label>
              </div>
            ) : null}
            <hr className="divider" />
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div>
                <p className="subhead">승인 조건</p>
                <Checklist checks={checks} />
              </div>
              <div className="stack">
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={!editable || report.status === "승인 완료"}
                    checked={report.reviewConfirmed}
                    onChange={(e) => save({ ...report, reviewConfirmed: e.target.checked }, null)}
                  />
                  모든 항목의 출처와 내용을 확인했으며, 보호자 공유 범위를 벗어난 정보가 없음을 확인합니다.
                </label>
                <div className="row">
                  {report.status === "작성 중" ? (
                    <button type="button" className="btn" onClick={() => save({ ...report, status: "검토 중" }, "리포트 검토 요청")}>
                      검토 요청
                    </button>
                  ) : null}
                  {report.status === "검토 중" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!approvable}
                        onClick={() =>
                          save(
                            { ...report, status: "승인 완료", approvedBy: `${DEMO_STAFF.currentUser.name} (${DEMO_STAFF.currentUser.role})`, approvedAt: demoNow(state.tick) },
                            "리포트 승인"
                          )
                        }
                      >
                        승인
                      </button>
                      <button type="button" className="btn" onClick={() => save({ ...report, status: "작성 중", reviewConfirmed: false }, "검토 반려 — 작성 중으로")}>
                        작성 중으로 되돌리기
                      </button>
                    </>
                  ) : null}
                  {report.status === "승인 완료" || report.status === "전송 실패" ? (
                    <button type="button" className="btn btn-primary" disabled={!canShare(reportSetting)} onClick={send}>
                      {report.status === "전송 실패" ? "재전송 (DEMO)" : "보호자에게 전송 (DEMO)"}
                    </button>
                  ) : null}
                  {report.status === "전송 완료" ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={!canShare(reportSetting)}
                      onClick={() => save({ ...report, status: "열람 완료", openedAt: demoNow(state.tick) }, "보호자 열람 (모의)")}
                    >
                      보호자 열람 시뮬레이션
                    </button>
                  ) : null}
                  <button type="button" className="btn" onClick={() => window.print()}>
                    PDF로 저장 (인쇄)
                  </button>
                </div>
                <span className="hint">{FAMILY_DEMO_DISCLAIMER}</span>
                {!canShare(reportSetting) && report.status !== "작성 중" ? (
                  <div className="notice danger">공유 설정이 활성 상태가 아니어서 전송·열람이 차단됩니다.</div>
                ) : null}
                {report.deliveries.length ? (
                  <ul className="checklist">
                    {report.deliveries.map((d) => (
                      <li key={d.attempt} className={d.outcome === "전송 완료" ? "ok" : "no"}>
                        <span className="mark" aria-hidden="true">{d.outcome === "전송 완료" ? "✓" : "✕"}</span>
                        <span>#{d.attempt} {d.outcome} — {d.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="PDF 미리보기" id="compose-preview" actions={<span className="hint">브라우저 인쇄 → PDF로 저장</span>}>
            <div className="print-area">
              <ReportPreview report={report} patient={patient} guardian={reportGuardian} />
            </div>
          </Panel>
        </>
      ) : (
        <p className="muted">아직 작성된 리포트가 없습니다. 조건을 선택하고 초안을 생성하세요.</p>
      )}
    </>
  );
}
