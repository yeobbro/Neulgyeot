import Link from "next/link";
import { TaskUpdateForm } from "@/components/client/forms";
import { FilterForm, regionOptions, SelectField } from "@/components/filters";
import { Badge, Empty, Heading, Pagination, Panel, PriorityBadge, TaskStatusBadge } from "@/components/ui";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, TASK_TYPES, TASK_TYPE_LABEL } from "@/lib/domain/constants";
import { dueLabel, fmtDate, fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { load, readParams, type SearchParams } from "@/lib/server/page";
import { listAssignableWorkers } from "@/lib/server/services/recipients";
import { listRegions } from "@/lib/server/services/regions";
import { getTask, listTasks, taskHistory, taskListQuery } from "@/lib/server/services/tasks";

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const [regions, workers] = await Promise.all([listRegions(db), listAssignableWorkers(db, actor)]);
  const query = { status: p.status ?? (p.focus ? undefined : "active"), ...p };
  const res = await load(() => listTasks(db, actor, taskListQuery.parse(query)));
  const focus = p.focus ? await load(async () => ({ task: await getTask(db, actor, p.focus!), history: await taskHistory(db, actor, p.focus!) })) : null;
  const workerOpts = workers.map((w) => ({ id: w.id, name: w.name }));

  return (
    <>
      <Heading kicker="Follow-up" title="돌봄 공백·후속 조치 관리">
        분석 검토, 미완료 방문, 서비스 중단·연계 실패, 기한 경과에서 생긴 업무를 완료까지 추적합니다. 상태 변경은 서버에서 검증하고 이력을 남깁니다.
      </Heading>
      <FilterForm action="/care/tasks" resetHref="/care/tasks">
        <SelectField label="상태" name="status" value={query.status} options={[{ value: "active", label: "미완료 전체" }, ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))]} />
        <SelectField label="우선순위" name="priority" value={p.priority} options={PRIORITIES.map((x) => ({ value: x, label: PRIORITY_LABEL[x] }))} />
        <SelectField label="담당자" name="assigneeId" value={p.assigneeId} options={workers.map((w) => ({ value: w.id, label: w.name }))} />
        <SelectField label="유형" name="taskType" value={p.taskType} options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))} />
        <SelectField label="지역" name="regionId" value={p.regionId} options={regionOptions(regions, actor.scopeRegionIds)} />
        <SelectField label="기한" name="overdue" value={p.overdue} options={[{ value: "true", label: "기한 경과만" }, { value: "false", label: "기한 내" }]} />
      </FilterForm>

      {focus?.ok && (
        <Panel title={`선택한 조치: ${focus.data.task.title}`} id="focus">
          <div className="cw-actions"><TaskStatusBadge status={focus.data.task.status} /><PriorityBadge priority={focus.data.task.priority} />{focus.data.task.isOverdue && <Badge tone="high" icon="⏰">기한 경과</Badge>}</div>
          <p>{focus.data.task.description || "상세 설명 없음"}</p>
          <div className="cw-meta"><Link href={`/care/recipients/${focus.data.task.recipientId}?tab=tasks`}>{focus.data.task.displayCode}</Link><span>{TASK_TYPE_LABEL[focus.data.task.taskType]}</span><span>기한 {fmtDateTime(focus.data.task.dueAt)}</span>{focus.data.task.assessmentId && <Link href={`/care/assessments/${focus.data.task.assessmentId}`}>관련 분석</Link>}</div>
          <div style={{ marginTop: 10 }}><TaskUpdateForm id={focus.data.task.id} status={focus.data.task.status} workers={workerOpts} assigneeId={focus.data.task.assigneeId} priority={focus.data.task.priority} dueAt={focus.data.task.dueAt} /></div>
          {(focus.data.task.taskType === "referral_failure" || focus.data.task.taskType === "service_interruption") && (
            <p style={{ marginTop: 10 }}><Link className="btn btn-outline btn-sm" href={`/care/services?tab=match&recipientId=${focus.data.task.recipientId}&taskId=${focus.data.task.id}`}>대체 서비스 찾기·재의뢰</Link></p>
          )}
          <h4 style={{ fontSize: 14, margin: "14px 0 6px" }}>조치 이력</h4>
          <ol className="cw-timeline">
            {focus.data.history.map((h, i) => (
              <li key={i}>
                <div className="cw-meta"><span>{fmtDateTime(h.at)}</span><span>{h.actorName ?? "시스템"}</span></div>
                {h.action === "task.status_changed" ? `상태: ${TASK_STATUS_LABEL[h.metadata.from as keyof typeof TASK_STATUS_LABEL] ?? "-"} → ${TASK_STATUS_LABEL[h.metadata.to as keyof typeof TASK_STATUS_LABEL]}` : h.action === "task.created" ? "조치 등록" : `변경: ${(h.metadata.fields as string[] | undefined)?.join(", ") ?? ""}`}
              </li>
            ))}
            {focus.data.history.length === 0 && <li>이력이 없습니다.</li>}
          </ol>
        </Panel>
      )}

      {!res.ok ? <p className="cw-msg msg-error" role="alert">{res.message}</p> : (
        <Panel title="조치 목록" hint="기한 경과 → 미완료 → 우선순위 순">
          {res.data.data.length === 0 ? <Empty>조건에 맞는 조치가 없습니다.</Empty> : (
            <div className="cw-table-wrap">
              <table className="cw-table">
                <thead><tr><th>조치</th><th>대상자</th><th>상태</th><th>우선순위</th><th>담당자</th><th>기한</th><th>완료·결과</th></tr></thead>
                <tbody>
                  {res.data.data.map((t) => (
                    <tr key={t.id} aria-current={p.focus === t.id ? "true" : undefined}>
                      <td><Link className="row-link" href={`/care/tasks?focus=${t.id}#focus`}>{t.title}</Link><small>{TASK_TYPE_LABEL[t.taskType]} · {t.id}</small></td>
                      <td><Link href={`/care/recipients/${t.recipientId}?tab=tasks`}>{t.displayCode}</Link></td>
                      <td><TaskStatusBadge status={t.status} /></td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td>{t.assigneeName ?? "미지정"}</td>
                      <td>{fmtDate(t.dueAt)}<small>{t.isOverdue ? <b style={{ color: "#a3412f" }}>⏰ {dueLabel(t.dueAt)}</b> : dueLabel(t.dueAt)}</small>{t.delayReason && <small>지연 사유: {t.delayReason}</small>}</td>
                      <td>{t.completedAt ? fmtDate(t.completedAt) : "—"}<small>{t.resultNote}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination {...res.data.pagination} base="/care/tasks" params={p} />
        </Panel>
      )}
    </>
  );
}
