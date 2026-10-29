import Link from "next/link";
import { LineChart } from "@/components/charts";
import { DateField, FilterForm, regionOptions, SelectField } from "@/components/filters";
import { Empty, Heading, Metric, Panel, PriorityBadge } from "@/components/ui";
import { TASK_TYPE_LABEL } from "@/lib/domain/constants";
import { dueLabel, fmtDate, qs } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { analyticsQuery, analyticsSummary, analyticsTrends } from "@/lib/server/services/analytics";
import { listAssessments } from "@/lib/server/services/assessments";
import { syncTaskDueNotifications } from "@/lib/server/services/notifications";
import { listRegions } from "@/lib/server/services/regions";
import { listTasks } from "@/lib/server/services/tasks";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  await syncTaskDueNotifications(db);
  const regions = await listRegions(db);
  const res = await load(async () => {
    const q = analyticsQuery.parse({ from: p.from, to: p.to, regionId: p.regionId });
    const [summary, trends, queue, overdue] = await Promise.all([
      analyticsSummary(db, actor, q),
      analyticsTrends(db, actor, q),
      listAssessments(db, actor, { reviewStatus: "pending", latestOnly: "true", regionId: q.regionId, page: 1, pageSize: 6 }),
      listTasks(db, actor, { overdue: "true", regionId: q.regionId, page: 1, pageSize: 6 }),
    ]);
    return { summary, trends, queue, overdue };
  });

  return (
    <>
      <Heading kicker="Community care overview" title={`${actor.name.replace(/\(가상\)/, "")}님, 오늘 먼저 확인할 사례를 살펴보세요`}>
        모든 수치는 데이터베이스 집계값입니다. 정의는 각 카드 아래와 보고서 화면에 있습니다.
      </Heading>
      <FilterForm action="/care" resetHref="/care">
        <DateField label="시작일" name="from" value={res.ok ? res.data.summary.periodStart : p.from} />
        <DateField label="종료일" name="to" value={res.ok ? res.data.summary.periodEnd : p.to} />
        <SelectField label="지역" name="regionId" value={p.regionId} options={regionOptions(regions, actor.scopeRegionIds)} allLabel={actor.role === "admin" ? "전체 지역" : "담당 지역 전체"} />
      </FilterForm>
      {!res.ok ? (
        <p className="cw-msg msg-error" role="alert">{res.message}</p>
      ) : (
        <Dashboard {...res.data} regionId={p.regionId} />
      )}
    </>
  );
}

function Dashboard({ summary: s, trends, queue, overdue, regionId }: {
  summary: Awaited<ReturnType<typeof analyticsSummary>>;
  trends: Awaited<ReturnType<typeof analyticsTrends>>;
  queue: Awaited<ReturnType<typeof listAssessments>>;
  overdue: Awaited<ReturnType<typeof listTasks>>;
  regionId?: string;
}) {
  return (
    <>
      <div className="cw-grid cols-4">
        <Metric label="등록 돌봄 대상자" value={s.recipients} unit="명" note="종결 제외, 기간 종료 전 등록" href={`/care/recipients${qs({ regionId })}`} />
        <Metric label="확인 필요 사례" value={s.needsReview} unit="건" note="최신 분석이 우선 확인·확인 권장이고 검토 대기" href={`/care/recipients${qs({ regionId, needsReview: "true" })}`} />
        <Metric label="서비스 미연계 사례" value={s.unconnected} unit="건" note="필요 지원 중 진행 중인 연계가 없는 유형 보유" href={`/care/recipients${qs({ regionId, unconnected: "true" })}`} />
        <Metric
          label="조치 완료율"
          value={s.completionRate === null ? "—" : s.completionRate}
          unit={s.completionRate === null ? "" : "%"}
          note={`기간 생성 ${s.tasksCreated}건 중 완료 ${s.tasksCompleted}건 · 미완료 ${s.openTasks}건`}
          href={`/care/tasks${qs({ regionId, status: "active" })}`}
        />
      </div>

      <div className="cw-grid split" style={{ marginTop: 14 }}>
        <div>
          <Panel title="지역별 현황" hint={s.regionName} actions={<Link className="btn btn-outline btn-sm" href={`/care/map${qs({ regionId })}`}>지도에서 보기</Link>}>
            {s.byRegion.length === 0 ? (
              <Empty>선택한 조건에 해당하는 대상자가 없습니다.</Empty>
            ) : (
              <div className="cw-table-wrap">
                <table className="cw-table">
                  <thead><tr><th>지역</th><th>대상자</th><th>미연계</th><th>확인 필요</th><th>미완료 조치</th></tr></thead>
                  <tbody>
                    {s.byRegion.map((g) => (
                      <tr key={g.regionId}>
                        <td><Link className="row-link" href={`/care/recipients${qs({ regionId: g.regionId })}`}>{g.regionName}</Link></td>
                        <td>{g.recipients}</td>
                        <td><Link href={`/care/recipients${qs({ regionId: g.regionId, unconnected: "true" })}`}>{g.unconnected}</Link></td>
                        <td><Link href={`/care/recipients${qs({ regionId: g.regionId, needsReview: "true" })}`}>{g.needsReview}</Link></td>
                        <td>{g.openTasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="주별 추세" hint={`${s.periodStart} ~ ${s.periodEnd}`}>
            <LineChart
              title="주별 조치 생성·완료 및 서비스 공백 발생"
              labels={trends.points.map((x) => x.start)}
              series={[
                { label: "생성된 조치", color: "#3d6476", values: trends.points.map((x) => x.tasksCreated) },
                { label: "완료된 조치", color: "#2f6b4b", values: trends.points.map((x) => x.tasksCompleted) },
                { label: "연계 실패·중단 발생", color: "#a3412f", values: trends.points.map((x) => x.serviceGaps) },
              ]}
            />
          </Panel>
        </div>
        <div>
          <Panel title="검토 대기 분석" hint="우선순위 순" actions={<Link className="btn btn-outline btn-sm" href="/care/signals">전체</Link>}>
            {queue.data.length === 0 ? (
              <Empty>검토를 기다리는 분석 결과가 없습니다.</Empty>
            ) : (
              <ul className="cw-list">
                {queue.data.map((a) => (
                  <li key={a.id}>
                    <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                      <Link className="row-link" href={`/care/assessments/${a.id}`}><b>{a.displayCode}</b></Link>
                      <PriorityBadge priority={a.priority} />
                    </div>
                    <div className="cw-meta">{a.signals.map((x) => x.label).join(" · ") || "신호 없음"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="기한 지난 조치" actions={<Link className="btn btn-outline btn-sm" href={`/care/tasks${qs({ overdue: "true", regionId })}`}>전체</Link>}>
            {overdue.data.length === 0 ? (
              <Empty>기한이 지난 조치가 없습니다.</Empty>
            ) : (
              <ul className="cw-list">
                {overdue.data.map((t) => (
                  <li key={t.id}>
                    <Link className="row-link" href={`/care/tasks?focus=${t.id}`}><b>{t.title}</b></Link>
                    <div className="cw-meta">
                      <span>{t.displayCode}</span>
                      <span>{TASK_TYPE_LABEL[t.taskType]}</span>
                      <span>기한 {fmtDate(t.dueAt)} ({dueLabel(t.dueAt)})</span>
                      <span>담당 {t.assigneeName ?? "미지정"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
