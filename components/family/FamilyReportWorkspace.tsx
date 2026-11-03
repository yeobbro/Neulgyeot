"use client";

import { useState } from "react";
import { canShare } from "@/lib/family-report/build";
import { FAMILY_DEMO_DISCLAIMER } from "@/lib/family-report/mock-delivery";
import { FAMILY_CATEGORIES } from "@/lib/family-report/types";
import { formatKst } from "@/lib/demo/clock";
import { sharingKey } from "@/lib/state/hospital-store";
import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "@/components/hospital/HospitalContext";
import { PatientBanner } from "@/components/hospital/PatientBanner";
import { ReportComposer } from "./ReportComposer";
import { DeliveryHistory } from "./DeliveryHistory";
import { SharingSettings } from "./SharingSettings";
import { REPORT_TONE } from "./ReportPreview";

type Tab = "overview" | "compose" | "history" | "sharing";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "보호자 리포트" },
  { id: "compose", label: "리포트 작성" },
  { id: "history", label: "발송 이력" },
  { id: "sharing", label: "보호자 공유 설정" }
];

export function FamilyReportWorkspace() {
  const { patient, state } = useHospital();
  const [tab, setTab] = useState<Tab>("overview");
  const reports = state.reports.filter((r) => r.patientId === patient.id);

  return (
    <>
      <PatientBanner right={<Badge tone="outline">늘곁 패밀리 연동 예정 (미구현)</Badge>} />
      <div className="notice demo" role="note">
        {FAMILY_DEMO_DISCLAIMER} 보호자 리포트는 승인된 범위의 요약만 제공하며 병원 EMR 전체를 공개하지 않습니다.
      </div>

      <div className="panel">
        <div className="tabs" role="tablist" aria-label="보호자 리포트 메뉴">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`fam-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`fam-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const i = TABS.findIndex((x) => x.id === tab);
                const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                setTab(next.id);
                document.getElementById(`fam-tab-${next.id}`)?.focus();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`fam-panel-${tab}`} aria-labelledby={`fam-tab-${tab}`} className="stack">
        {tab === "overview" && (
          <Panel title="보호자 · 공유 현황" id="fam-overview" flush>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>보호자</th>
                    <th>관계</th>
                    <th>권한 구분</th>
                    <th>연락처</th>
                    <th>환자 동의</th>
                    <th>공유 범위</th>
                    <th>공유 상태</th>
                    <th>최근 리포트</th>
                    <th>전송 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {patient.guardians.map((g) => {
                    const s = state.sharing[sharingKey(patient.id, g.id)];
                    const last = reports.find((r) => r.guardianId === g.id);
                    return (
                      <tr key={g.id}>
                        <td>{g.name} <span className="muted small">(가상)</span></td>
                        <td>{g.relationship}</td>
                        <td>
                          <Badge tone={s.authorityVerified ? "teal" : "amber"}>{s.authorityVerified ? g.authority : "권한 확인 전"}</Badge>
                        </td>
                        <td className="mono small">{g.phoneMasked}</td>
                        <td>{s.patientConsent}</td>
                        <td className="small">
                          {s.allowedCategories.length
                            ? FAMILY_CATEGORIES.filter((c) => s.allowedCategories.includes(c.id)).map((c) => c.label).join(", ")
                            : "지정 없음"}
                        </td>
                        <td>
                          <Badge tone={canShare(s) ? "green" : s.status === "철회" ? "red" : "outline"}>{canShare(s) ? "공유 가능" : s.status === "활성" ? "조건 미충족" : s.status}</Badge>
                        </td>
                        <td className="nowrap">{last ? `${last.period.from} ~ ${last.period.to}` : "없음"}</td>
                        <td>{last ? <Badge tone={REPORT_TONE[last.status]}>{last.status}</Badge> : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ padding: "8px 12px" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab("compose")}>리포트 작성</button>
              <button type="button" className="btn btn-sm" onClick={() => setTab("sharing")}>공유 설정 관리</button>
              <span className="hint">
                가족 관계만으로 열람 권한이 생기지 않습니다. 권한 확인과 환자 동의(또는 법정대리인 권한)가 기록된 보호자에게만 공유할 수 있습니다.
                {reports[0] ? ` · 마지막 작성 ${formatKst(reports[0].createdAt)}` : ""}
              </span>
            </div>
          </Panel>
        )}
        {tab === "compose" && <ReportComposer />}
        {tab === "history" && <DeliveryHistory />}
        {tab === "sharing" && <SharingSettings />}
      </div>
    </>
  );
}
