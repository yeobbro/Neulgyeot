"use client";

import { formatKst } from "@/lib/demo/clock";
import { sharingKey } from "@/lib/state/hospital-store";
import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "@/components/hospital/HospitalContext";
import { REPORT_TONE } from "./ReportPreview";

export function DeliveryHistory() {
  const { patient, state } = useHospital();
  const reports = state.reports.filter((r) => r.patientId === patient.id);
  const audit = state.audit.filter((a) => a.patientId === patient.id && (a.category === "보호자 리포트" || a.category === "공유 설정"));

  return (
    <>
      <Panel title="리포트 발송 이력" id="fr-history" flush>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>리포트 ID</th>
                <th>보호자</th>
                <th>기간</th>
                <th>상태</th>
                <th>승인</th>
                <th>전송 시도</th>
                <th>최근 전송</th>
                <th>열람</th>
                <th>현재 열람 권한</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">발송 이력이 없습니다.</td>
                </tr>
              ) : (
                reports.map((r) => {
                  const g = patient.guardians.find((x) => x.id === r.guardianId);
                  const s = state.sharing[sharingKey(patient.id, r.guardianId)];
                  const last = r.deliveries[r.deliveries.length - 1];
                  return (
                    <tr key={r.id}>
                      <td className="mono nowrap">{r.id}</td>
                      <td>{g?.name} ({g?.relationship})</td>
                      <td className="nowrap">{r.period.from} ~ {r.period.to}</td>
                      <td><Badge tone={REPORT_TONE[r.status]}>{r.status}</Badge></td>
                      <td className="small">{r.approvedAt ? formatKst(r.approvedAt) : "—"}</td>
                      <td className="num">{r.deliveries.length}</td>
                      <td className="small">{last ? `${formatKst(last.at)} ${last.outcome}` : "—"}</td>
                      <td className="small">{r.openedAt ? formatKst(r.openedAt) : "—"}</td>
                      <td>
                        <Badge tone={s.status === "활성" ? "green" : s.status === "철회" ? "red" : "amber"}>
                          {s.status === "활성" ? "열람 가능" : s.status === "철회" ? "권한 철회됨" : "일시 중지"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="감사 기록 — 생성·승인·전송·열람·철회" id="fr-audit" flush actions={<span className="hint">DEMO 메모리 · 새로고침 시 초기화</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>일시</th>
                <th>분류</th>
                <th>행위</th>
                <th>행위자</th>
                <th>대상</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">기록된 이벤트가 없습니다.</td>
                </tr>
              ) : (
                audit.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{formatKst(a.at)}</td>
                    <td>{a.category}</td>
                    <td>{a.action}</td>
                    <td className="small">{a.actor}</td>
                    <td className="mono small">{a.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
