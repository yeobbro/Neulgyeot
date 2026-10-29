import { PortalLogout, PortalPreferences, PortalRequestForm } from "@/components/client/portal-forms";
import { SERVICE_TYPE_LABEL, SUPPORT_REQUEST_STATUS_LABEL, SUPPORT_REQUEST_TYPE_LABEL } from "@/lib/domain/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { AppError } from "@/lib/server/errors";
import { readParams, type SearchParams } from "@/lib/server/page";
import { getPreferences } from "@/lib/server/services/notifications";
import { listPortalRequests, portalContext, portalSchedule, portalServices } from "@/lib/server/services/portal";

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, message: e.message };
    throw e;
  }
}

export default async function PortalPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["recipient", "family"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const ctx = await portalContext(db, actor);
  const recipientId = ctx.recipients.find((r) => r.id === p.recipientId)?.id ?? ctx.recipients[0]?.id;
  const who = ctx.recipients.find((r) => r.id === recipientId);
  const [services, schedule, requests, prefs] = await Promise.all([
    recipientId ? safe(() => portalServices(db, actor, recipientId)) : null,
    recipientId ? safe(() => portalSchedule(db, actor, recipientId)) : null,
    listPortalRequests(db, actor),
    getPreferences(db, actor),
  ]);

  return (
    <>
      <header className="pt-top">
        <b>늘곁</b>
        <span>{actor.name}</span>
        <PortalLogout />
      </header>
      <main className="pt-main" id="main">
        <p className="pt-note">시연용 화면입니다. 이름·일정·기관은 모두 가상 정보입니다. 담당자 내부 메모와 분석 내용은 이 화면에 보이지 않습니다.</p>
        {!recipientId ? (
          <section className="pt-card">
            <h2>연결된 분이 없어요</h2>
            <p>가족 연결 동의가 확인되지 않았거나 철회되었습니다. 정보를 보려면 담당 기관에 연결과 동의 확인을 요청해 주세요.</p>
          </section>
        ) : (
          <>
            {ctx.recipients.length > 1 && (
              <form method="get" className="pt-card">
                <label className="pt-field">누구의 정보를 볼까요?
                  <select name="recipientId" defaultValue={recipientId}>{ctx.recipients.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}</select>
                </label>
                <button className="pt-btn">보기</button>
              </form>
            )}
            <section className="pt-card" aria-labelledby="sched">
              <h2 id="sched">{who?.displayName}님의 다가오는 방문</h2>
              {!schedule?.ok ? <p className="pt-msg error">{schedule?.message}</p> : schedule.data.data.length === 0 ? <p>예정된 방문이 없어요.</p> : (
                <ul className="pt-list">{schedule.data.data.map((s) => <li key={s.id}><b>{fmtDateTime(s.at)}</b><br /><span className="pt-meta">{s.kind}</span></li>)}</ul>
              )}
            </section>
            <section className="pt-card" aria-labelledby="svc">
              <h2 id="svc">이용 중인 서비스와 진행 상황</h2>
              {!services?.ok ? <p className="pt-msg error">{services?.message}</p> : services.data.data.length === 0 ? <p>신청한 서비스가 없어요.</p> : (
                <ul className="pt-list">
                  {services.data.data.map((s) => (
                    <li key={s.id}>
                      <b>{SERVICE_TYPE_LABEL[s.serviceType]}</b> — <span className="pt-status">{s.statusLabel}</span>
                      <br /><span className="pt-meta">{s.providerName} · {s.schedule} · {fmtDate(s.updatedAt)} 기준</span>
                      <br /><span className="pt-meta">문의: {s.contact}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="pt-card" aria-labelledby="ask">
              <h2 id="ask">궁금한 점 물어보기</h2>
              <PortalRequestForm recipientId={recipientId} services={services?.ok ? services.data.data.map((s) => ({ id: s.id, label: SERVICE_TYPE_LABEL[s.serviceType] })) : []} />
            </section>
          </>
        )}
        <section className="pt-card" aria-labelledby="req" id="requests">
          <h2 id="req">내가 보낸 문의</h2>
          {requests.data.length === 0 ? <p>보낸 문의가 없어요.</p> : (
            <ul className="pt-list">
              {requests.data.map((q) => (
                <li key={q.id}>
                  <b>{q.title}</b> <span className="pt-status">{SUPPORT_REQUEST_STATUS_LABEL[q.status]}</span>
                  <br /><span className="pt-meta">{SUPPORT_REQUEST_TYPE_LABEL[q.requestType]} · {fmtDateTime(q.createdAt)}</span>
                  {q.responseContent && <p style={{ margin: "8px 0 0" }}><b>답변:</b> {q.responseContent}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="pt-card" aria-labelledby="pref">
          <h2 id="pref">알림 받기 설정</h2>
          <PortalPreferences initial={prefs} />
        </section>
      </main>
    </>
  );
}
