import Link from "next/link";
import { CareMap, type MapRegion } from "@/components/client/care-map";
import { DateField, FilterForm, SelectField } from "@/components/filters";
import { CareStatusBadge, Empty, Heading, Panel, PriorityBadge } from "@/components/ui";
import { SERVICE_TYPES, SERVICE_TYPE_LABEL, TASK_STATUS_LABEL, TASK_STATUSES, type ServiceType } from "@/lib/domain/constants";
import { qs } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { analyticsQuery, mapCoverage } from "@/lib/server/services/analytics";
import { listProviders } from "@/lib/server/services/care-services";
import { listRecipients } from "@/lib/server/services/recipients";

const METRICS = {
  unconnected: "미연계 사례",
  needsReview: "확인 필요 사례",
  openTasks: "미완료 조치",
  recipients: "등록 대상자",
} as const;
type MetricKey = keyof typeof METRICS;

export default async function MapPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const metric: MetricKey = (p.metric as MetricKey) in METRICS ? (p.metric as MetricKey) : "unconnected";
  const res = await load(async () => {
    const q = analyticsQuery.parse({ from: p.from, to: p.to, serviceType: p.serviceType, unconnected: p.unconnected, needsReview: p.needsReview, taskStatus: p.taskStatus });
    const coverage = await mapCoverage(db, actor, q);
    const providers = await listProviders(db, actor, { serviceType: q.serviceType });
    const selected = p.regionId ? [...coverage.dongs, ...coverage.districts].find((r) => r.regionId === p.regionId) ?? null : null;
    const recipients = selected
      ? await listRecipients(db, actor, { regionId: selected.regionId, serviceType: q.serviceType, unconnected: q.unconnected, needsReview: q.needsReview, sort: "priority_desc", page: 1, pageSize: 10 })
      : null;
    return { coverage, providers, selected, recipients };
  });

  const keep = { from: p.from, to: p.to, serviceType: p.serviceType, unconnected: p.unconnected, needsReview: p.needsReview, taskStatus: p.taskStatus, metric };

  return (
    <>
      <Heading kicker="Care map" title="지자체 통합 돌봄 지도">
        지역별 돌봄 수요, 서비스 자원, 미연계·확인 필요 사례를 함께 봅니다. 지역을 누르면 해당 지역의 통계와 대상자 목록이 표시됩니다.
      </Heading>
      <FilterForm action="/care/map" resetHref="/care/map">
        <DateField label="시작일" name="from" value={res.ok ? res.data.coverage.period.from : p.from} />
        <DateField label="종료일" name="to" value={res.ok ? res.data.coverage.period.to : p.to} />
        <SelectField label="지도 색 기준" name="metric" value={metric} allLabel={null} options={Object.entries(METRICS).map(([value, label]) => ({ value, label }))} />
        <SelectField label="서비스 유형" name="serviceType" value={p.serviceType} options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABEL[t] }))} />
        <SelectField label="미연계 여부" name="unconnected" value={p.unconnected} options={[{ value: "true", label: "미연계 사례만" }, { value: "false", label: "연계된 사례만" }]} />
        <SelectField label="확인 필요" name="needsReview" value={p.needsReview} options={[{ value: "true", label: "확인 필요만" }, { value: "false", label: "확인 필요 제외" }]} />
        <SelectField label="조치 상태" name="taskStatus" value={p.taskStatus} options={[{ value: "active", label: "미완료 전체" }, ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))]} />
        {p.regionId && <input type="hidden" name="regionId" value={p.regionId} />}
      </FilterForm>
      {!res.ok ? (
        <p className="cw-msg msg-error" role="alert">{res.message}</p>
      ) : (
        <MapBody {...res.data} metric={metric} keep={keep} selectedId={p.regionId} />
      )}
    </>
  );
}

