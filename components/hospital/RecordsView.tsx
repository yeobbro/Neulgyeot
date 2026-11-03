"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/hospital/derive";
import { K_ADL_LABEL, type NoteType } from "@/lib/hospital/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { useHospital } from "./HospitalContext";
import { PatientBanner } from "./PatientBanner";

const TYPES: NoteType[] = ["간호", "요양", "재활", "사회복지", "의사"];

export function RecordsView() {
  const { patient: p } = useHospital();
  const [type, setType] = useState<NoteType | "all">("all");
  const notes = [...p.notes].sort((a, b) => b.at.localeCompare(a.at)).filter((n) => type === "all" || n.type === type);

  return (
    <>
      <PatientBanner />
      <Panel
        title="진료·간호·돌봄 기록"
        id="records"
        flush
        actions={
          <>
            <label className="sr-only" htmlFor="rec-type">기록 구분</label>
            <select id="rec-type" className="select" style={{ width: 120 }} value={type} onChange={(e) => setType(e.target.value as NoteType | "all")}>
              <option value="all">전체 구분</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </>
        }
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>기록 ID</th>
                <th>일시</th>
                <th>구분</th>
                <th>내용</th>
                <th>작성자</th>
                <th>보호자 공유</th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">해당 구분의 기록이 없습니다.</td>
                </tr>
              ) : (
                notes.map((n) => (
                  <tr key={n.id}>
                    <td className="mono nowrap">{n.id}</td>
                    <td className="nowrap">{formatDateTime(n.at)}</td>
                    <td><Badge tone="outline">{n.type}</Badge></td>
                    <td>{n.text}</td>
                    <td className="nowrap">{n.author}</td>
                    <td>{n.familyShareable ? <Badge tone="teal">공유 가능</Badge> : <span className="muted small">내부 기록</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ padding: "6px 12px 10px" }}>
          &lsquo;공유 가능&rsquo; 표시는 보호자 리포트 초안에 포함될 수 있는 기록입니다. 내부 기록은 리포트에 포함되지 않습니다.
        </p>
      </Panel>

      <div className="grid-2">
        <Panel title="K-ADL 평가 이력" id="adl-history" flush>
          <table className="tbl">
            <thead>
              <tr>
                <th>평가일</th>
                <th>식사</th>
                <th>이동</th>
                <th>화장실</th>
                <th>평가자</th>
              </tr>
            </thead>
            <tbody>
              {[...p.kAdl].reverse().map((k) => (
                <tr key={k.assessedAt}>
                  <td className="nowrap">{k.assessedAt}</td>
                  <td>{K_ADL_LABEL[k.eating]}</td>
                  <td>{K_ADL_LABEL[k.mobility]}</td>
                  <td>{K_ADL_LABEL[k.toileting]}</td>
                  <td className="small">{k.assessedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="일상생활 기록 (최근 7일)" id="daily" flush>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>일자</th>
                  <th className="num">식사 %</th>
                  <th className="num">수분 mL</th>
                  <th className="num">수면 h</th>
                  <th className="num">활동 분</th>
                  <th className="num">재활</th>
                </tr>
              </thead>
              <tbody>
                {[...p.dailyLiving].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="nowrap">{formatDateTime(d.date)}</td>
                    <td className="num">{d.mealIntakePct ?? <span className="muted">기록 없음</span>}</td>
                    <td className="num">{d.hydrationMl ?? <span className="muted">기록 없음</span>}</td>
                    <td className="num">{d.sleepHours ?? <span className="muted">기록 없음</span>}</td>
                    <td className="num">{d.activityMinutes ?? <span className="muted">기록 없음</span>}</td>
                    <td className="num">{d.rehabSessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
