"use client";

import { useMemo, useState } from "react";
import { useHospital } from "@/components/hospital/HospitalContext";
import { Panel } from "@/components/ui/primitives";
import { CareStatusBadge } from "./StatusBadge";
import {
  auditEntry, authenticateStaff, confirmEvent, correctEvent, createCareEvent, encodeResidentTag, parseResidentTag,
  resolveResident, TAG_ERROR_TEXT, verifyEvent, type TagError
} from "@/lib/care/tagging";
import { eventStatus } from "@/lib/care/timeline";
import { captureRoute, GENERIC_WATCH_NO_NFC } from "@/lib/care/wearables";
import { CARE_TYPE_LABEL, CARE_TYPES, SOURCE_LABEL, type CareEvent, type CareType, type SourceDevice, type Staff } from "@/lib/care/types";
import { CARE_DEMO_NOW, CARE_RESIDENTS, CARE_STAFF } from "@/lib/demo/care-data";
import { formatKst } from "@/lib/demo/clock";

/**
 * 현장 케어 기록 (Quick Tagging) — mobile-first. Flow: ① 사원증 태그 → ② 환자 태그(QR/NFC) → ③ 케어 항목 선택 → ④ 수행자 확인.
 * DEMO: tags are simulated with buttons; the server clock is the fixed demo time. A tag touch only RECORDS the event; the care is
 * shown as done only after the performer confirms it, and as verified only after a different nurse verifies it.
 */
