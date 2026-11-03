"use client";

import type { ReviewNotice } from "@/lib/hospital/alerts";
import { formatKst } from "@/lib/demo/clock";
import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";

export function AlertsView({ notices }: { notices: ReviewNotice[] }) {
  const { patients, state, dispatch } = useHospital();
  const go = (n: ReviewNotice) => {
    dispatch({ type: "selectPatient", patientId: n.patientId });
    dispatch({ type: "setView", view: n.target });
  };
  return (
    <>
      <Panel title={`검토 알림 (${notices.length})`} id="alerts" flush actions={<span className="hint">기록 기반 확인 요청 · 임상적 긴급도 판단 아님</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>구분</th>
                <th>상태</th>
                <th>환자</th>
                <th>내용</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {notices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">확인할 알림이 없습니다.</td>
                </tr>
              ) : (
                notices.map((n) => {
                  const p = patients.find((x) => x.id === n.patientId);
                  return (
                    <tr key={n.id}>
                      <td className="nowrap">{n.kind}</td>
                      <td><Badge tone={n.label === "확인 필요" ? "amber" : "outline"}>{n.label}</Badge></td>
                      <td className="nowrap">{p?.name} <span className="mono muted small">{n.patientId}</span></td>
                      <td>{n.text}</td>
                      <td>
                        <button type="button" className="btn btn-sm" onClick={() => go(n)}>열기</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="감사 기록 (Audit · DEMO 메모리)" id="audit" flush actions={<span className="hint">새로고침 시 초기화</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>일시 (모의 시계)</th>
                <th>분류</th>
                <th>행위</th>
                <th>환자</th>
                <th>대상</th>
              </tr>
            </thead>
            <tbody>
              {state.audit.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">아직 기록된 이벤트가 없습니다.</td>
                </tr>
              ) : (
                state.audit.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.id}</td>
                    <td className="nowrap">{formatKst(a.at)}</td>
                    <td>{a.category}</td>
                    <td>{a.action}</td>
                    <td className="mono small">{a.patientId}</td>
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
