"use client";

import { DEMO_FACILITY } from "@/lib/demo/hospital-data";
import { formatKst } from "@/lib/demo/clock";
import type { Guardian, Patient } from "@/lib/hospital/types";
import { SECTION_TITLE, type FamilyReport, type ItemOrigin, type ReportStatus } from "@/lib/family-report/types";
import type { Tone } from "@/components/ui/primitives";

export const REPORT_TONE: Record<ReportStatus, Tone> = {
  "작성 중": "outline",
  "검토 중": "amber",
  "승인 완료": "blue",
  "전송 완료": "teal",
  "열람 완료": "green",
  "전송 실패": "red"
};

const ORIGIN_CLASS: Record<ItemOrigin, string> = { "기록 사실": "fact", "자동 집계 초안": "auto", "직원 작성": "staff" };

/** Compact source list for display; the full list stays available as a tooltip. */
export function formatSources(sources: string[]): string {
  if (sources.length <= 3) return sources.join(", ");
  return `${sources[0]} ~ ${sources[sources.length - 1]} (${sources.length}건)`;
}

export function OriginTag({ origin, edited }: { origin: ItemOrigin; edited?: boolean }) {
  return (
    <span className={`origin ${ORIGIN_CLASS[origin]}`}>
      {origin}
      {edited ? " · 직원 수정" : ""}
    </span>
  );
}

export function ReportPreview({ report, patient, guardian }: { report: FamilyReport; patient: Patient; guardian: Guardian }) {
  const items = report.items.filter((i) => i.included);
  const sections = report.categories.filter((c) => c !== "communication");

  return (
    <article className="paper" aria-label="보호자 리포트 미리보기">
      <div className="spread">
        <h1>늘곁 보호자 돌봄 리포트</h1>
        <span className="badge demo">DEMO · 합성 데이터</span>
      </div>
      <p className="muted small">{DEMO_FACILITY.name} · 리포트 ID {report.id}</p>
      <div className="meta">
        <span>환자: {patient.name} ({patient.id})</span>
        <span>보호자: {guardian.name} ({guardian.relationship})</span>
        <span>보고 기간: {report.period.from} ~ {report.period.to}</span>
        <span>상태: {report.status}</span>
        <span>작성: {report.createdBy} · {formatKst(report.createdAt)}</span>
        <span>승인: {report.approvedBy ? `${report.approvedBy} · ${formatKst(report.approvedAt ?? "")}` : "승인 전"}</span>
      </div>
      <p className="small" style={{ background: "#f5f7fa", padding: "6px 8px", borderRadius: 3 }}>
        표기: <OriginTag origin="기록 사실" /> 병원 기록 그대로 · <OriginTag origin="자동 집계 초안" /> 기록을 규칙 기반으로 집계한 초안(AI 요약 아님) · <OriginTag origin="직원 작성" /> 돌봄팀 작성.
        모든 항목은 돌봄팀 검토 후 공유됩니다.
      </p>

      {sections.map((sec) => {
        const secItems = items.filter((i) => i.section === sec);
        if (!secItems.length) return null;
        return (
          <section key={sec}>
            <h2>{SECTION_TITLE[sec]}</h2>
            {secItems.map((i) => (
              <div className="ritem" key={i.id}>
                <span className="lbl">{i.label}</span>
                <span>
                  {i.text || <span className="muted">(내용 없음)</span>}
                  <OriginTag origin={i.origin} edited={i.edited} />
                  {i.incomplete ? <span className="origin auto">데이터 부족</span> : null}
                  {i.sources.length ? <span className="src" style={{ display: "block" }} title={i.sources.join(", ")}>출처: {formatSources(i.sources)}</span> : null}
                </span>
              </div>
            ))}
          </section>
        );
      })}

      {report.categories.includes("communication") ? (
        <section>
          <h2>{SECTION_TITLE.communication}</h2>
          <div className="ritem">
            <span className="lbl">돌봄팀 메시지</span>
            <span>{report.careTeamMessage || <span className="muted">(작성 전)</span>}<OriginTag origin="직원 작성" /></span>
          </div>
          <div className="ritem">
            <span className="lbl">보호자 협조 요청</span>
            <span>{report.familyRequests || <span className="muted">없음</span>}<OriginTag origin="직원 작성" /></span>
          </div>
          <div className="ritem">
            <span className="lbl">담당 부서</span>
            <span>{report.contactDepartment}</span>
          </div>
        </section>
      ) : null}

      <p className="foot">
        이 리포트는 승인된 공유 범위의 요약이며 의무기록 사본이 아닙니다. 진단·치료에 관한 문의는 담당 의료진과 상담해 주세요.
        본 문서는 데모용 합성 데이터로 작성되었습니다.
      </p>
    </article>
  );
}
