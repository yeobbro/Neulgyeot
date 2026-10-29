"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RECORD_FLAGS, RECORD_FLAG_LABEL, RECORD_TYPES, RECORD_TYPE_LABEL, SERVICE_TYPES, SERVICE_TYPE_LABEL, type ServiceType } from "@/lib/domain/constants";
import type { StructuredDraft } from "@/lib/domain/voice-structure";
import { Feedback, useApi } from "./use-api";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type Phase = "idle" | "recording" | "transcribed" | "structured" | "saved";

const LIST_FIELDS: { key: keyof Omit<StructuredDraft, "summary" | "serviceTypes">; label: string }[] = [
  { key: "observations", label: "관찰 내용" },
  { key: "requestedSupport", label: "대상자가 요청한 지원" },
  { key: "checkItems", label: "확인이 필요한 사항" },
  { key: "followUps", label: "후속 조치 제안" },
];

export function VoiceRecorder({ recipients, initialRecipientId, aiConfigured }: { recipients: { id: string; label: string }[]; initialRecipientId?: string; aiConfigured: boolean }) {
  const api = useApi();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [recipientId, setRecipientId] = useState(initialRecipientId ?? "");
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>("visit");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [source, setSource] = useState<"browser_speech" | "typed">("typed");
  const [draft, setDraft] = useState<StructuredDraft | null>(null);
  const [method, setMethod] = useState<"ai" | "rules" | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    // Detecting browser support has to happen after mount; there is no server value to render instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => rec.current?.abort();
  }, []);

  function start() {
    setSpeechError(null);
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "ko-KR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) setTranscript((t) => (t ? `${t} ${finalText.trim()}` : finalText.trim()));
      setInterim(interimText);
    };
    r.onerror = (e) => {
      const msg: Record<string, string> = {
        "not-allowed": "마이크 사용이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용하거나, 아래에 직접 입력하세요.",
        "service-not-allowed": "이 브라우저에서 음성 인식 서비스를 사용할 수 없습니다. 직접 입력하세요.",
        "no-speech": "음성이 감지되지 않았습니다. 다시 시도하거나 직접 입력하세요.",
        network: "음성 인식 서버에 연결할 수 없습니다. 직접 입력하세요.",
        "audio-capture": "마이크를 찾을 수 없습니다. 직접 입력하세요.",
      };
      setSpeechError(msg[e.error] ?? "음성 변환에 실패했습니다. 직접 입력하세요.");
      setPhase((p) => (p === "recording" ? "idle" : p));
    };
    r.onend = () => {
      setInterim("");
      setPhase((p) => (p === "recording" ? "transcribed" : p));
    };
    rec.current = r;
    setSource("browser_speech");
    setPhase("recording");
    r.start();
  }
  function stop() {
    rec.current?.stop();
  }
  function cancel() {
    rec.current?.abort();
    setTranscript("");
    setInterim("");
    setPhase("idle");
  }

  async function structure() {
    if (!recipientId) return api.setError("대상자를 선택하세요.");
    const res = await api.run<{ method: "ai" | "rules"; draft: StructuredDraft; aiStatus: string; aiError?: string }>("/api/voice/structure", { method: "POST", body: { transcript } }, { refresh: false });
    if (!res) return;
    setDraft(res.draft);
    setMethod(res.method);
    if (res.aiStatus === "failed") api.setMessage(`AI 구조화에 실패해 규칙 기반 초안을 만들었습니다 (${res.aiError}).`);
    const d = await api.run<{ id: string }>("/api/voice/drafts", { method: "POST", body: { recipientId, recordType, transcript, transcriptSource: source, structuredContent: res.draft, structuringMethod: res.method } }, { refresh: false });
    if (d) {
      setDraftId(d.id);
      setPhase("structured");
    }
  }

  async function save() {
    if (!draftId || !draft) return;
    const res = await api.run<{ savedRecordId: string }>(`/api/voice/drafts/${draftId}`, { method: "PATCH", body: { action: "save", transcript, structuredContent: draft, recordType, flags, reviewedByStaff: reviewed } }, { success: "공식 기록으로 저장했습니다.", refresh: false });
    if (res) {
      setSavedRecordId(res.savedRecordId);
      setPhase("saved");
    }
  }
  async function discard() {
    if (draftId) await api.run(`/api/voice/drafts/${draftId}`, { method: "PATCH", body: { action: "discard" } }, { refresh: false });
    setDraft(null);
    setDraftId(null);
    setTranscript("");
    setPhase("idle");
  }

  const editList = (key: (typeof LIST_FIELDS)[number]["key"], value: string) => setDraft((d) => (d ? { ...d, [key]: value.split("\n").map((s) => s.trim()).filter(Boolean) } : d));

  if (phase === "saved") {
    return (
      <div className="cw-form">
        <p className="cw-msg msg-success" role="status">기록 {savedRecordId}을(를) 저장했습니다. 원본 녹음은 저장되지 않았습니다.</p>
        <div className="cw-actions">
          <Link className="btn btn-outline" href={`/care/recipients/${recipientId}?tab=records#${savedRecordId}`}>저장한 기록 보기</Link>
          <button type="button" className="btn btn-primary" onClick={() => { setPhase("idle"); setTranscript(""); setDraft(null); setDraftId(null); setReviewed(false); setFlags([]); }}>새 기록</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cw-form">
      <div className="cw-form-row">
        <label className="cw-field">대상자 <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} required disabled={phase === "structured"}><option value="">선택</option>{recipients.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <label className="cw-field">기록 유형 <select value={recordType} onChange={(e) => setRecordType(e.target.value as typeof recordType)}>{RECORD_TYPES.map((t) => <option key={t} value={t}>{RECORD_TYPE_LABEL[t]}</option>)}</select></label>
      </div>

      <div className="cw-panel" style={{ background: "#fafbf7" }}>
        <h3>1. 음성 입력 {supported === false && <span className="hint">이 브라우저는 음성 인식을 지원하지 않습니다 — 직접 입력하세요</span>}</h3>
        <div className="cw-actions">
          {phase !== "recording" ? (
            <button type="button" className="btn btn-primary" onClick={start} disabled={!supported || phase === "structured"}>● 녹음 시작</button>
          ) : (
            <>
              <span className="badge high" data-icon="●" role="status" aria-live="polite">녹음 중 — 마이크가 켜져 있습니다</span>
              <button type="button" className="btn btn-primary" onClick={stop}>■ 녹음 종료</button>
              <button type="button" className="btn btn-danger" onClick={cancel}>녹음 취소</button>
            </>
          )}
        </div>
        {supported && phase === "idle" && <p className="cw-meta">녹음 시작을 누르면 브라우저가 마이크 권한을 요청합니다. 음성은 브라우저의 음성 인식 서비스로 전송될 수 있습니다.</p>}
        {speechError && <p className="cw-msg msg-warn" role="alert">{speechError}</p>}
        {interim && <p className="cw-meta" aria-live="polite">변환 중: {interim}</p>}
      </div>

      <label className="cw-field">2. 텍스트 확인·직접 입력 (변환 결과를 고칠 수 있습니다)
        <textarea value={transcript} onChange={(e) => { setTranscript(e.target.value); if (phase === "idle") setSource("typed"); }} rows={6} maxLength={8000} disabled={phase === "structured"} placeholder="예: 오늘 방문했더니 난방이 약하다고 하셨다. 식사 지원을 계속 원하신다. 다음 주에 보일러 상태를 다시 확인할 예정." />
      </label>
      {phase !== "structured" && (
        <div className="cw-actions">
          <button type="button" className="btn btn-primary" disabled={!transcript.trim() || !recipientId || api.pending || phase === "recording"} onClick={structure}>
            3. 기록 초안 만들기 ({aiConfigured ? "AI 구조화" : "규칙 기반"})
          </button>
        </div>
      )}

      {phase === "structured" && draft && (
        <div className="cw-panel">
          <h3>4. 초안 검토·수정 <span className={`badge ${method === "ai" ? "ai" : "neutral"}`} data-icon="✦">{method === "ai" ? "AI 구조화 초안" : "규칙 기반 초안"}</span></h3>
          <p className="cw-meta">초안은 담당자가 말한 내용을 분류한 것입니다. 사실과 다르거나 빠진 내용을 고친 뒤 저장하세요.</p>
          <label className="cw-field">기록 요약<textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={2} /></label>
          {LIST_FIELDS.map((f) => (
            <label key={f.key} className="cw-field">{f.label} (한 줄에 하나)<textarea value={draft[f.key].join("\n")} onChange={(e) => editList(f.key, e.target.value)} rows={3} /></label>
          ))}
          <fieldset style={{ border: 0, padding: 0 }}>
            <legend className="cw-field">관련 서비스 유형</legend>
            <div className="cw-actions">{SERVICE_TYPES.map((t) => <label key={t} className="cw-check"><input type="checkbox" checked={draft.serviceTypes.includes(t)} onChange={(e) => setDraft({ ...draft, serviceTypes: e.target.checked ? [...draft.serviceTypes, t] : draft.serviceTypes.filter((x: ServiceType) => x !== t) })} /> {SERVICE_TYPE_LABEL[t]}</label>)}</div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0 }}>
            <legend className="cw-field">확인 표시</legend>
            <div className="cw-actions">{RECORD_FLAGS.map((x) => <label key={x} className="cw-check"><input type="checkbox" checked={flags.includes(x)} onChange={(e) => setFlags(e.target.checked ? [...flags, x] : flags.filter((y) => y !== x))} /> {RECORD_FLAG_LABEL[x]}</label>)}</div>
          </fieldset>
          <label className="cw-check" style={{ marginTop: 8 }}><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> 초안 내용을 검토했고 공식 기록으로 저장합니다</label>
          <div className="cw-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" disabled={!reviewed || api.pending} onClick={save}>공식 기록으로 저장</button>
            <button type="button" className="btn btn-danger" onClick={discard} disabled={api.pending}>초안 폐기</button>
          </div>
        </div>
      )}
      <Feedback error={api.error} message={api.message} />
    </div>
  );
}
