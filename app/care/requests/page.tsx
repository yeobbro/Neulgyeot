import Link from "next/link";
import { SupportRequestForm } from "@/components/client/forms";
import { FilterForm, SelectField } from "@/components/filters";
import { Empty, Heading, Pagination, Panel, RequestStatusBadge } from "@/components/ui";
import { SUPPORT_REQUEST_STATUSES, SUPPORT_REQUEST_STATUS_LABEL, SUPPORT_REQUEST_TYPE_LABEL } from "@/lib/domain/constants";
import { fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { listStaffRequests, staffRequestListQuery } from "@/lib/server/services/portal";

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const res = await load(() => listStaffRequests(db, actor, staffRequestListQuery.parse(p)));
  return (
    <>
      <Heading kicker="Family & resident requests" title="가족·대상자 문의">
        포털에서 접수된 문의입니다. 답변은 가족·대상자 화면에 그대로 보이므로 내부 메모나 분석 내용을 적지 마세요.
      </Heading>
      <FilterForm action="/care/requests" resetHref="/care/requests">
        <SelectField label="처리 상태" name="status" value={p.status} options={SUPPORT_REQUEST_STATUSES.map((s) => ({ value: s, label: SUPPORT_REQUEST_STATUS_LABEL[s] }))} />
      </FilterForm>
      {!res.ok ? <p className="cw-msg msg-error">{res.message}</p> : (
        <Panel title="문의 목록">
          {res.data.data.length === 0 ? <Empty>문의가 없습니다.</Empty> : (
            <ul className="cw-list">
              {res.data.data.map((q) => (
                <li key={q.id} id={q.id} style={p.focus === q.id ? { borderColor: "#1d6b52" } : undefined}>
                  <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                    <b>{q.title}</b>
                    <RequestStatusBadge status={q.status} />
                  </div>
                  <div className="cw-meta"><span>{q.id}</span><Link href={`/care/recipients/${q.recipientId}?tab=family`}>{q.displayCode}</Link><span>{SUPPORT_REQUEST_TYPE_LABEL[q.requestType]}</span><span>작성 {q.createdByName}</span><span>접수 {fmtDateTime(q.createdAt)}</span><span>담당 {q.assignedUserName ?? "미지정"}</span></div>
                  <p className="cw-pre">{q.content}</p>
                  {q.responseContent && <p className="cw-msg msg-info">답변: {q.responseContent}</p>}
                  <SupportRequestForm id={q.id} status={q.status} response={q.responseContent} />
                </li>
              ))}
            </ul>
          )}
          <Pagination {...res.data.pagination} base="/care/requests" params={p} />
        </Panel>
      )}
    </>
  );
}
