"use client";

import { WARDS } from "@/lib/demo/hospital-data";
import type { AdmissionStatus } from "@/lib/hospital/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";

const BED_CLASS: Record<AdmissionStatus, string> = { 재원: "s-admitted", "퇴원 예정": "s-discharge", "외출·외박": "s-leave" };

export function WardView() {
  const { patients, state, dispatch } = useHospital();
  const totalBeds = WARDS.reduce((a, w) => a + w.rooms.reduce((b, r) => b + r.beds.length, 0), 0);
  const count = (s: AdmissionStatus) => patients.filter((p) => p.status === s).length;

  const open = (id: string) => {
    dispatch({ type: "selectPatient", patientId: id });
    dispatch({ type: "setView", view: "summary" });
  };

  return (
    <>
      <Panel title="병동 재원 현황 (Census)" id="census" actions={<Badge tone="demo">합성 데이터 · 2026-11-03 기준</Badge>} flush>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>병동</th>
                <th className="num">병상</th>
                <th className="num">재원</th>
                <th className="num">퇴원 예정</th>
                <th className="num">외출·외박</th>
                <th className="num">빈 병상</th>
                <th className="num">가동률</th>
              </tr>
            </thead>
            <tbody>
              {WARDS.map((w) => {
                const beds = w.rooms.reduce((a, r) => a + r.beds.length, 0);
                const ps = patients.filter((p) => p.ward === w.id);
                return (
                  <tr key={w.id}>
                    <td>{w.name} <span className="muted small">{w.floor}</span></td>
                    <td className="num">{beds}</td>
                    <td className="num">{ps.filter((p) => p.status === "재원").length}</td>
                    <td className="num">{ps.filter((p) => p.status === "퇴원 예정").length}</td>
                    <td className="num">{ps.filter((p) => p.status === "외출·외박").length}</td>
                    <td className="num">{beds - ps.length}</td>
                    <td className="num">{Math.round((ps.length / beds) * 100)}%</td>
                  </tr>
                );
              })}
              <tr>
                <th>합계</th>
                <th className="num">{totalBeds}</th>
                <th className="num">{count("재원")}</th>
                <th className="num">{count("퇴원 예정")}</th>
                <th className="num">{count("외출·외박")}</th>
                <th className="num">{totalBeds - patients.length}</th>
                <th className="num">{Math.round((patients.length / totalBeds) * 100)}%</th>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="legend" aria-label="범례">
        <span><i style={{ background: "var(--primary)" }} />재원</span>
        <span><i style={{ background: "var(--teal)" }} />퇴원 예정</span>
        <span><i style={{ background: "#8b8fa3" }} />외출·외박</span>
        <span><i style={{ background: "#eff1f4", border: "1px solid var(--border)" }} />빈 병상</span>
        <span className="muted">침상을 선택하면 환자 요약으로 이동합니다.</span>
      </div>

      {WARDS.map((w) => (
        <Panel key={w.id} title={`${w.name} 병상 배치`} id={`ward-${w.id}`}>
          <div className="ward-grid">
            {w.rooms.map((r) => (
              <div className="room" key={r.room}>
                <div className="room-name">{r.room}호 · {r.beds.length}인실</div>
                <div className="beds">
                  {r.beds.map((b) => {
                    const p = patients.find((x) => x.ward === w.id && x.room === r.room && x.bed === b);
                    if (!p)
                      return (
                        <div key={b} className="bed empty" aria-label={`${r.room}호 ${b}번 빈 병상`}>
                          <span className="b-no">{b}번</span>
                          <span>빈 병상</span>
                        </div>
                      );
                    return (
                      <button
                        key={b}
                        type="button"
                        className={`bed ${BED_CLASS[p.status]} ${p.id === state.selectedPatientId ? "selected" : ""}`}
                        onClick={() => open(p.id)}
                        aria-label={`${r.room}호 ${b}번 ${p.name} ${p.status}`}
                      >
                        <span className="b-no">{b}번 · {p.status}</span>
                        <span className="b-name">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}