function MapBody({ coverage, providers, selected, recipients, metric, keep, selectedId }: {
  coverage: Awaited<ReturnType<typeof mapCoverage>>;
  providers: Awaited<ReturnType<typeof listProviders>>;
  selected: Awaited<ReturnType<typeof mapCoverage>>["dongs"][number] | null;
  recipients: Awaited<ReturnType<typeof listRecipients>> | null;
  metric: MetricKey;
  keep: Record<string, string | undefined>;
  selectedId?: string;
}) {
  const districtName = (id: string | null) => coverage.districts.find((d) => d.regionId === id)?.regionName ?? "";
  const mapRegions: MapRegion[] = coverage.dongs.map((d) => ({
    id: d.regionId,
    name: d.regionName,
    parentName: districtName(d.parentId),
    polygon: d.boundary?.coordinates?.[0] ?? null,
    value: d[metric],
    recipients: d.recipients,
    unconnected: d.unconnected,
    needsReview: d.needsReview,
    openTasks: d.openTasks,
  }));
  const visibleDongs = new Set(coverage.dongs.map((d) => d.regionId));
  const mapProviders = providers
    .filter((p) => visibleDongs.has(p.regionId))
    .map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, types: p.serviceTypes.map((t) => SERVICE_TYPE_LABEL[t]).join(", ") }));

  if (coverage.dongs.length === 0) return <Empty>표시할 지역이 없습니다. 지역 데이터가 등록되었는지 확인하세요.</Empty>;

  return (
    <div className="cw-grid split">
      <div>
        <Panel title="지도" hint={`색 기준: ${METRICS[metric]}`}>
          <CareMap regions={mapRegions} providers={mapProviders} metricLabel={METRICS[metric]} selectedId={selectedId} />
        </Panel>
        <Panel title="지역별 목록" hint="지도를 쓸 수 없을 때도 같은 정보를 제공합니다">
          <div className="cw-table-wrap">
            <table className="cw-table">
              <thead><tr><th>지역</th><th>대상자</th><th>미연계</th><th>확인 필요</th><th>미완료 조치</th><th>조치 완료율</th><th>서비스 자원</th></tr></thead>
              <tbody>
                {coverage.districts.flatMap((g) => [
                  <tr key={g.regionId} style={{ background: "#f6f8f3" }}>
                    <td><Link className="row-link" href={`/care/map${qs({ ...keep, regionId: g.regionId })}`}>{g.regionName} (구 합계)</Link></td>
                    <td>{g.recipients}</td><td>{g.unconnected}</td><td>{g.needsReview}</td><td>{g.openTasks}</td>
                    <td>{g.completionRate === null ? "—" : `${g.completionRate}%`}</td><td>{g.resourceTotal}</td>
                  </tr>,
                  ...coverage.dongs.filter((d) => d.parentId === g.regionId).map((d) => (
                    <tr key={d.regionId} aria-current={selectedId === d.regionId ? "true" : undefined}>
                      <td>　<Link href={`/care/map${qs({ ...keep, regionId: d.regionId })}`}>{d.regionName}</Link></td>
                      <td>{d.recipients}</td><td>{d.unconnected}</td><td>{d.needsReview}</td><td>{d.openTasks}</td>
                      <td>{d.completionRate === null ? "—" : `${d.completionRate}%`}</td><td>{d.resourceTotal}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <p className="cw-meta">조치 완료율 = 기간 중 생성된 조치 가운데 기간 종료 전 완료된 비율. 서비스 자원 = 해당 지역을 제공 지역에 포함한 운영 중 서비스 수.</p>
        </Panel>
      </div>
      <div>
        {!selected ? (
          <Panel title="지역 상세">
            <Empty>지도나 목록에서 지역을 선택하세요.</Empty>
          </Panel>
        ) : (
          <>
            <Panel title={selected.regionName} hint={selected.level === "sigungu" ? "구 합계" : districtName(selected.parentId)} actions={<Link className="btn btn-outline btn-sm" href={`/care/map${qs({ ...keep })}`}>선택 해제</Link>}>
              <dl className="cw-kv">
                <dt>등록 대상자</dt><dd>{selected.recipients}명</dd>
                <dt>미연계 사례</dt><dd>{selected.unconnected}건</dd>
                <dt>확인 필요 사례</dt><dd>{selected.needsReview}건</dd>
                <dt>미완료 조치</dt><dd>{selected.openTasks}건</dd>
                <dt>조치 완료율</dt><dd>{selected.completionRate === null ? "기간 내 생성 조치 없음" : `${selected.completionRate}% (${selected.tasksCompleted}/${selected.tasksCreated})`}</dd>
              </dl>
              <h4 style={{ margin: "14px 0 6px", fontSize: 14 }}>서비스 유형별 자원</h4>
              {Object.keys(selected.resources).length === 0 ? (
                <p className="cw-msg msg-warn">이 지역을 제공 지역으로 등록한 운영 중 서비스가 없습니다.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(Object.entries(selected.resources) as [ServiceType, number][]).map(([t, n]) => <li key={t}>{SERVICE_TYPE_LABEL[t]} {n}개</li>)}
                </ul>
              )}
            </Panel>
            <Panel title="이 지역 대상자" hint="확인 우선순위 순 · 상위 10명" actions={<Link className="btn btn-outline btn-sm" href={`/care/recipients${qs({ regionId: selected.regionId, serviceType: keep.serviceType, unconnected: keep.unconnected, needsReview: keep.needsReview })}`}>전체 목록</Link>}>
              {!recipients || recipients.data.length === 0 ? (
                <Empty>조건에 맞는 대상자가 없습니다.</Empty>
              ) : (
                <ul className="cw-list">
                  {recipients.data.map((r) => (
                    <li key={r.id}>
                      <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                        <Link className="row-link" href={`/care/recipients/${r.id}`}><b>{r.displayCode}</b> {r.displayName}</Link>
                        <PriorityBadge priority={r.latestPriority} />
                      </div>
                      <div className="cw-meta">
                        <CareStatusBadge status={r.careStatus} />
                        {r.unconnected && <span>미연계 있음</span>}
                        <span>{r.needs.map((n) => SERVICE_TYPE_LABEL[n]).join(", ")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
