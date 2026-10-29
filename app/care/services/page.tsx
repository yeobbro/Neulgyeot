import Link from "next/link";
import { MatchPanel, ReferralStatusForm } from "@/components/client/forms";
import { FilterForm, regionOptions, SelectField } from "@/components/filters";
import { Badge, DemoBadge, Empty, Heading, Pagination, Panel, ReferralStatusBadge, Tabs } from "@/components/ui";
import { AVAILABILITY_LABEL, REFERRAL_STATUSES, REFERRAL_STATUS_LABEL, SERVICE_TYPES, SERVICE_TYPE_LABEL, type ServiceType } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { listReferrals, listServices, referralListQuery, serviceListQuery } from "@/lib/server/services/care-services";
import { listRecipients } from "@/lib/server/services/recipients";
import { listRegions, regionLabel } from "@/lib/server/services/regions";

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker", "provider"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const isProvider = actor.role === "provider";
  const tab = isProvider ? "referrals" : (p.tab ?? (p.recipientId ? "match" : "catalog"));
  const regions = await listRegions(db);
  const tabs = isProvider
    ? [{ id: "referrals", label: "우리 기관 의뢰" }]
    : [{ id: "catalog", label: "서비스 카탈로그" }, { id: "match", label: "서비스 매칭" }, { id: "referrals", label: "의뢰·연계 현황" }];

  return (
    <>
      <Heading kicker="Service coordination" title={isProvider ? "서비스 의뢰 접수·처리" : "AI 복지·돌봄 서비스 매칭"}>
        {isProvider
          ? "우리 기관으로 온 의뢰만 표시됩니다. 대상자의 상담 기록·분석 내용은 보이지 않습니다."
          : "후보는 결정적 규칙으로 걸러내며, 확인되지 않은 자격·수용 조건은 사실로 표시하지 않습니다. 의뢰 전 담당자 확인이 필요합니다."}
      </Heading>
      <Tabs tabs={tabs} current={tab} base="/care/services" />
      {tab === "catalog" && <Catalog p={p} regions={regions} actorScope={actor.scopeRegionIds} />}
      {tab === "match" && <Match p={p} />}
      {tab === "referrals" && <Referrals p={p} isProvider={isProvider} />}
    </>
  );

  async function Catalog({ p, regions, actorScope }: { p: Record<string, string | undefined>; regions: Awaited<ReturnType<typeof listRegions>>; actorScope: string[] | null }) {
    const res = await load(() => listServices(db, actor, serviceListQuery.parse(p)));
    return (
      <>
        <FilterForm action="/care/services" resetHref="/care/services?tab=catalog">
          <input type="hidden" name="tab" value="catalog" />
          <label className="cw-field wide">검색<input name="q" defaultValue={p.q} /></label>
          <SelectField label="서비스 유형" name="serviceType" value={p.serviceType} options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABEL[t] }))} />
          <SelectField label="제공 지역" name="regionId" value={p.regionId} options={regionOptions(regions, actorScope === null ? null : regions.map((r) => r.id))} />
        </FilterForm>
        {!res.ok ? <p className="cw-msg msg-error">{res.message}</p> : (
          <Panel title={`서비스 ${res.data.length}개`} hint={<DemoBadge />}>
            {res.data.length === 0 ? <Empty>조건에 맞는 서비스가 없습니다.</Empty> : (
              <div className="cw-table-wrap">
                <table className="cw-table">
                  <thead><tr><th>서비스</th><th>유형</th><th>제공 지역</th><th>이용 조건</th><th>운영·수용</th><th>신청 방법</th><th>출처·갱신</th></tr></thead>
                  <tbody>
                    {res.data.map((s) => (
                      <tr key={s.id}>
                        <td><b>{s.name}</b><small>{s.providerName} · {s.id}</small></td>
                        <td>{SERVICE_TYPE_LABEL[s.serviceType]}</td>
                        <td>{s.serviceRegionIds.map((id) => regionLabel(regions, id)).join(", ")}</td>
                        <td>{eligibilityText(s.eligibility)}</td>
                        <td>{s.isOperating ? "운영 중" : "운영 중단"}<small>{AVAILABILITY_LABEL[s.capacityStatus]} · {s.capacityVerified ? "기관 확인" : "미확인(가상)"}</small></td>
                        <td>{s.applicationMethod}<small>{s.scheduleLabel}</small></td>
                        <td>{s.dataSource}<small>{fmtDate(s.sourceUpdatedAt)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </>
    );
  }

  async function Match({ p }: { p: Record<string, string | undefined> }) {
    const res = await load(() => listRecipients(db, actor, { sort: "priority_desc", page: 1, pageSize: 100, unconnected: p.onlyUnconnected === "false" ? undefined : "true" }));
    const selected = p.recipientId;
    const types = (p.serviceType ? [p.serviceType] : []) as ServiceType[];
    return (
      <div className="cw-grid split">
        <Panel title="대상자 선택">
          <form method="get" action="/care/services" className="cw-form">
            <input type="hidden" name="tab" value="match" />
            <label className="cw-field">대상자 (미연계 사례 우선)
              <select name="recipientId" defaultValue={selected ?? ""} required>
                <option value="" disabled>선택</option>
                {res.ok && res.data.data.map((r) => <option key={r.id} value={r.id}>{r.displayCode} · {r.displayName} — {r.needs.map((n) => SERVICE_TYPE_LABEL[n]).join(", ")}</option>)}
                {selected && res.ok && !res.data.data.some((r) => r.id === selected) && <option value={selected}>{selected}</option>}
              </select>
            </label>
            <SelectField label="특정 유형만 (선택)" name="serviceType" value={p.serviceType} options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABEL[t] }))} />
            {p.taskId && <input type="hidden" name="taskId" value={p.taskId} />}
            <button className="btn btn-primary">대상자 선택</button>
          </form>
          {selected && <p className="cw-meta" style={{ marginTop: 10 }}><Link href={`/care/recipients/${selected}?tab=services`}>대상자 서비스 이력 보기</Link></p>}
        </Panel>
        <Panel title="추천 후보">
          {selected ? <MatchPanel key={`${selected}-${types.join()}`} recipientId={selected} taskId={p.taskId} initialTypes={types} /> : <Empty>왼쪽에서 대상자를 선택하세요.</Empty>}
        </Panel>
      </div>
    );
  }

  async function Referrals({ p, isProvider }: { p: Record<string, string | undefined>; isProvider: boolean }) {
    const res = await load(() => listReferrals(db, actor, referralListQuery.parse(p)));
    return (
      <>
        <FilterForm action="/care/services" resetHref="/care/services?tab=referrals">
          <input type="hidden" name="tab" value="referrals" />
          <SelectField label="상태" name="status" value={p.status} options={REFERRAL_STATUSES.map((s) => ({ value: s, label: REFERRAL_STATUS_LABEL[s] }))} />
          <SelectField label="서비스 유형" name="serviceType" value={p.serviceType} options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABEL[t] }))} />
        </FilterForm>
        {!res.ok ? <p className="cw-msg msg-error">{res.message}</p> : (
          <Panel title="의뢰 목록">
            {res.data.data.length === 0 ? <Empty>의뢰가 없습니다.</Empty> : (
              <ul className="cw-list">
                {res.data.data.map((r) => (
                  <li key={r.id}>
                    <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                      <span><b>{r.serviceName}</b> · {isProvider ? r.displayCode : <Link href={`/care/recipients/${r.recipientId}?tab=services`}>{r.displayCode}</Link>}</span>
                      <ReferralStatusBadge status={r.status} />
                    </div>
                    <div className="cw-meta"><span>{r.id}</span><span>{r.providerName}</span><span>의뢰 {fmtDate(r.referredAt)} · {r.referredByName ?? "—"}</span><span>상태 변경 {fmtDate(r.statusChangedAt)}</span></div>
                    {r.failureReason && <Badge tone="high" icon="!">실패 사유: {r.failureReason}</Badge>}
                    <ReferralStatusForm id={r.id} status={r.status} isProvider={isProvider} />
                  </li>
                ))}
              </ul>
            )}
            <Pagination {...res.data.pagination} base="/care/services" params={{ ...p, tab: "referrals" }} />
          </Panel>
        )}
      </>
    );
  }
}

function eligibilityText(e: { minAge?: number; livingAlone?: boolean; requiresMobilityAid?: boolean; requiresCaregiver?: boolean; notes?: string[] }) {
  const parts = [
    e.minAge && `${e.minAge}세 이상`,
    e.livingAlone && "독거",
    e.requiresMobilityAid && "보행 보조 필요",
    e.requiresCaregiver && "가족 돌봄자",
    ...(e.notes ?? []),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "명시된 조건 없음";
}
