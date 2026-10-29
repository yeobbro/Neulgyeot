import Link from "next/link";
import {
  FamilyLinkToggle,
  MatchPanel,
  RecordEditor,
  RecordForm,
  RecipientUpdateForm,
  ReferralStatusForm,
  RunAssessmentButtons,
  TaskCreateForm,
  TaskUpdateForm,
} from "@/components/client/forms";
import {
  Badge,
  CareStatusBadge,
  DemoBadge,
  Empty,
  Heading,
  InferenceBadge,
  Panel,
  PriorityBadge,
  ReferralStatusBadge,
  ReviewBadge,
  Tabs,
  TaskStatusBadge,
} from "@/components/ui";
import { RECORD_FLAG_LABEL, RECORD_TYPE_LABEL, SERVICE_TYPE_LABEL, VISIT_STATUS_LABEL } from "@/lib/domain/constants";
import { dueLabel, fmtDate, fmtDateTime } from "@/lib/format";
import { aiConfigured } from "@/lib/server/ai/client";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { listRecipientAssessments } from "@/lib/server/services/assessments";
import { listReferrals } from "@/lib/server/services/care-services";
import { listFamilyLinks } from "@/lib/server/services/portal";
import { listRecords } from "@/lib/server/services/records";
import { getRecipientSummary, listAssignableWorkers } from "@/lib/server/services/recipients";
import { listRegions, regionLabel } from "@/lib/server/services/regions";
import { listTasks } from "@/lib/server/services/tasks";
import { recipientTimeline } from "@/lib/server/services/timeline";

const TABS = [
  { id: "overview", label: "개요" },
  { id: "records", label: "상담·방문 기록" },
  { id: "timeline", label: "타임라인" },
  { id: "assessments", label: "AI·규칙 분석" },
  { id: "services", label: "서비스 연계" },
  { id: "tasks", label: "후속 조치" },
  { id: "family", label: "가족 연결" },
];

