import Link from "next/link";
import { PrintButton } from "@/components/client/print-button";
import { Badge, DemoBadge, Heading, Panel } from "@/components/ui";
import { SERVICE_TYPE_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/constants";
import { fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load } from "@/lib/server/page";
import { getReport } from "@/lib/server/services/reports";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const { id } = await params;
  const db = await getDb();
  const res = await load(() => getReport(db, actor, id));
  if (!res.ok) return <p className="cw-msg msg-error">{res.message}</p>;
  const r = res.data;
  const s = r.stats;
  const v = r.validation as { aiStatus?: string; unsupportedNumbers?: string[]; error?: string };
  return (
    <>
      <p className="cw-meta no-print"><Link href="/care/reports">← 성과 분석</Link></p>
      <Heading kicker={r.id} title={`늘곁 돌봄 운영 보고서 — ${s.regionName}`} actions={<><DemoBadge /><PrintButton /><a className="btn btn-outline no-print" href={`/api/reports/${r.id}/export?format=csv`}>CSV 내려받기</a></>}>
        기준 기간 {r.periodStart} ~ {r.periodEnd} · 생성 {fmtDateTime(r.createdAt)} · 작성 {r.createdByName ?? "—"}
      </Heading>
      <p className="cw-msg msg-warn">시연용 가상 데이터로 만든 보고서입니다. 실제 정책 판단이나 대외 성과 보고에 사용할 수 없습니다.</p>
      <Panel title="작성 방식">
        {r.narrativeMethod === "ai" ? (
          <Badge tone="ai" icon="✦">AI 초안 — 본문의 모든 숫자가 집계값과 일치함을 확인</Badge>
        ) : (
          <>
            <Badge tone="neutral" icon="▤">템플릿 보고서 — 집계값으로 자동 작성</Badge>
            {v.aiStatus === "rejected" && <p className="cw-msg msg-warn" style={{ marginTop: 8 }}>AI 초안에 집계에 없는 숫자({v.unsupportedNumbers?.join(", ")})가 있어 채택하지 않았습니다.</p>}
            {v.aiStatus === "failed" && <p className="cw-msg msg-warn" style={{ marginTop: 8 }}>AI 초안 생성 실패: {v.error}</p>}
            {v.aiStatus === "not_configured" && <p className="cw-meta">AI API가 설정되지 않았습니다.</p>}
          </>
        )}
        <p className="cw-meta">본문은 담당자가 검토·수정해야 하는 초안입니다.</p>
      </Panel>
      {r.narrative.sections.map((sec) => (
        <Panel key={sec.title} title={sec.title}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{sec.body}</p>
        </Panel>
      ))}
      <Panel title="주요 통계 (집계 원자료)">
        <div className="cw-table-wrap">
          <table className="cw-table">
            <tbody>
              <tr><th>등록 대상자</th><td>{s.recipients}</td><th>확인 필요</th><td>{s.needsReview}</td></tr>
              <tr><th>미연계 사례</th><td>{s.unconnected}</td><th>미완료 조치</th><td>{s.openTasks}</td></tr>
              <tr><th>기간 생성 조치</th><td>{s.tasksCreated}</td><th>그중 완료</th><td>{s.tasksCompleted}</td></tr>
              <tr><th>조치 완료율</th><td>{s.completionRate ?? "산출 불가"}{s.completionRate !== null && "%"}</td><th>평균 조치 소요</th><td>{s.avgResolutionDays ?? "산출 불가"}{s.avgResolutionDays !== null && "일"}</td></tr>
            </tbody>
          </table>
        </div>
        <h4 style={{ fontSize: 14 }}>지역별</h4>
        <div className="cw-table-wrap">
          <table className="cw-table"><thead><tr><th>지역</th><th>대상자</th><th>미연계</th><th>확인 필요</th><th>미완료 조치</th></tr></thead>
            <tbody>{s.byRegion.map((g) => <tr key={g.regionId}><td>{g.regionName}</td><td>{g.recipients}</td><td>{g.unconnected}</td><td>{g.needsReview}</td><td>{g.openTasks}</td></tr>)}</tbody>
          </table>
        </div>
        <h4 style={{ fontSize: 14 }}>서비스 유형별 연계</h4>
        <div className="cw-table-wrap">
          <table className="cw-table"><thead><tr><th>유형</th><th>진행 중</th><th>기간 내 실패</th><th>현재 중단</th></tr></thead>
            <tbody>{s.referralsByType.map((t) => <tr key={t.serviceType}><td>{SERVICE_TYPE_LABEL[t.serviceType]}</td><td>{t.active}</td><td>{t.failed}</td><td>{t.suspended}</td></tr>)}</tbody>
          </table>
        </div>
        <h4 style={{ fontSize: 14 }}>조치 상태 (기간 생성분)</h4>
        <p>{s.tasksByStatus.map((t) => `${TASK_STATUS_LABEL[t.status]} ${t.count}건`).join(" · ") || "없음"}</p>
      </Panel>
    </>
  );
}
