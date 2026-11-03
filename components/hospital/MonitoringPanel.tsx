"use client";

import { formatDateTime, latestVital } from "@/lib/hospital/derive";
import type { VitalSign } from "@/lib/hospital/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";
import { Sparkline } from "./Sparkline";

type VitalKey = "bp" | "pulse" | "temp" | "spo2";

const VITALS: { key: VitalKey; name: string; unit: string; color: string; domain: [number, number]; series: (v: VitalSign) => number | null; show: (v: VitalSign) => string | null }[] = [
  { key: "bp", name: "혈압 (수축기/이완기)", unit: "mmHg", color: "#1c5db8", domain: [90, 170], series: (v) => v.sbp, show: (v) => (v.sbp !== null && v.dbp !== null ? `${v.sbp}/${v.dbp}` : null) },
  { key: "pulse", name: "맥박", unit: "회/분", color: "#0b7377", domain: [50, 110], series: (v) => v.pulse, show: (v) => (v.pulse !== null ? String(v.pulse) : null) },
  { key: "temp", name: "체온", unit: "°C", color: "#8a5a00", domain: [35.5, 38], series: (v) => v.temp, show: (v) => (v.temp !== null ? v.temp.toFixed(1) : null) },
  { key: "spo2", name: "SpO₂", unit: "%", color: "#5b4a9e", domain: [88, 100], series: (v) => v.spo2, show: (v) => (v.spo2 !== null ? String(v.spo2) : null) }
];

export function MonitoringPanel() {
  const { patient: p, state, dispatch } = useHospital();
  const last = latestVital(p);
  const today = p.vitals[p.vitals.length - 1];
  const todayMissing = today && today.sbp === null && today.pulse === null && today.temp === null && today.spo2 === null;

  return (
    <aside className="col col-right" aria-label="측정 기록 및 검토">
      <Panel
        title="최근 측정 (활력징후)"
        id="vitals"
        flush
        actions={<Badge tone="outline">수기 입력 기록</Badge>}
      >
        {todayMissing ? (
          <div style={{ padding: "8px 12px 0" }}>
            <div className="notice warn">오늘 측정 기록 없음 · 마지막 기록 {last ? formatDateTime(last.at) : "없음"}</div>
          </div>
        ) : null}
        {VITALS.map((v) => {
          const latestWithValue = [...p.vitals].reverse().find((r) => v.show(r) !== null);
          return (
            <div className="vital" key={v.key}>
              <span className="vital-name">{v.name}</span>
              <span className="vital-value">
                {latestWithValue ? (
                  <>
                    {v.show(latestWithValue)}
                    <small>{v.unit}</small>
                  </>
                ) : (
                  <Badge tone="amber">기록 없음</Badge>
                )}
              </span>
              <Sparkline values={p.vitals.map(v.series)} label={v.name} color={v.color} domain={v.domain} />
              <span className="vital-meta">
                <span>최근 측정 {latestWithValue ? formatDateTime(latestWithValue.at) : "—"}</span>
                <span>{p.vitals.length}회 중 {p.vitals.filter((r) => v.series(r) !== null).length}회 기록</span>
              </span>
            </div>
          );
        })}
        <p className="hint" style={{ padding: "6px 12px 10px" }}>
          출처: {last?.source ?? "—"} · 측정자 {last?.recordedBy ?? "—"}. 고정 예시값이며 실시간 기기 연동이 아닙니다.
        </p>
      </Panel>

      <Panel title="측정 이력" id="vital-history" flush>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>일시</th>
                <th className="num">BP</th>
                <th className="num">PR</th>
                <th className="num">BT</th>
                <th className="num">SpO₂</th>
              </tr>
            </thead>
            <tbody>
              {[...p.vitals].reverse().map((v) => (
                <tr key={v.id}>
                  <td className="nowrap">{formatDateTime(v.at)}</td>
                  {v.sbp === null && v.pulse === null && v.temp === null && v.spo2 === null ? (
                    <td colSpan={4} className="muted">기록 없음</td>
                  ) : (
                    <>
                      <td className="num">{v.sbp !== null ? `${v.sbp}/${v.dbp}` : "—"}</td>
                      <td className="num">{v.pulse ?? "—"}</td>
                      <td className="num">{v.temp?.toFixed(1) ?? "—"}</td>
                      <td className="num">{v.spo2 ?? "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="관찰 변화 · 검토 알림" id="signals" flush actions={<span className="hint">개인 기준선 비교</span>}>
        {p.signals.length === 0 ? (
          <p className="muted" style={{ padding: "10px 12px" }}>검토할 관찰 변화 기록이 없습니다.</p>
        ) : (
          p.signals.map((s) => {
            const reviewed = state.reviewedSignals.includes(s.id);
            return (
              <article className="signal" key={s.id}>
                <div className="spread">
                  <Badge tone={reviewed ? "green" : s.status === "데이터 부족" ? "outline" : "amber"}>{reviewed ? "검토 완료" : s.status}</Badge>
                  <span className="hint">{s.domain}</span>
                </div>
                <p className="signal-title">{s.title}</p>
                <dl>
                  <dt>최근값</dt>
                  <dd>{s.value} <span className="muted">({s.period})</span></dd>
                  <dt>기준</dt>
                  <dd>{s.baseline}</dd>
                  <dt>근거</dt>
                  <dd>{s.evidence}</dd>
                  <dt>출처</dt>
                  <dd>{s.source}</dd>
                </dl>
                {!reviewed ? (
                  <div>
                    <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: "reviewSignal", patientId: p.id, signalId: s.id })}>
                      검토 완료 표시
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
        <p className="hint" style={{ padding: "6px 12px 10px" }}>변화 신호는 검토 요청이며 진단·응급 판단이 아닙니다.</p>
      </Panel>
    </aside>
  );
}
