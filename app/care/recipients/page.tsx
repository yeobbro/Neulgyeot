import Link from "next/link";
import { NewRecipientForm } from "@/components/client/forms";
import { FilterForm, regionOptions, SelectField } from "@/components/filters";
import { CareStatusBadge, DemoBadge, Empty, Heading, Pagination, Panel, PriorityBadge } from "@/components/ui";
import { CARE_STATUSES, CARE_STATUS_LABEL, SERVICE_TYPES, SERVICE_TYPE_LABEL } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { listAssignableWorkers, listRecipients, recipientListQuery } from "@/lib/server/services/recipients";
import { listRegions, regionLabel } from "@/lib/server/services/regions";

export default async function RecipientsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const regions = await listRegions(db);
  const workers = await listAssignableWorkers(db, actor);
  const res = await load(() => listRecipients(db, actor, recipientListQuery.parse(p)));
  const dongs = regions.filter((r) => r.level === "eupmyeondong" && (!actor.scopeRegionIds || actor.scopeRegionIds.includes(r.id))).map((r) => ({ id: r.id, label: regionLabel(regions, r.id) }));

  return (
    <>
      <Heading kicker="Case management" title="대상자·사례 관리">
        검색과 필터는 URL에 저장되어 공유할 수 있습니다. 기본 정렬은 최신 분석의 확인 우선순위입니다.
      </Heading>
      <FilterForm action="/care/recipients" resetHref="/care/recipients">
        <label className="cw-field wide">검색 (코드·가명)<input name="q" defaultValue={p.q} placeholder="예: NG-0002" /></label>
        <SelectField label="지역" name="regionId" value={p.regionId} options={regionOptions(regions, actor.scopeRegionIds)} />
        <SelectField label="담당자" name="assignedUserId" value={p.assignedUserId} options={workers.map((w) => ({ value: w.id, label: w.name }))} />
        <SelectField label="필요 서비스" name="serviceType" value={p.serviceType} options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABEL[t] }))} />
        <SelectField label="돌봄 상태" name="status" value={p.status} options={CARE_STATUSES.map((s) => ({ value: s, label: CARE_STATUS_LABEL[s] }))} />
        <SelectField label="미연계" name="unconnected" value={p.unconnected} options={[{ value: "true", label: "미연계만" }, { value: "false", label: "연계됨만" }]} />
        <SelectField label="확인 필요" name="needsReview" value={p.needsReview} options={[{ value: "true", label: "확인 필요만" }, { value: "false", label: "제외" }]} />
        <SelectField label="정렬" name="sort" value={p.sort} allLabel={null} options={[{ value: "priority_desc", label: "확인 우선순위" }, { value: "next_check_asc", label: "다음 확인 일정" }, { value: "updated_desc", label: "최근 갱신" }, { value: "code_asc", label: "코드" }]} />
      </FilterForm>
      {!res.ok ? (
        <p className="cw-msg msg-error" role="alert">{res.message}</p>
      ) : (
        <Panel title="대상자 목록" hint={<DemoBadge />}>
          {res.data.data.length === 0 ? (
            <Empty>조건에 맞는 대상자가 없습니다. 필터를 바꾸거나 초기화하세요.</Empty>
          ) : (
            <div className="cw-table-wrap">
              <table className="cw-table">
                <thead><tr><th>대상자</th><th>지역</th><th>담당자</th><th>돌봄 상태</th><th>확인 우선순위</th><th>필요 지원</th><th>미완료 조치</th><th>다음 확인</th></tr></thead>
                <tbody>
                  {res.data.data.map((r) => (
                    <tr key={r.id}>
                      <td><Link className="row-link" href={`/care/recipients/${r.id}`}>{r.displayCode}</Link><small>{r.displayName} · {r.ageBand ?? "연령대 미상"}</small></td>
                      <td>{regionLabel(regions, r.regionId)}</td>
                      <td>{r.assignedUserName ?? "미지정"}</td>
                      <td><CareStatusBadge status={r.careStatus} /></td>
                      <td><PriorityBadge priority={r.latestPriority} />{r.needsReview && <small>검토 대기</small>}</td>
                      <td>{r.needs.map((n) => SERVICE_TYPE_LABEL[n]).join(", ") || "—"}{r.unconnected && <small style={{ color: "#a3412f" }}>! 미연계 있음</small>}</td>
                      <td>{r.openTasks}</td>
                      <td>{fmtDate(r.nextCheckAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination {...res.data.pagination} base="/care/recipients" params={p} />
        </Panel>
      )}
      <Panel title="새 대상자 등록">
        <details>
          <summary>등록 양식 열기</summary>
          <div style={{ marginTop: 12 }}>
            <NewRecipientForm dongs={dongs} workers={workers} />
          </div>
        </details>
      </Panel>
    </>
  );
}
