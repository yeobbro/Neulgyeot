"use client";

import { useMemo, useState } from "react";
import { useHospital } from "@/components/hospital/HospitalContext";
import { PatientBanner } from "@/components/hospital/PatientBanner";
import { Panel } from "@/components/ui/primitives";
import { CareStatusBadge } from "./StatusBadge";
import { buildDailyTimeline, dateRange, isFuture, summarizePeriod, summaryToCsv } from "@/lib/care/timeline";
import { CARE_TYPE_LABEL, CARE_TYPES, TIMELINE_STATUS_LABEL, type TimelineStatus } from "@/lib/care/types";
import { CARE_DEMO_NOW, CARE_DEMO_TODAY, CARE_PLAN, CARE_STAFF } from "@/lib/demo/care-data";

type Range = "day" | "week" | "month";

/** 케어 타임라인 · 주간/월간 리포트 — planned vs recorded, per care type and per staff. */
export function CareTimelineView() {
  const { state, patient } = useHospital();
  const [range, setRange] = useState<Range>("day");
  const slots = useMemo(() => buildDailyTimeline(patient.id, CARE_DEMO_TODAY, CARE_PLAN, state.careEvents, CARE_DEMO_NOW), [patient.id, state.careEvents]);
  const dates = useMemo(() => (range === "week" ? dateRange("2026-10-28", 7) : range === "month" ? dateRange("2026-10-28", 7) : [CARE_DEMO_TODAY]), [range]);
  const summary = useMemo(() => summarizePeriod(patient.id, dates, CARE_PLAN, state.careEvents, CARE_STAFF, CARE_DEMO_NOW), [patient.id, state.careEvents, dates]);

  const download = () => {
    const csv = summaryToCsv(summary, CARE_TYPE_LABEL, { includeStaff: true });
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `neulgyeot-care-${patient.id}-${range}-DEMO.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="care-timeline">
      <PatientBanner />
      <div className="care-seg" role="tablist" aria-label="기간">
        {(["day", "week", "month"] as Range[]).map((r) => (
          <button key={r} role="tab" type="button" aria-selected={range === r} onClick={() => setRange(r)}>{r === "day" ? "일일 타임라인" : r === "week" ? "주간 요약" : "월간 보고서"}</button>
        ))}
        <button type="button" className="btn btn-sm" onClick={download}>CSV 다운로드</button>
      </div>
      {range === "month" && <p className="care-note small">DEMO 데이터는 7일치만 있어 월간 보고서는 최근 7일로 계산돼요. 운영 환경에서는 해당 월 전체를 집계해요.</p>}

      <div className="care-kpis">
        <Kpi label="계획된 업무" value={summary.planned} />
        <Kpi label="수행 기록" value={summary.fulfilled} />
        <Kpi label="기록 누락" value={summary.missing} tone={summary.missing ? "red" : undefined} />
        <Kpi label="독립 검증 비율" value={summary.verifiedRate == null ? "—" : `${Math.round(summary.verifiedRate * 100)}%`} />
        <Kpi label="평균 시간 차" value={summary.avgDelayMin == null ? "—" : `${summary.avgDelayMin}분`} />
      </div>

      {range === "day" && (
        <Panel id="tl-day" title={`일일 케어 타임라인 · ${CARE_DEMO_TODAY}`} flush>
          <ol className="care-tl">
            {slots.map((s) => {
              const future = isFuture(s, CARE_DEMO_NOW);
              const who = s.event ? CARE_STAFF.find((x) => x.id === s.event!.staff_id) : null;
              return (
                <li key={s.key} className={`st-${s.status.replace(/\s/g, "-").toLowerCase()} ${future ? "future" : ""}`}>
                  <span className="t">{(s.planned_at ?? s.event!.performed_at).slice(11, 16)}</span>
                  <span className="what">{CARE_TYPE_LABEL[s.care_type]}{!s.planned_at && <small className="muted"> · 계획 외</small>}</span>
                  <span className="who">{who ? `${who.name} · ${who.role}` : "—"}</span>
                  <span className="delay">{s.delay_min == null ? "" : `실제 ${s.event!.performed_at.slice(11, 16)} (${s.delay_min > 0 ? "+" : ""}${s.delay_min}분)`}</span>
                  <span>{future ? <span className="badge">예정</span> : <CareStatusBadge status={s.status} />}</span>
                </li>
              );
            })}
          </ol>
        </Panel>
      )}

      <div className="care-two">
        <Panel id="tl-type" title="업무별 기록" flush>
          <table className="tbl"><thead><tr><th>항목</th><th className="num">계획</th><th className="num">기록</th><th className="num">누락</th><th className="num">계획 외</th></tr></thead>
            <tbody>{CARE_TYPES.filter((c) => summary.byCareType[c].planned || summary.byCareType[c].adhoc).map((c) => {
              const r = summary.byCareType[c];
              return <tr key={c}><td>{CARE_TYPE_LABEL[c]}</td><td className="num">{r.planned}</td><td className="num">{r.fulfilled}</td><td className="num">{r.missing ? <strong className="txt-red">{r.missing}</strong> : 0}</td><td className="num">{r.adhoc}</td></tr>;
            })}</tbody>
          </table>
        </Panel>
        <Panel id="tl-staff" title="담당자별 기록" flush>
          <table className="tbl"><thead><tr><th>담당자</th><th className="num">기록</th><th className="num">수행자 확인</th><th className="num">독립 검증</th></tr></thead>
            <tbody>{summary.byStaff.map((r) => <tr key={r.staff_id}><td>{r.name}</td><td className="num">{r.events}</td><td className="num">{r.confirmed}</td><td className="num">{r.verified}</td></tr>)}</tbody>
          </table>
        </Panel>
      </div>
      <Panel id="tl-status" title="상태 구분">
        <ul className="care-legend">
          {(Object.keys(TIMELINE_STATUS_LABEL) as TimelineStatus[]).map((s) => <li key={s}><CareStatusBadge status={s} /> <span className="small">{summary.byStatus[s]}건</span></li>)}
        </ul>
        <p className="small muted">‘기록됨’은 태그만 된 상태, ‘수행자 확인’은 수행 직원이 확인한 상태, ‘독립 검증’은 다른 간호사가 확인한 상태예요. 확인되지 않은 업무는 완료로 표시하지 않아요.</p>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "red" }) {
  return <div className={`care-kpi ${tone ?? ""}`}><span className="small muted">{label}</span><strong>{value}</strong></div>;
}