export function QuickCareView() {
  const { state, dispatch } = useHospital();
  const [badge, setBadge] = useState<string>("");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [tagRaw, setTagRaw] = useState<string>("");
  const [residentId, setResidentId] = useState<string | null>(null);
  const [source, setSource] = useState<SourceDevice>("nfc_mobile");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [n, setN] = useState(0);
  const nowIso = CARE_DEMO_NOW;
  const resident = CARE_RESIDENTS.find((r) => r.id === residentId) ?? null;
  const seq = state.careAudit.length + 1;
  const newId = () => `CE-L${String(state.careEvents.length + 1 + n).padStart(5, "0")}`;

  const err = (e: TagError) => setMsg({ ok: false, text: TAG_ERROR_TEXT[e] });

  const signIn = (b: string) => {
    setBadge(b);
    const r = authenticateStaff(b, CARE_STAFF);
    if (!r.ok) { setStaff(null); err(r.error); return; }
    setStaff(r.value); setMsg({ ok: true, text: `${r.value.name} (${r.value.role}) 인증됨 · 담당 ${r.value.wards.join(", ")}` });
  };

  const scan = (raw: string) => {
    setTagRaw(raw);
    const t = parseResidentTag(raw);
    if (!t.ok) { setResidentId(null); err(t.error); return; }
    const r = resolveResident(t.value, CARE_RESIDENTS);
    if (!r.ok) { setResidentId(null); err(r.error); return; }
    setResidentId(r.value.id); setMsg({ ok: true, text: `${r.value.displayName} 환자 확인됨` });
  };

  const record = (careType: CareType) => {
    if (!staff || !resident) return;
    const c = createCareEvent(state.careEvents, { staff, resident, careType, source, clientEventId: `ui-${seq}-${careType}-${n}`, serverNow: nowIso, notes, newId });
    if (!c.ok) {
      dispatch({ type: "careCommit", upsert: [], audit: auditEntry(seq, nowIso, staff.id, "care_event.reject", resident.id, null, c.error) });
      err(c.error); return;
    }
    setN((x) => x + 1);
    dispatch({ type: "careCommit", upsert: [c.value], audit: auditEntry(seq, nowIso, staff.id, "care_event.create", resident.id, c.value.care_event_id, `${CARE_TYPE_LABEL[careType]} · ${SOURCE_LABEL[source]}`) });
    setNotes("");
    setMsg({ ok: true, text: `${CARE_TYPE_LABEL[careType]} 기록됨 (서버 시각 ${formatKst(nowIso)}). 수행 후 '수행 확인'을 눌러 주세요.` });
  };

  const confirm = (e: CareEvent) => {
    if (!staff) return;
    const r = confirmEvent(e, staff, nowIso);
    if (!r.ok) { err(r.error); return; }
    dispatch({ type: "careCommit", upsert: [r.value], audit: auditEntry(seq, nowIso, staff.id, "care_event.confirm", e.resident_id, e.care_event_id) });
    setMsg({ ok: true, text: "수행자 확인을 남겼어요." });
  };
  const verify = (e: CareEvent) => {
    if (!staff || !resident) return;
    const r = verifyEvent(e, staff, resident, nowIso);
    if (!r.ok) { err(r.error); return; }
    dispatch({ type: "careCommit", upsert: [r.value], audit: auditEntry(seq, nowIso, staff.id, "care_event.verify", e.resident_id, e.care_event_id) });
    setMsg({ ok: true, text: "독립 검증을 남겼어요." });
  };
  const correct = (e: CareEvent) => {
    if (!staff || !resident) return;
    const reason = window.prompt("수정 사유를 입력해 주세요 (예: 항목 잘못 선택)") ?? "";
    const r = correctEvent(state.careEvents, e.care_event_id, staff, resident, { careType: e.care_type === "other" ? "observation" : "other" }, reason, nowIso, newId);
    if (!r.ok) { err(r.error); return; }
    setN((x) => x + 1);
    dispatch({ type: "careCommit", upsert: [r.value.voided, r.value.replacement], audit: auditEntry(seq, nowIso, staff.id, "care_event.correct", e.resident_id, e.care_event_id, `사유: ${reason} → ${r.value.replacement.care_event_id}`) });
    setMsg({ ok: true, text: "원본은 보존하고 수정 기록을 새로 남겼어요. 수정 기록도 다시 확인이 필요해요." });
  };

  const recent = useMemo(
    () => (residentId ? state.careEvents.filter((e) => e.resident_id === residentId).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)).slice(0, 8) : []),
    [state.careEvents, residentId]
  );
  const route = captureRoute(source === "wearable_watch" ? GENERIC_WATCH_NO_NFC : null);

  return (
    <div className="care-quick">
      <Panel id="qc-steps" title="현장 케어 기록 · Quick Tagging" actions={<span className="badge demo">DEMO 시뮬레이션</span>}>
        <ol className="care-steps">
          <li className={staff ? "done" : "current"}>
            <h3>① 직원 인증</h3>
            <p className="muted small">NFC 사원증을 휴대폰에 대거나 QR 사원증을 스캔해요.</p>
            <div className="care-chips" role="group" aria-label="데모 사원증">
              {CARE_STAFF.map((s) => (
                <button key={s.id} type="button" className={`chip ${badge === s.badgeId ? "on" : ""}`} onClick={() => signIn(s.badgeId)}>
                  {s.name}<small>{s.role}{s.active ? "" : " · 비활성"}</small>
                </button>
              ))}
            </div>
          </li>
          <li className={!staff ? "" : resident ? "done" : "current"}>
            <h3>② 환자 확인</h3>
            <p className="muted small">침상 태그(QR 또는 NFC)를 읽어요. 태그 손상·위조는 자동으로 거부돼요.</p>
            <div className="care-chips" role="group" aria-label="데모 침상 태그">
              {CARE_RESIDENTS.slice(0, 8).map((r) => (
                <button key={r.id} type="button" disabled={!staff} className={`chip ${residentId === r.id ? "on" : ""}`} onClick={() => scan(encodeResidentTag(r.tagId))}>
                  {r.displayName}<small>{r.ward}</small>
                </button>
              ))}
              <button type="button" disabled={!staff} className="chip warn" onClick={() => scan("NGT1:R:TAG-0001:ZZZZ")}>손상된 태그<small>테스트</small></button>
            </div>
            {tagRaw ? <p className="mono muted">{tagRaw}</p> : null}
          </li>
          <li className={staff && resident ? "current" : ""}>
            <h3>③ 케어 항목 기록</h3>
            <div className="care-source" role="radiogroup" aria-label="기록 방식">
              {(["nfc_mobile", "qr", "mobile_web", "wearable_watch"] as SourceDevice[]).map((s) => (
                <label key={s}><input type="radio" name="src" checked={source === s} onChange={() => setSource(s)} /> {SOURCE_LABEL[s]}</label>
              ))}
            </div>
            {source === "wearable_watch" && (
              <p className="care-note small">이 데모 워치는 앱에서 NFC를 쓸 수 없어요 → {route === "wearable_confirm_only" ? "QR로 시작하고 손목에서 수행 확인만 해요." : "QR로 기록해요."}</p>
            )}
            <div className="care-grid">
              {CARE_TYPES.map((c) => (
                <button key={c} type="button" className="care-tile" disabled={!staff || !resident} onClick={() => record(c)}>{CARE_TYPE_LABEL[c]}</button>
              ))}
            </div>
            <label className="care-notes">
              <span className="small muted">메모 (선택, 500자)</span>
              <input type="text" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} disabled={!staff || !resident} />
            </label>
          </li>
        </ol>
        {msg && <div className={`care-msg ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </Panel>

      <Panel id="qc-recent" title={resident ? `${resident.displayName} · 최근 기록` : "최근 기록"} flush>
        {!resident ? <p className="panel-b muted">환자를 확인하면 최근 기록과 확인 상태가 보여요.</p> : (
          <table className="tbl">
            <thead><tr><th>수행 시각</th><th>항목</th><th>방식</th><th>담당</th><th>상태</th><th /></tr></thead>
            <tbody>
              {recent.map((e) => {
                const who = CARE_STAFF.find((s) => s.id === e.staff_id);
                return (
                  <tr key={e.care_event_id} className={e.confirmation_status === "voided" ? "voided" : ""}>
                    <td className="nowrap">{formatKst(e.performed_at)}</td>
                    <td>{CARE_TYPE_LABEL[e.care_type]}{e.correction_reference ? <small className="muted"> · 수정({e.correction_reference})</small> : null}</td>
                    <td>{SOURCE_LABEL[e.source_device]}</td>
                    <td>{who?.name ?? e.staff_id}</td>
                    <td>{e.confirmation_status === "voided" ? <span className="badge">수정됨(원본 보존)</span> : <CareStatusBadge status={eventStatus(e, nowIso)} />}</td>
                    <td className="nowrap">
                      {e.confirmation_status === "recorded" && staff?.id === e.staff_id && <button type="button" className="btn btn-sm btn-primary" onClick={() => confirm(e)}>수행 확인</button>}
                      {e.confirmation_status === "staff_confirmed" && staff && staff.id !== e.staff_id && staff.role === "간호사" && <button type="button" className="btn btn-sm" onClick={() => verify(e)}>독립 검증</button>}
                      {e.confirmation_status !== "voided" && staff && <button type="button" className="btn-link" onClick={() => correct(e)}>수정</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel id="qc-audit" title="감사 로그 (이번 세션)" flush>
        {state.careAudit.length === 0 ? <p className="panel-b muted">아직 기록이 없어요.</p> : (
          <table className="tbl"><thead><tr><th>ID</th><th>시각</th><th>행위</th><th>직원</th><th>대상</th><th>내용</th></tr></thead>
            <tbody>{state.careAudit.slice(0, 12).map((a) => (
              <tr key={a.id}><td className="mono">{a.id}</td><td>{formatKst(a.at)}</td><td>{a.action}</td><td>{a.actor_staff_id}</td><td className="mono">{a.target_id ?? "—"}</td><td>{a.detail}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
