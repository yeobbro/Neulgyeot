import Link from "next/link";
import { BarList, LineChart, StackedBars } from "@/components/charts";
import { GenerateReportForm } from "@/components/client/forms";
import { DateField, FilterForm, regionOptions, SelectField } from "@/components/filters";
import { DemoBadge, Empty, Heading, Metric, Panel } from "@/components/ui";
import { SERVICE_TYPE_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/constants";
import { fmtDateTime } from "@/lib/format";
import { aiConfigured } from "@/lib/server/ai/client";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { analyticsQuery, analyticsSummary, analyticsTrends } from "@/lib/server/services/analytics";
import { listRegions } from "@/lib/server/services/regions";
import { listReports } from "@/lib/server/services/reports";

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const regions = await listRegions(db);
  const res = await load(async () => {
    const q = analyticsQuery.parse({ from: p.from, to: p.to, regionId: p.regionId, serviceType: p.serviceType });
    const [summary, trends, reports] = await Promise.all([analyticsSummary(db, actor, q), analyticsTrends(db, actor, q), listReports(db, actor)]);
    return { summary, trends, reports };
  });
  const opts = regionOptions(regions, actor.scopeRegionIds);
  return (
    <>
      <Heading kicker="Policy & outcomes" title="정책·성과 분석 및 보고서" actions={<DemoBadge />}>
        모든 지표는 선택한 기간·지역의 DB 집계입니다. 시연용 가상 데이터이므로 실제 성과로 해석할 수 없습니다.
      </Heading>
      <FilterForm action="/care/reports" resetHref="/care/reports">
        <DateField label="시작일" name="from" value={res.ok ? res.data.summary.periodStart : p.from} />
        <DateField label="종료일" name="to" value={res.ok ? res.data.summary.periodEnd : p.to} />
        <SelectField label="지역" name="regionId" value={p.regionId} options={opts} allLabel={actor.role === "admin" ? "전체 지역" : "담당 지역 전체"} />
      </FilterForm>
      {!res.ok ? <p className="cw-msg msg-error" role="alert">{res.message}</p> : (() => {
        const { summary: s, trends, reports } = res.data;
        return (
          <>
            <div className="cw-grid cols-4">
              <Metric label="등록 돌봄 대상자" value={s.recipients} unit="명" />
              <Metric label="확인 필요 사례" value={s.needsReview} unit="건" />
              <Metric label="서비스 미연계 사례" value={s.unconnected} unit="건" />
              <Metric label="미완료 조치" value={s.openTasks} unit="건" note="현재 시점" />
              <Metric label="조치 완료율" value={s.completionRate ?? "—"} unit={s.completionRate === null ? "" : "%"} note={`완료 ${s.tasksCompleted} ÷ 기간 생성 ${s.tasksCreated}`} />
              <Metric label="평균 조치 소요" value={s.avgResolutionDays ?? "—"} unit={s.avgResolutionDays === null ? "" : "일"} note="기간 중 완료된 조치의 생성→완료 평균" />
              <Metric label="기간 생성 조치" value={s.tasksCreated} unit="건" />
              <Metric label="기간 완료(생성분)" value={s.tasksCompleted} unit="건" />
            </div>
            <div className="cw-grid cols-2" style={{ marginTop: 14 }}>
              <Panel title="기간별 추세" hint="주 단위">
                <LineChart
                  title="주별 신규 대상자·조치 생성·완료·서비스 공백"
                  labels={trends.points.map((x) => x.start)}
                  series={[
                    { label: "신규 대상자", color: "#7a6bb0", values: trends.points.map((x) => x.newRecipients) },
                    { label: "생성 조치", color: "#3d6476", values: trends.points.map((x) => x.tasksCreated) },
                    { label: "완료 조치", color: "#2f6b4b", values: trends.points.map((x) => x.tasksCompleted) },
                    { label: "연계 실패·중단(미연계 추세 대리 지표)", color: "#a3412f", values: trends.points.map((x) => x.serviceGaps) },
                  ]}
                />
              </Panel>
              <Panel title="지역별 비교" hint="미연계 사례">
                {s.byRegion.length === 0 ? <Empty>데이터가 없습니다.</Empty> : <BarList title="지역별 미연계 사례" color="#b8574a" rows={s.byRegion.map((g) => ({ label: g.regionName, value: g.unconnected, note: `/ 대상자 ${g.recipients}` }))} />}
              </Panel>
              <Panel title="서비스 유형별 연계 현황">
                {s.referralsByType.length === 0 ? <Empty>연계 데이터가 없습니다.</Empty> : (
                  <StackedBars
                    title="서비스 유형별 연계 상태"
                    parts={[{ label: "진행 중", color: "#3f8a6a" }, { label: "기간 내 실패", color: "#b8574a" }, { label: "현재 중단", color: "#dc9a74" }]}
                    rows={s.referralsByType.map((r) => ({ label: SERVICE_TYPE_LABEL[r.serviceType], values: [r.active, r.failed, r.suspended] }))}
                  />
                )}
              </Panel>
              <Panel title="조치 상태별 분포" hint="기간 중 생성된 조치">
                {s.tasksByStatus.length === 0 ? <Empty>기간 내 조치가 없습니다.</Empty> : <BarList title="조치 상태별 분포" rows={s.tasksByStatus.map((t) => ({ label: TASK_STATUS_LABEL[t.status], value: t.count }))} />}
              </Panel>
              <Panel title="지역 서비스 자원 분포" hint="운영 중 서비스 수">
                {s.resourcesByType.length === 0 ? <Empty>등록된 서비스가 없습니다.</Empty> : <BarList title="서비스 유형별 자원" color="#3d6476" rows={s.resourcesByType.map((r) => ({ label: SERVICE_TYPE_LABEL[r.serviceType], value: r.count }))} />}
                <p className="cw-meta"><Link href="/care/map">지도에서 지역별 자원 보기</Link></p>
              </Panel>
              <Panel title="보고서 생성" hint={aiConfigured() ? "AI 초안 (수치 검증 후 채택)" : "AI 미설정 — 템플릿 보고서"}>
                <GenerateReportForm from={s.periodStart} to={s.periodEnd} regionId={p.regionId} regions={opts} />
                <p className="cw-meta" style={{ marginTop: 8 }}>
                  AI를 쓰는 경우에도 집계값만 입력으로 전달하고, 집계에 없는 숫자가 들어간 초안은 거부하고 템플릿으로 대체합니다.
                </p>
                <h4 style={{ fontSize: 14, margin: "14px 0 6px" }}>최근 보고서</h4>
                {reports.length === 0 ? <p className="cw-meta">아직 생성한 보고서가 없습니다.</p> : (
                  <ul style={{ paddingLeft: 18, margin: 0 }}>
                    {reports.map((r) => <li key={r.id}><Link href={`/care/reports/${r.id}`}>{r.id}</Link> · {r.period_start} ~ {r.period_end} · {r.narrative_method === "ai" ? "AI 초안" : "템플릿"} · {fmtDateTime(r.created_at.toISOString())}</li>)}
                  </ul>
                )}
              </Panel>
            </div>
            <Panel title="지표 정의">
              <dl className="cw-kv">
                <dt>등록 대상자</dt><dd>종결되지 않았고 기간 종료 전에 등록된 대상자 수</dd>
                <dt>확인 필요 사례</dt><dd>대상자별 최신 분석이 우선 확인·확인 권장이며 검토 대기인 대상자 수 (현재 시점)</dd>
                <dt>미연계 사례</dt><dd>등록된 필요 지원 중 의뢰·접수·처리·제공 중 상태의 연계가 하나도 없는 유형이 있는 대상자 수 (현재 시점, 종결 제외)</dd>
                <dt>조치 완료율</dt><dd>기간 중 생성된 조치 가운데 기간 종료 전에 완료된 조치 ÷ 기간 중 생성된 조치. 기간 이전에 생성돼 기간 중 완료된 조치는 분모·분자에 포함하지 않습니다 (중복 집계 방지).</dd>
                <dt>평균 조치 소요</dt><dd>기간 중 완료된 조치의 (완료 시각 − 생성 시각) 평균, 일 단위 소수 1자리</dd>
                <dt>미연계 추세</dt><dd>과거 시점의 미연계 상태는 저장하지 않으므로, 주별 연계 실패·중단 발생 건수를 대리 지표로 표시합니다.</dd>
              </dl>
            </Panel>
          </>
        );
      })()}
    </>
  );
}
