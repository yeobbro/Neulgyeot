import Link from "next/link";
import { ReviewForm, TaskCreateForm } from "@/components/client/forms";
import { Badge, Empty, Heading, InferenceBadge, Panel, PriorityBadge, ReviewBadge } from "@/components/ui";
import { RECORD_TYPE_LABEL, VISIT_STATUS_LABEL } from "@/lib/domain/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load } from "@/lib/server/page";
import { getAssessment } from "@/lib/server/services/assessments";
import { listRecords } from "@/lib/server/services/records";
import { listAssignableWorkers } from "@/lib/server/services/recipients";
import { listTasks } from "@/lib/server/services/tasks";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const { id } = await params;
  const db = await getDb();
  const res = await load(async () => {
    const a = await getAssessment(db, actor, id);
    const [records, workers, tasks] = await Promise.all([
      listRecords(db, actor, a.recipientId, { limit: 200 }),
      listAssignableWorkers(db, actor),
      listTasks(db, actor, { recipientId: a.recipientId, page: 1, pageSize: 50 }),
    ]);
    return { a, records, workers, tasks: tasks.data.filter((t) => t.assessmentId === a.id) };
  });
  if (!res.ok) return <p className="cw-msg msg-error" role="alert">{res.message}</p>;
  const { a, records, workers, tasks } = res.data;
  const byId = new Map(records.map((r) => [r.id, r]));
  const urgent = a.signals.some((s) => s.signalType === "urgent_procedure_check") || a.aiResult?.mentions_possible_emergency;

  return (
    <>
      <p className="cw-meta"><Link href={`/care/recipients/${a.recipientId}?tab=assessments`}>← {a.displayCode} 분석 이력</Link></p>
      <Heading kicker="Assessment" title={`${a.displayCode} 분석 결과`} actions={<><PriorityBadge priority={a.priority} /><ReviewBadge status={a.reviewStatus} /></>}>
        분석 {fmtDateTime(a.createdAt)} · 기간 {fmtDate(a.windowStart)} ~ {fmtDate(a.windowEnd)} · {a.ruleVersion}{a.modelVersion ? ` · 모델 ${a.modelVersion}` : ""}
      </Heading>
      {urgent && (
        <p className="cw-msg msg-error" role="alert">
          긴급 상황 언급이 있습니다. 이 화면의 결과로 대응을 끝내지 말고, 기관의 공식 긴급 대응 절차를 즉시 확인하세요.
        </p>
      )}
      <div className="cw-grid split">
        <div>
          <Panel title="규칙 기반 신호" hint={`업무 우선순위 점수 ${a.score} — 예측 확률이나 임상적 위험도가 아님`}>
            {a.signals.length === 0 ? <Empty>감지된 신호가 없습니다. 정상 진행 중인 사례로 보입니다.</Empty> : (
              <ul className="cw-list">
                {a.signals.map((s) => (
                  <li key={s.ruleId} className="inference">
                    <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                      <b>{s.label}</b>
                      <span className="cw-actions"><Badge tone="neutral">{s.ruleId}</Badge>{s.dataInsufficient && <Badge tone="mid" icon="?">데이터 부족</Badge>}</span>
                    </div>
                    <p style={{ margin: "6px 0" }}>{s.reason}</p>
                    <p className="cw-meta">제안: {s.suggestedAction}</p>
                    <div className="cw-meta">
                      <span>기간 {fmtDate(s.window.start)} ~ {fmtDate(s.window.end)}</span>
                      {s.evidence.length > 0 && (
                        <span>
                          근거:{" "}
                          {s.evidence.map((e, i) => (
                            <span key={e.entityId}>
                              {i > 0 && ", "}
                              <Link href={e.entityType === "record" ? `/care/recipients/${a.recipientId}?tab=records#${e.entityId}` : e.entityType === "task" ? `/care/tasks?focus=${e.entityId}` : `/care/recipients/${a.recipientId}?tab=services`}>{e.entityId}</Link>
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="AI 기록 해석" hint="추론 결과 · 원본 기록과 분리">
            {a.aiStatus === "not_configured" && <p className="cw-msg msg-info">AI API가 설정되지 않아 AI 해석을 실행하지 않았습니다. 위의 규칙 기반 결과만 사용합니다.</p>}
            {a.aiStatus === "skipped" && <p className="cw-meta">이 분석에서는 AI 해석을 요청하지 않았습니다.</p>}
            {a.aiStatus === "failed" && <p className="cw-msg msg-warn">AI 해석에 실패했습니다: {a.aiError}. 규칙 기반 결과는 정상입니다.</p>}
            {a.aiStatus === "succeeded" && a.aiResult && (
              <>
                <InferenceBadge label={`AI 추론 · ${a.modelVersion}`} />
                <h4 style={{ fontSize: 14, margin: "10px 0 4px" }}>감지된 변화</h4>
                <ul className="cw-list">
                  {a.aiResult.detected_changes.map((c, i) => (
                    <li key={i} className="inference">
                      <b>{c.type}</b> — {c.evidence}
                      <div className="cw-meta">근거 기록: {c.source_record_ids.length ? c.source_record_ids.map((rid) => <Link key={rid} href={`/care/recipients/${a.recipientId}?tab=records#${rid}`}>{rid} </Link>) : "확인 가능한 근거 없음"}</div>
                    </li>
                  ))}
                </ul>
                <dl className="cw-kv" style={{ marginTop: 10 }}>
                  <dt>필요 지원</dt><dd>{a.aiResult.support_needs.join(", ") || "—"}</dd>
                  <dt>추천 조치</dt><dd>{a.aiResult.recommended_actions.map((r) => `${r.action} (${r.reason})`).join(" / ") || "—"}</dd>
                  <dt>불확실성</dt><dd>{a.aiResult.uncertainties.join(" / ") || "—"}</dd>
                </dl>
              </>
            )}
          </Panel>

          <Panel title="근거가 된 원본 기록">
            {a.sourceRecordIds.length === 0 ? <Empty>이 분석은 기록 외(서비스 상태·조치 기한) 근거만 사용했습니다.</Empty> : (
              <ul className="cw-list">
                {a.sourceRecordIds.map((rid) => {
                  const r = byId.get(rid);
                  return (
                    <li key={rid} className="record">
                      {r ? (
                        <>
                          <div className="cw-meta"><b>{RECORD_TYPE_LABEL[r.recordType]}{r.visitStatus ? ` · ${VISIT_STATUS_LABEL[r.visitStatus]}` : ""}</b><span>{fmtDateTime(r.scheduledAt ?? r.recordedAt)}</span><Link href={`/care/recipients/${a.recipientId}?tab=records#${rid}`}>{rid}</Link></div>
                          <p className="cw-pre">{r.content}</p>
                        </>
                      ) : (
                        <span className="cw-meta">{rid} — 삭제되었거나 볼 수 없는 기록</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="담당자 검토">
            {a.reviewStatus === "pending" ? (
              <ReviewForm id={a.id} />
            ) : (
              <dl className="cw-kv">
                <dt>결과</dt><dd><ReviewBadge status={a.reviewStatus} /></dd>
                <dt>검토자</dt><dd>{a.reviewedByName ?? "—"}</dd>
                <dt>시각</dt><dd>{fmtDateTime(a.reviewedAt)}</dd>
                <dt>의견</dt><dd>{a.reviewNote ?? "—"}</dd>
              </dl>
            )}
          </Panel>
          <Panel title="이 분석의 후속 조치">
            {tasks.length > 0 && (
              <ul className="cw-list" style={{ marginBottom: 12 }}>
                {tasks.map((t) => <li key={t.id}><Link href={`/care/tasks?focus=${t.id}`}>{t.title}</Link> <span className="cw-meta">{t.status}</span></li>)}
              </ul>
            )}
            <TaskCreateForm
              recipientId={a.recipientId}
              assessmentId={a.id}
              workers={workers.map((w) => ({ id: w.id, name: w.name }))}
              defaults={{ title: a.signals[0] ? `${a.signals[0].label} 확인` : "분석 결과 확인", description: a.signals.map((s) => s.suggestedAction).join(" "), taskType: "assessment_review", priority: a.priority === "high" ? "high" : "medium" }}
            />
            <p className="cw-meta" style={{ marginTop: 8 }}>조치에서 서비스 의뢰로 이어가려면 <Link href={`/care/services?recipientId=${a.recipientId}`}>서비스 매칭</Link>을 여세요.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