export default async function RecipientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const { id } = await params;
  const p = await readParams(searchParams);
  const tab = TABS.some((t) => t.id === p.tab) ? p.tab! : "overview";
  const db = await getDb();
  const res = await load(async () => {
    const [summary, regions, workers, records, assessments, referrals, tasks] = await Promise.all([
      getRecipientSummary(db, actor, id),
      listRegions(db),
      listAssignableWorkers(db, actor),
      listRecords(db, actor, id, { limit: 200 }),
      listRecipientAssessments(db, actor, id),
      listReferrals(db, actor, { recipientId: id, page: 1, pageSize: 100 }),
      listTasks(db, actor, { recipientId: id, page: 1, pageSize: 100 }),
    ]);
    const timeline = tab === "timeline" ? await recipientTimeline(db, actor, id) : [];
    const family = tab === "family" ? await listFamilyLinks(db, actor, id) : [];
    return { summary, regions, workers, records, assessments, referrals: referrals.data, tasks: tasks.data, timeline, family };
  });
  if (!res.ok) return <p className="cw-msg msg-error" role="alert">{res.message}</p>;
  const { summary: s, regions, workers, records, assessments, referrals, tasks, timeline, family } = res.data;
  const workerOpts = workers.map((w) => ({ id: w.id, name: w.name }));
  const latest = assessments[0];
  const upcoming = records.filter((r) => r.visitStatus === "scheduled" && r.scheduledAt && r.scheduledAt > new Date().toISOString());
  const activeRefs = referrals.filter((r) => ["requested", "received", "in_progress", "in_service", "suspended"].includes(r.status));

  return (
    <>
      <p className="cw-meta"><Link href="/care/recipients">← 대상자 목록</Link></p>
      <Heading kicker={regionLabel(regions, s.regionId)} title={`${s.displayCode} · ${s.displayName}`} actions={<><CareStatusBadge status={s.careStatus} /><PriorityBadge priority={s.latestPriority} /><DemoBadge /></>}>
        {s.ageBand ?? "연령대 미상"} · 담당 {s.assignedUserName ?? "미지정"} · 다음 확인 {fmtDate(s.nextCheckAt)}
      </Heading>
      <Tabs tabs={TABS} current={tab} base={`/care/recipients/${id}`} />

      {tab === "overview" && (
        <div className="cw-grid split">
          <div>
            <Panel title="지원 중인 서비스">
              {activeRefs.length === 0 ? <Empty>진행 중인 서비스 연계가 없습니다.</Empty> : (
                <ul className="cw-list">{activeRefs.map((r) => <li key={r.id}><b>{r.serviceName}</b> <ReferralStatusBadge status={r.status} /><div className="cw-meta">{r.providerName} · 상태 변경 {fmtDate(r.statusChangedAt)}</div></li>)}</ul>
              )}
              {s.unconnected && <p className="cw-msg msg-warn" style={{ marginTop: 10 }}>필요 지원 중 진행 중인 연계가 없는 유형이 있습니다. <Link href={`/care/recipients/${id}?tab=services`}>서비스 후보 보기</Link></p>}
            </Panel>
            <Panel title="최근 기록" actions={<Link className="btn btn-outline btn-sm" href={`/care/recipients/${id}?tab=records`}>전체 기록</Link>}>
              {records.length === 0 ? <Empty>기록이 없습니다.</Empty> : (
                <ul className="cw-list">{records.slice(0, 4).map((r) => <li key={r.id} className="record"><div className="cw-meta"><b>{RECORD_TYPE_LABEL[r.recordType]}{r.visitStatus ? ` · ${VISIT_STATUS_LABEL[r.visitStatus]}` : ""}</b><span>{fmtDateTime(r.scheduledAt ?? r.recordedAt)}</span><span>{r.id}</span></div><p className="cw-pre">{r.content}</p></li>)}</ul>
              )}
            </Panel>
          </div>
          <div>
            <Panel title="최신 분석" actions={latest && <Link className="btn btn-outline btn-sm" href={`/care/assessments/${latest.id}`}>근거 보기</Link>}>
              {!latest ? <Empty>아직 분석하지 않았습니다.</Empty> : (
                <>
                  <div className="cw-actions"><PriorityBadge priority={latest.priority} /><ReviewBadge status={latest.reviewStatus} /><InferenceBadge label={latest.method === "rules+ai" ? "규칙+AI" : "규칙 기반"} /></div>
                  <ul style={{ paddingLeft: 18 }}>{latest.signals.map((x) => <li key={x.ruleId}>{x.label}</li>)}</ul>
                  {latest.signals.length === 0 && <p className="cw-meta">감지된 신호가 없습니다.</p>}
                  <p className="cw-meta">분석 {fmtDateTime(latest.createdAt)} · {latest.ruleVersion}</p>
                </>
              )}
            </Panel>
            <Panel title="다가오는 방문">
              {upcoming.length === 0 ? <Empty>예정된 방문이 없습니다.</Empty> : <ul style={{ paddingLeft: 18, margin: 0 }}>{upcoming.slice(0, 5).map((r) => <li key={r.id}>{fmtDateTime(r.scheduledAt)}</li>)}</ul>}
            </Panel>
            <Panel title="기본 정보·담당자 메모">
              <RecipientUpdateForm id={id} careStatus={s.careStatus} assignedUserId={s.assignedUserId} needs={s.needs} nextCheckAt={s.nextCheckAt} staffNote={s.staffNote} workers={workerOpts} />
              <dl className="cw-kv" style={{ marginTop: 12 }}>
                <dt>나이</dt><dd>{s.attributes.age ?? "확인 안 됨"}</dd>
                <dt>독거</dt><dd>{s.attributes.livingAlone === undefined ? "확인 안 됨" : s.attributes.livingAlone ? "예" : "아니오"}</dd>
                <dt>보행 보조</dt><dd>{s.attributes.usesMobilityAid === undefined ? "확인 안 됨" : s.attributes.usesMobilityAid ? "필요" : "불필요"}</dd>
                <dt>가족 돌봄자</dt><dd>{s.attributes.hasCaregiver === undefined ? "확인 안 됨" : s.attributes.hasCaregiver ? "있음" : "없음"}</dd>
              </dl>
            </Panel>
          </div>
        </div>
      )}

      {tab === "records" && (
        <div className="cw-grid split">
          <Panel title={`기록 ${records.length}건`} hint="공식 기록 (AI 요약과 분리)">
            {records.length === 0 ? <Empty>기록이 없습니다. 오른쪽에서 첫 기록을 작성하세요.</Empty> : (
              <ul className="cw-list">
                {records.map((r) => (
                  <li key={r.id} id={r.id} className="record">
                    <div className="cw-meta">
                      <b>{RECORD_TYPE_LABEL[r.recordType]}{r.visitStatus ? ` · ${VISIT_STATUS_LABEL[r.visitStatus]}` : ""}</b>
                      <span>{r.visitStatus === "scheduled" ? `예정 ${fmtDateTime(r.scheduledAt)}` : fmtDateTime(r.recordedAt)}</span>
                      <span>{r.id}</span>
                      <span>작성 {r.createdByName ?? "—"}</span>
                      {r.sourceType === "voice" && <Badge tone="ai" icon="◉">음성 초안에서 검토 후 저장</Badge>}
                      {r.revisionCount > 0 && <span>수정 {r.revisionCount}회</span>}
                    </div>
                    <p className="cw-pre">{r.content}</p>
                    {r.flags.length > 0 && <div className="cw-actions">{r.flags.map((f) => <Badge key={f} tone={f === "emergency_mention" ? "high" : "mid"} icon="!">{RECORD_FLAG_LABEL[f]}</Badge>)}</div>}
                    <RecordEditor id={r.id} content={r.content} visitStatus={r.visitStatus} isVisit={r.recordType === "visit"} canEdit={actor.role === "admin" || r.createdBy === actor.id} canDelete={actor.role === "admin"} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="새 기록 작성" actions={<Link className="btn btn-outline btn-sm" href={`/care/voice?recipientId=${id}`}>음성으로 작성</Link>}>
            <RecordForm recipientId={id} referrals={referrals.map((r) => ({ id: r.id, name: `${r.serviceName} (${r.id})` }))} />
          </Panel>
        </div>
      )}

      {tab === "timeline" && (
        <Panel title="사례 타임라인" hint="최신순 · 보라색 점은 AI·규칙 추론, 초록색은 실제 기록·조치">
          {timeline.length === 0 ? <Empty>이벤트가 없습니다.</Empty> : (
            <ol className="cw-timeline">
              {timeline.map((e, i) => (
                <li key={i} className={e.isInference ? "inference" : ""}>
                  <div className="cw-meta"><span>{fmtDateTime(e.at)}</span>{e.actorName && <span>{e.actorName}</span>}{e.isInference && <InferenceBadge />}</div>
                  <b>{e.link ? <Link href={e.link}>{e.title}</Link> : e.title}</b> {e.detail && <span className="cw-meta">{e.detail}</span>}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      )}

      {tab === "assessments" && (
        <div className="cw-grid split">
          <Panel title="분석 이력">
            {assessments.length === 0 ? <Empty>분석 이력이 없습니다.</Empty> : (
              <ul className="cw-list">
                {assessments.map((a) => (
                  <li key={a.id} className="inference">
                    <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                      <Link className="row-link" href={`/care/assessments/${a.id}`}>{a.id}</Link>
                      <span className="cw-actions"><PriorityBadge priority={a.priority} /><ReviewBadge status={a.reviewStatus} /></span>
                    </div>
                    <div className="cw-meta"><span>{fmtDateTime(a.createdAt)}</span><span>{a.method === "rules+ai" ? `규칙+AI (${a.modelVersion})` : "규칙 기반"}</span><span>{a.ruleVersion}</span><span>업무 우선순위 점수 {a.score}</span></div>
                    <div>{a.signals.map((x) => x.label).join(" · ") || "신호 없음"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="새 분석 실행">
            <RunAssessmentButtons recipientId={id} aiConfigured={aiConfigured()} />
            <p className="cw-meta" style={{ marginTop: 10 }}>규칙 기반 분석은 같은 입력에 항상 같은 결과를 냅니다. 결과는 확인 순서를 돕는 정보이며 진단이나 자격 판정이 아닙니다.</p>
          </Panel>
        </div>
      )}

      {tab === "services" && (
        <div className="cw-grid split">
          <Panel title="서비스 의뢰·연계 이력">
            {referrals.length === 0 ? <Empty>의뢰 이력이 없습니다.</Empty> : (
              <ul className="cw-list">
                {referrals.map((r) => (
                  <li key={r.id}>
                    <div className="cw-actions" style={{ justifyContent: "space-between" }}><b>{r.serviceName}</b><ReferralStatusBadge status={r.status} /></div>
                    <div className="cw-meta"><span>{r.id}</span><span>{r.providerName}</span><span>{SERVICE_TYPE_LABEL[r.serviceType]}</span><span>의뢰 {fmtDate(r.referredAt)}</span><span>상태 변경 {fmtDate(r.statusChangedAt)}</span></div>
                    {r.failureReason && <p className="cw-msg msg-error" style={{ fontSize: 13 }}>실패 사유: {r.failureReason}</p>}
                    {r.resultNote && <p className="cw-meta">메모: {r.resultNote}</p>}
                    <ReferralStatusForm id={r.id} status={r.status} isProvider={false} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="서비스 후보 추천">
            <MatchPanel recipientId={id} />
          </Panel>
        </div>
      )}

      {tab === "tasks" && (
        <div className="cw-grid split">
          <Panel title="후속 조치">
            {tasks.length === 0 ? <Empty>등록된 조치가 없습니다.</Empty> : (
              <ul className="cw-list">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <div className="cw-actions" style={{ justifyContent: "space-between" }}><b>{t.title}</b><span className="cw-actions"><TaskStatusBadge status={t.status} />{t.isOverdue && <Badge tone="high" icon="⏰">기한 경과</Badge>}</span></div>
                    <div className="cw-meta"><span>{t.id}</span><span>담당 {t.assigneeName ?? "미지정"}</span><span>기한 {fmtDate(t.dueAt)} ({dueLabel(t.dueAt)})</span>{t.assessmentId && <Link href={`/care/assessments/${t.assessmentId}`}>관련 분석</Link>}</div>
                    {t.resultNote && <p className="cw-meta">결과: {t.resultNote}</p>}
                    <TaskUpdateForm id={t.id} status={t.status} workers={workerOpts} assigneeId={t.assigneeId} priority={t.priority} dueAt={t.dueAt} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="조치 등록"><TaskCreateForm recipientId={id} workers={workerOpts} /></Panel>
        </div>
      )}

      {tab === "family" && (
        <Panel title="가족·대상자 계정 연결" hint="동의가 확인된 연결만 포털에서 허용된 정보를 봅니다">
          {family.length === 0 ? <Empty>연결된 가족 계정이 없습니다.</Empty> : (
            <ul className="cw-list">
              {family.map((f) => (
                <li key={f.id}>
                  <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                    <span><b>{f.user_name}</b> · {f.relationship_label}</span>
                    <Badge tone={f.consent_status === "granted" ? "ok" : f.consent_status === "revoked" ? "high" : "mid"} icon={f.consent_status === "granted" ? "✓" : "×"}>{f.consent_status === "granted" ? "동의 확인" : f.consent_status === "revoked" ? "동의 철회" : "확인 대기"}</Badge>
                  </div>
                  <div className="cw-meta">권한: {Object.entries(f.permissions).filter(([, v]) => v).map(([k]) => ({ view_services: "서비스 열람", view_schedule: "일정 열람", create_requests: "문의 등록" })[k] ?? k).join(", ")}</div>
                  <FamilyLinkToggle id={f.id} status={f.consent_status} />
                </li>
              ))}
            </ul>
          )}
          <p className="cw-meta">실제 가족관계·법적 대리권 확인 절차가 없는 개발 환경이므로 가상 계정으로만 시연합니다.</p>
        </Panel>
      )}
    </>
  );
}
