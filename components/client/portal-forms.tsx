"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SUPPORT_REQUEST_TYPES, SUPPORT_REQUEST_TYPE_LABEL } from "@/lib/domain/constants";
import { useApi } from "./use-api";

export function PortalLogout() {
  const router = useRouter();
  return (
    <button type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>
      나가기
    </button>
  );
}

export function PortalRequestForm({ recipientId, services }: { recipientId: string; services: { id: string; label: string }[] }) {
  const api = useApi();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await api.run("/api/portal/requests", {
      method: "POST",
      body: { recipientId, requestType: f.get("requestType"), title: f.get("title"), content: f.get("content"), relatedReferralId: f.get("relatedReferralId") || undefined },
    }, { success: "문의를 보냈어요. 담당자가 확인하면 아래 '내가 보낸 문의'에 답변이 표시됩니다." });
    if (ok) form.reset();
  }
  return (
    <form onSubmit={submit}>
      <label className="pt-field">어떤 문의인가요?
        <select name="requestType" defaultValue="schedule">{SUPPORT_REQUEST_TYPES.map((t) => <option key={t} value={t}>{SUPPORT_REQUEST_TYPE_LABEL[t]}</option>)}</select>
      </label>
      {services.length > 0 && (
        <label className="pt-field">관련 서비스 (선택)
          <select name="relatedReferralId" defaultValue=""><option value="">없음</option>{services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
      )}
      <label className="pt-field">제목<input name="title" required maxLength={80} /></label>
      <label className="pt-field">내용<textarea name="content" required maxLength={2000} placeholder="급한 상황이면 이 문의 대신 119 또는 담당 기관에 바로 연락하세요." /></label>
      <button className="pt-btn" disabled={api.pending}>{api.pending ? "보내는 중…" : "문의 보내기"}</button>
      {api.error && <p className="pt-msg error" role="alert">{api.error}</p>}
      {api.message && <p className="pt-msg success" role="status">{api.message}</p>}
    </form>
  );
}

export function PortalPreferences({ initial }: { initial: { inApp: boolean; scheduleReminders: boolean; requestUpdates: boolean } }) {
  const api = useApi();
  const [v, setV] = useState(initial);
  async function save(next: typeof v) {
    setV(next);
    await api.run("/api/notifications/preferences", { method: "PUT", body: next }, { success: "저장했어요." });
  }
  return (
    <div>
      <label className="pt-check"><input type="checkbox" checked={v.inApp} onChange={(e) => save({ ...v, inApp: e.target.checked })} /> 늘곁 화면 안에서 알림 받기</label>
      <label className="pt-check"><input type="checkbox" checked={v.scheduleReminders} onChange={(e) => save({ ...v, scheduleReminders: e.target.checked })} /> 방문 일정 알림</label>
      <label className="pt-check"><input type="checkbox" checked={v.requestUpdates} onChange={(e) => save({ ...v, requestUpdates: e.target.checked })} /> 문의 답변 알림</label>
      <p className="pt-meta">문자·카카오톡·이메일 알림은 아직 제공하지 않아요.</p>
      {api.error && <p className="pt-msg error" role="alert">{api.error}</p>}
      {api.message && <p className="pt-msg success" role="status">{api.message}</p>}
    </div>
  );
}
