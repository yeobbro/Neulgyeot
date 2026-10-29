"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  CARE_STATUSES,
  CARE_STATUS_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  RECORD_FLAGS,
  RECORD_FLAG_LABEL,
  RECORD_TYPES,
  RECORD_TYPE_LABEL,
  REFERRAL_STATUS_LABEL,
  SERVICE_TYPES,
  SERVICE_TYPE_LABEL,
  SUPPORT_REQUEST_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  VISIT_STATUSES,
  VISIT_STATUS_LABEL,
  type ReferralStatus,
  type ServiceType,
  type SupportRequestStatus,
  type TaskStatus,
} from "@/lib/domain/constants";
import { REFERRAL_TRANSITIONS, SUPPORT_REQUEST_TRANSITIONS, TASK_TRANSITIONS } from "@/lib/domain/transitions";
import type { MatchCandidate, MatchExclusion } from "@/lib/domain/matching";
import { Feedback, useApi } from "./use-api";

/** datetime-local value → ISO with KST offset. */
const toIso = (v: string) => (v ? new Date(`${v}:00+09:00`).toISOString() : undefined);

type Opt = { id: string; name: string };

export function NewRecipientForm({ dongs, workers }: { dongs: { id: string; label: string }[]; workers: Opt[] }) {
  const api = useApi();
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const needs = SERVICE_TYPES.filter((t) => f.get(`need_${t}`));
    const age = f.get("age") ? Number(f.get("age")) : undefined;
    const res = await api.run<{ id: string }>("/api/recipients", {
      method: "POST",
      body: {
        displayName: f.get("displayName"),
        ageBand: age ? `${Math.floor(age / 10) * 10}대` : undefined,
        regionId: f.get("regionId"),
        assignedUserId: f.get("assignedUserId") || undefined,
        needs,
        attributes: { ...(age ? { age } : {}), ...(f.get("livingAlone") ? { livingAlone: f.get("livingAlone") === "yes" } : {}) },
      },
    }, { refresh: false });
    if (res) router.push(`/care/recipients/${res.id}`);
  }
  return (
    <form className="cw-form" onSubmit={submit}>
      <p className="cw-meta">시연용 가상 대상자만 등록하세요. 실명·주민등록번호·실주소·연락처는 입력받지 않습니다.</p>
      <div className="cw-form-row">
        <label className="cw-field">표시 이름(가명) <input name="displayName" required maxLength={30} placeholder="예: 김○○" /></label>
        <label className="cw-field">나이 <input name="age" type="number" min={0} max={120} /></label>
        <label className="cw-field">지역(동) <select name="regionId" required defaultValue="">{[<option key="" value="" disabled>선택</option>, ...dongs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)]}</select></label>
        <label className="cw-field">담당자 <select name="assignedUserId" defaultValue=""><option value="">나에게 배정</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="cw-field">독거 여부 <select name="livingAlone" defaultValue=""><option value="">확인 안 됨</option><option value="yes">독거</option><option value="no">동거</option></select></label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="cw-field">필요 지원</legend>
        <div className="cw-actions">{SERVICE_TYPES.map((t) => <label key={t} className="cw-check"><input type="checkbox" name={`need_${t}`} /> {SERVICE_TYPE_LABEL[t]}</label>)}</div>
      </fieldset>
      <div className="cw-actions"><button className="btn btn-primary" disabled={api.pending}>{api.pending ? "저장 중…" : "대상자 등록"}</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function RecipientUpdateForm({ id, careStatus, assignedUserId, needs, nextCheckAt, staffNote, workers }: { id: string; careStatus: string; assignedUserId: string | null; needs: ServiceType[]; nextCheckAt: string | null; staffNote: string | null; workers: Opt[] }) {
  const api = useApi();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api.run(`/api/recipients/${id}`, {
      method: "PATCH",
      body: {
        careStatus: f.get("careStatus"),
        assignedUserId: f.get("assignedUserId") || null,
        needs: SERVICE_TYPES.filter((t) => f.get(`need_${t}`)),
        nextCheckAt: f.get("nextCheckAt") ? toIso(String(f.get("nextCheckAt"))) : null,
        staffNote: String(f.get("staffNote") ?? "") || null,
      },
    }, { success: "저장했습니다." });
  }
  const local = nextCheckAt ? new Date(new Date(nextCheckAt).getTime() + 9 * 3600_000).toISOString().slice(0, 16) : "";
  return (
    <form className="cw-form" onSubmit={submit}>
      <div className="cw-form-row">
        <label className="cw-field">돌봄 상태 <select name="careStatus" defaultValue={careStatus}>{CARE_STATUSES.map((s) => <option key={s} value={s}>{CARE_STATUS_LABEL[s]}</option>)}</select></label>
        <label className="cw-field">담당자 <select name="assignedUserId" defaultValue={assignedUserId ?? ""}><option value="">미지정</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="cw-field">다음 확인 일정 <input type="datetime-local" name="nextCheckAt" defaultValue={local} /></label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="cw-field">필요 지원</legend>
        <div className="cw-actions">{SERVICE_TYPES.map((t) => <label key={t} className="cw-check"><input type="checkbox" name={`need_${t}`} defaultChecked={needs.includes(t)} /> {SERVICE_TYPE_LABEL[t]}</label>)}</div>
      </fieldset>
      <label className="cw-field">담당자 메모 (내부 전용 · 가족 화면에 표시되지 않음)<textarea name="staffNote" defaultValue={staffNote ?? ""} maxLength={2000} /></label>
      <div className="cw-actions"><button className="btn btn-primary" disabled={api.pending}>저장</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function RecordForm({ recipientId, referrals = [] }: { recipientId: string; referrals?: Opt[] }) {
  const api = useApi();
  const [type, setType] = useState<(typeof RECORD_TYPES)[number]>("consultation");
  const [visit, setVisit] = useState<string>("completed");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await api.run(`/api/recipients/${recipientId}/records`, {
      method: "POST",
      body: {
        recordType: type,
        visitStatus: type === "visit" ? visit : null,
        scheduledAt: type === "visit" && f.get("scheduledAt") ? toIso(String(f.get("scheduledAt"))) : null,
        recordedAt: f.get("recordedAt") ? toIso(String(f.get("recordedAt"))) : undefined,
        content: f.get("content"),
        flags: RECORD_FLAGS.filter((x) => f.get(`flag_${x}`)),
        relatedReferralId: f.get("relatedReferralId") || null,
      },
    }, { success: "기록을 저장했습니다. 타임라인에 반영되었습니다." });
    if (ok) form.reset();
  }
  return (
    <form className="cw-form" onSubmit={submit}>
      <div className="cw-form-row">
        <label className="cw-field">기록 유형 <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>{RECORD_TYPES.map((t) => <option key={t} value={t}>{RECORD_TYPE_LABEL[t]}</option>)}</select></label>
        {type === "visit" && <label className="cw-field">방문 상태 <select value={visit} onChange={(e) => setVisit(e.target.value)}>{VISIT_STATUSES.map((s) => <option key={s} value={s}>{VISIT_STATUS_LABEL[s]}</option>)}</select></label>}
        {type === "visit" && <label className="cw-field">예정 일시 {visit === "scheduled" && "(필수)"}<input type="datetime-local" name="scheduledAt" required={visit === "scheduled"} /></label>}
        <label className="cw-field">기록 시각 (비우면 지금) <input type="datetime-local" name="recordedAt" /></label>
        {referrals.length > 0 && <label className="cw-field">관련 서비스 <select name="relatedReferralId" defaultValue=""><option value="">없음</option>{referrals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
      </div>
      <label className="cw-field">내용 (공식 기록 — 사실 위주로 작성)<textarea name="content" required maxLength={5000} /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="cw-field">확인 표시 (규칙 기반 분석이 이 표시를 사용합니다)</legend>
        <div className="cw-actions">{RECORD_FLAGS.map((x) => <label key={x} className="cw-check"><input type="checkbox" name={`flag_${x}`} /> {RECORD_FLAG_LABEL[x]}</label>)}</div>
        <p className="cw-meta">긴급 상황이 의심되면 시스템 기록과 별개로 기관의 공식 긴급 대응 절차를 즉시 따르세요.</p>
      </fieldset>
      <div className="cw-actions"><button className="btn btn-primary" disabled={api.pending}>{api.pending ? "저장 중…" : "기록 저장"}</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function RecordEditor({ id, content, visitStatus, isVisit, canEdit, canDelete }: { id: string; content: string; visitStatus: string | null; isVisit: boolean; canEdit: boolean; canDelete: boolean }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  if (!canEdit && !canDelete) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await api.run(`/api/records/${id}`, { method: "PATCH", body: { content: f.get("content"), ...(isVisit ? { visitStatus: f.get("visitStatus") } : {}) } }, { success: "수정했습니다. 이전 내용은 변경 이력에 남습니다." });
    if (ok) setOpen(false);
  }
  async function remove() {
    const reason = window.prompt("삭제 사유를 입력하세요 (기록은 감사용으로 보존됩니다).");
    if (!reason) return;
    await api.run(`/api/records/${id}`, { method: "DELETE", body: { reason } }, { success: "삭제 처리했습니다." });
  }
  return (
    <div className="no-print" style={{ marginTop: 6 }}>
      <div className="cw-actions">
        {canEdit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "수정 취소" : "수정"}</button>}
        {canDelete && <button type="button" className="btn btn-danger btn-sm" onClick={remove}>삭제</button>}
      </div>
      {open && (
        <form className="cw-form" onSubmit={submit} style={{ marginTop: 8 }}>
          {isVisit && <label className="cw-field">방문 상태 <select name="visitStatus" defaultValue={visitStatus ?? "completed"}>{VISIT_STATUSES.map((s) => <option key={s} value={s}>{VISIT_STATUS_LABEL[s]}</option>)}</select></label>}
          <label className="cw-field">내용<textarea name="content" defaultValue={content} required maxLength={5000} /></label>
          <div className="cw-actions"><button className="btn btn-primary btn-sm" disabled={api.pending}>수정 저장</button></div>
        </form>
      )}
      <Feedback error={api.error} message={api.message} />
    </div>
  );
}

export function RunAssessmentButtons({ recipientId, aiConfigured }: { recipientId: string; aiConfigured: boolean }) {
  const api = useApi();
  const router = useRouter();
  async function run(useAi: boolean) {
    const res = await api.run<{ id: string }>(`/api/recipients/${recipientId}/assessments`, { method: "POST", body: { useAi } }, { refresh: false });
    if (res) router.push(`/care/assessments/${res.id}`);
  }
  return (
    <div className="cw-form">
      <div className="cw-actions">
        <button type="button" className="btn btn-primary" disabled={api.pending} onClick={() => run(false)}>규칙 기반 분석 실행</button>
        <button type="button" className="btn btn-outline" disabled={api.pending || !aiConfigured} onClick={() => run(true)} title={aiConfigured ? undefined : "AI API 키가 설정되지 않았습니다"}>
          규칙 + AI 기록 해석
        </button>
      </div>
      {!aiConfigured && <p className="cw-meta">AI 기록 해석은 서버에 AI API 키가 설정되지 않아 사용할 수 없습니다. 규칙 기반 분석은 정상 동작합니다.</p>}
      {api.pending && <p className="cw-msg msg-info" role="status">분석 중입니다…</p>}
      <Feedback error={api.error} message={api.message} />
    </div>
  );
}

export function ReviewForm({ id }: { id: string }) {
  const api = useApi();
  const [status, setStatus] = useState<"accepted" | "modified" | "dismissed">("accepted");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get("reviewNote") ?? "");
    await api.run(`/api/assessments/${id}/review`, { method: "PATCH", body: { reviewStatus: status, reviewNote: note || undefined } }, { success: "검토 결과를 저장했습니다." });
  }
  return (
    <form className="cw-form" onSubmit={submit}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="cw-actions">
        <legend className="sr-only">검토 결과</legend>
        <label className="cw-check"><input type="radio" name="s" checked={status === "accepted"} onChange={() => setStatus("accepted")} /> 수용</label>
        <label className="cw-check"><input type="radio" name="s" checked={status === "modified"} onChange={() => setStatus("modified")} /> 수정 후 수용</label>
        <label className="cw-check"><input type="radio" name="s" checked={status === "dismissed"} onChange={() => setStatus("dismissed")} /> 기각</label>
      </fieldset>
      <label className="cw-field">검토 의견 {status !== "accepted" && "(필수)"}<textarea name="reviewNote" required={status !== "accepted"} maxLength={2000} placeholder="담당자가 확인한 사실, 수정한 판단, 기각 사유" /></label>
      <div className="cw-actions"><button className="btn btn-primary" disabled={api.pending}>검토 저장</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function TaskCreateForm({ recipientId, assessmentId, recordId, referralId, workers, defaults }: { recipientId: string; assessmentId?: string; recordId?: string; referralId?: string; workers: Opt[]; defaults?: { title?: string; description?: string; taskType?: string; priority?: string } }) {
  const api = useApi();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await api.run("/api/tasks", {
      method: "POST",
      body: {
        recipientId,
        assessmentId,
        recordId,
        referralId,
        taskType: f.get("taskType"),
        title: f.get("title"),
        description: f.get("description") || "",
        priority: f.get("priority"),
        assigneeId: f.get("assigneeId") || undefined,
        dueAt: f.get("dueAt") ? toIso(String(f.get("dueAt"))) : undefined,
      },
    }, { success: "조치 업무를 등록했습니다." });
    if (ok) form.reset();
  }
  return (
    <form className="cw-form" onSubmit={submit}>
      <div className="cw-form-row">
        <label className="cw-field wide">제목 <input name="title" required maxLength={120} defaultValue={defaults?.title} /></label>
        <label className="cw-field">유형 <select name="taskType" defaultValue={defaults?.taskType ?? "manual"}>{TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABEL[t]}</option>)}</select></label>
        <label className="cw-field">우선순위 <select name="priority" defaultValue={defaults?.priority ?? "medium"}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
        <label className="cw-field">담당자 <select name="assigneeId" defaultValue=""><option value="">나</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="cw-field">기한 <input type="datetime-local" name="dueAt" /></label>
      </div>
      <label className="cw-field">상세 설명<textarea name="description" maxLength={2000} defaultValue={defaults?.description} /></label>
      <div className="cw-actions"><button className="btn btn-primary" disabled={api.pending}>조치 등록</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function TaskUpdateForm({ id, status, workers, assigneeId, priority, dueAt }: { id: string; status: TaskStatus; workers: Opt[]; assigneeId: string | null; priority: string; dueAt: string | null }) {
  const api = useApi();
  const [next, setNext] = useState<TaskStatus>(status);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    if (next !== status) body.status = next;
    if (f.get("resultNote")) body.resultNote = f.get("resultNote");
    if (f.get("delayReason")) body.delayReason = f.get("delayReason");
    if (f.get("reopenReason")) body.reopenReason = f.get("reopenReason");
    if (f.get("assigneeId") && f.get("assigneeId") !== assigneeId) body.assigneeId = f.get("assigneeId");
    if (f.get("priority") !== priority) body.priority = f.get("priority");
    const due = f.get("dueAt") ? toIso(String(f.get("dueAt"))) : null;
    if (due !== (dueAt ? new Date(dueAt).toISOString() : null) && f.get("dueAt")) body.dueAt = due;
    await api.run(`/api/tasks/${id}`, { method: "PATCH", body }, { success: "저장했습니다." });
  }
  const options = [status, ...TASK_TRANSITIONS[status]];
  const local = dueAt ? new Date(new Date(dueAt).getTime() + 9 * 3600_000).toISOString().slice(0, 16) : "";
  return (
    <form className="cw-form" onSubmit={submit}>
      <div className="cw-form-row">
        <label className="cw-field">상태 <select value={next} onChange={(e) => setNext(e.target.value as TaskStatus)}>{options.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}{s === status ? " (현재)" : ""}</option>)}</select></label>
        <label className="cw-field">담당자 <select name="assigneeId" defaultValue={assigneeId ?? ""}><option value="">변경 안 함</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="cw-field">우선순위 <select name="priority" defaultValue={priority}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
        <label className="cw-field">기한 <input type="datetime-local" name="dueAt" defaultValue={local} /></label>
      </div>
      {(next === "completed" || next === "cancelled") && <label className="cw-field">{next === "completed" ? "처리 결과 (필수)" : "취소 사유 (필수)"}<textarea name="resultNote" required maxLength={2000} /></label>}
      {next === "waiting" && <label className="cw-field">대기·지연 사유<input name="delayReason" maxLength={1000} /></label>}
      {next === "open" && status !== "open" && <label className="cw-field">다시 여는 사유 (필수)<input name="reopenReason" required maxLength={1000} /></label>}
      <div className="cw-actions"><button className="btn btn-primary btn-sm" disabled={api.pending}>변경 저장</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function MatchPanel({ recipientId, taskId, initialTypes }: { recipientId: string; taskId?: string; initialTypes?: ServiceType[] }) {
  const api = useApi();
  const [result, setResult] = useState<{ needs: ServiceType[]; candidates: MatchCandidate[]; excluded: MatchExclusion[] } | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<Record<string, string>>({});
  async function find() {
    const res = await api.run<typeof result>(`/api/recipients/${recipientId}/service-matches`, { method: "POST", body: initialTypes?.length ? { serviceTypes: initialTypes } : {} }, { refresh: false });
    if (res) setResult(res);
  }
  async function refer(c: MatchCandidate) {
    const res = await api.run<{ id: string }>("/api/referrals", { method: "POST", body: { recipientId, serviceId: c.serviceId, taskId, confirmedReview: true } }, { success: `${c.serviceName} 의뢰를 생성했습니다.` });
    if (res) setCreated((m) => ({ ...m, [c.serviceId]: res.id }));
  }
  return (
    <div className="cw-form">
      <div className="cw-actions">
        <button type="button" className="btn btn-primary" onClick={find} disabled={api.pending}>{result ? "다시 찾기" : "서비스 후보 찾기"}</button>
        <span className="cw-meta">필요 지원 → 제공 지역 → 이용 조건 → 운영 여부 → 수용 상태 순서로 걸러냅니다 (규칙 기반).</span>
      </div>
      <Feedback error={api.error} message={api.message} />
      {result && (
        <>
          <p className="cw-meta">대상 필요 지원: {result.needs.map((n) => SERVICE_TYPE_LABEL[n]).join(", ") || "등록된 필요 지원 없음"}</p>
          {result.candidates.length === 0 ? (
            <p className="cw-msg msg-warn">조건에 맞는 서비스 후보가 없습니다. 제외 사유를 확인하고 지역 자원 확충이나 다른 지역 서비스를 검토하세요.</p>
          ) : (
            <ul className="cw-list">
              {result.candidates.map((c) => (
                <li key={c.serviceId}>
                  <div className="cw-actions" style={{ justifyContent: "space-between" }}>
                    <b>{c.serviceName}</b>
                    <span className={`badge ${c.status === "eligible" ? "ok" : "mid"}`} data-icon={c.status === "eligible" ? "✓" : "?"}>{c.status === "eligible" ? "알려진 충돌 없음" : "확인 필요"}</span>
                  </div>
                  <div className="cw-meta">
                    <span>{c.providerName}</span>
                    <span>수용 상태: {c.availability.label} {c.availability.verified ? "(기관 확인됨)" : "(미확인 · 가상 상태)"}</span>
                    {c.isDemoData && <span>가상 데이터</span>}
                  </div>
                  <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 14 }}>{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  {c.unverifiedConditions.length > 0 && (
                    <div className="cw-msg msg-warn" style={{ fontSize: 13 }}>
                      확인되지 않은 조건: {c.unverifiedConditions.join(" / ")}
                    </div>
                  )}
                  <p className="cw-meta">신청 방법: {c.applicationMethod} · 연락: {c.contactMethod}</p>
                  {created[c.serviceId] ? (
                    <p className="cw-msg msg-success">의뢰 {created[c.serviceId]} 생성됨 — 기관 접수를 기다립니다.</p>
                  ) : (
                    <div className="cw-actions">
                      <label className="cw-check"><input type="checkbox" checked={!!confirmed[c.serviceId]} onChange={(e) => setConfirmed((m) => ({ ...m, [c.serviceId]: e.target.checked }))} /> 추천 이유와 미확인 조건을 검토했습니다</label>
                      <button type="button" className="btn btn-outline btn-sm" disabled={!confirmed[c.serviceId] || api.pending} onClick={() => refer(c)}>서비스 의뢰 생성</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {result.excluded.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary>제외된 서비스 {result.excluded.length}개와 사유</summary>
              <ul style={{ fontSize: 13 }}>{result.excluded.map((x) => <li key={x.serviceId}>[{x.step}단계] {x.serviceName}: {x.reason}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function ReferralStatusForm({ id, status, isProvider }: { id: string; status: ReferralStatus; isProvider: boolean }) {
  const api = useApi();
  const options = REFERRAL_TRANSITIONS[status].filter((s) => !(isProvider && s === "cancelled"));
  const [next, setNext] = useState<ReferralStatus | "">("");
  if (options.length === 0) return <span className="cw-meta">종결된 의뢰입니다{status === "failed" ? " — 재의뢰는 서비스 후보에서 새로 생성하세요" : ""}.</span>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!next) return;
    const f = new FormData(e.currentTarget);
    await api.run(`/api/referrals/${id}`, { method: "PATCH", body: { status: next, failureReason: f.get("failureReason") || undefined, resultNote: f.get("resultNote") || undefined } }, { success: "상태를 변경했습니다." });
    setNext("");
  }
  return (
    <form onSubmit={submit} className="cw-form">
      <div className="cw-actions">
        <label className="cw-field">상태 변경 <select value={next} onChange={(e) => setNext(e.target.value as ReferralStatus)}><option value="">선택</option>{options.map((s) => <option key={s} value={s}>{REFERRAL_STATUS_LABEL[s]}</option>)}</select></label>
        {next === "failed" && <label className="cw-field">실패 사유 (필수)<input name="failureReason" required maxLength={1000} /></label>}
        {next && <label className="cw-field">처리 메모<input name="resultNote" maxLength={2000} /></label>}
        <button className="btn btn-outline btn-sm" disabled={!next || api.pending}>저장</button>
      </div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function SupportRequestForm({ id, status, response }: { id: string; status: SupportRequestStatus; response: string | null }) {
  const api = useApi();
  const options = SUPPORT_REQUEST_TRANSITIONS[status];
  const [next, setNext] = useState<SupportRequestStatus | "">("");
  if (!options.length) return <span className="cw-meta">종결된 문의입니다.</span>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api.run(`/api/portal/requests/${id}`, { method: "PATCH", body: { status: next, responseContent: f.get("responseContent") || undefined } }, { success: "처리 상태를 저장했습니다." });
    setNext("");
  }
  return (
    <form onSubmit={submit} className="cw-form">
      <div className="cw-form-row">
        <label className="cw-field">상태 <select value={next} onChange={(e) => setNext(e.target.value as SupportRequestStatus)} required><option value="">선택</option>{options.map((s) => <option key={s} value={s}>{SUPPORT_REQUEST_STATUS_LABEL[s]}</option>)}</select></label>
      </div>
      <label className="cw-field">답변 (가족·대상자에게 보입니다 · 쉬운 말로 작성){next === "answered" && " (필수)"}<textarea name="responseContent" defaultValue={response ?? ""} required={next === "answered"} maxLength={2000} /></label>
      <div className="cw-actions"><button className="btn btn-primary btn-sm" disabled={!next || api.pending}>저장</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export function FamilyLinkToggle({ id, status }: { id: string; status: string }) {
  const api = useApi();
  const next = status === "granted" ? "revoked" : "granted";
  return (
    <span className="cw-actions">
      <button type="button" className={`btn btn-sm ${next === "revoked" ? "btn-danger" : "btn-outline"}`} disabled={api.pending} onClick={() => api.run(`/api/family-links/${id}`, { method: "PATCH", body: { consentStatus: next } }, { success: next === "revoked" ? "권한을 철회했습니다. 즉시 적용됩니다." : "동의를 기록했습니다." })}>
        {next === "revoked" ? "동의 철회·접근 차단" : "동의 확인 기록"}
      </button>
      <Feedback error={api.error} message={api.message} />
    </span>
  );
}

export function MarkReadButton({ ids }: { ids: string[] | "all" }) {
  const api = useApi();
  return <button type="button" className="btn btn-outline btn-sm" disabled={api.pending} onClick={() => api.run("/api/notifications", { method: "PATCH", body: { ids } })}>{ids === "all" ? "모두 읽음" : "읽음"}</button>;
}

export function GenerateReportForm({ from, to, regionId, regions }: { from: string; to: string; regionId?: string; regions: { value: string; label: string }[] }) {
  const api = useApi();
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await api.run<{ id: string }>("/api/reports/generate", { method: "POST", body: { from: f.get("from"), to: f.get("to"), regionId: f.get("regionId") || undefined } }, { refresh: false });
    if (res) router.push(`/care/reports/${res.id}`);
  }
  return (
    <form className="cw-form" onSubmit={submit}>
      <div className="cw-form-row">
        <label className="cw-field">시작일 <input type="date" name="from" defaultValue={from} required /></label>
        <label className="cw-field">종료일 <input type="date" name="to" defaultValue={to} required /></label>
        <label className="cw-field">지역 <select name="regionId" defaultValue={regionId ?? ""}><option value="">전체(권한 범위)</option>{regions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
      </div>
      <div className="cw-actions"><button className="btn btn-primary" disabled={api.pending}>{api.pending ? "생성 중…" : "보고서 초안 생성"}</button></div>
      <Feedback error={api.error} message={api.message} />
    </form>
  );
}

export const RecipientLink = ({ id, code }: { id: string; code: string }) => <Link className="row-link" href={`/care/recipients/${id}`}>{code}</Link>;
