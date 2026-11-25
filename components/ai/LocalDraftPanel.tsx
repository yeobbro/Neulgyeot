"use client";

import { useEffect, useState } from "react";
import { ruleDraft } from "@/lib/local-llm/facts";
import { LOCAL_DRAFT_LABEL, type DraftFact, type DraftSentence, type LocalDraftKind, type LocalDraftResult, type LocalLLMHealth } from "@/lib/local-llm/types";
import { joinForField } from "@/lib/local-llm/verify";
import { Badge } from "@/components/ui/primitives";
import styles from "./LocalDraftPanel.module.css";

interface Props {
  kind: LocalDraftKind;
  patientId: string;
  facts: DraftFact[];
  /** Writes the reviewed draft into the target field. Omit for read-only use (copy only). */
  onApply?: (text: string) => void;
  applyLabel?: string;
  maxChars?: number;
  disabled?: boolean;
}

type Draft = { engine: "local-llm" | "rules"; sentences: DraftSentence[]; model?: string; rejected: number; note?: string };

/**
 * "로컬 LLM 초안 (검토 필요)" — proposes text from the numbered facts shown below it. Each sentence carries the ids of
 * the facts it was built from. Nothing is saved or sent: staff apply the text into the field, edit it and save as usual.
 * Without a connected local LLM the panel offers the rule-based draft (the facts themselves).
 */
export function LocalDraftPanel({ kind, patientId, facts, onApply, applyLabel = "입력란에 적용", maxChars, disabled }: Props) {
  const [health, setHealth] = useState<LocalLLMHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<(Draft & { key: string }) | null>(null);
  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  // a draft belongs to one patient + kind + fact list; when any of them changes the old draft is simply not shown
  const key = `${kind}|${patientId}|${facts.map((f) => f.text).join("|")}`;
  const draft = saved?.key === key ? saved : null;
  const applied = appliedKey === key && draft !== null;
  const setDraft = (d: Draft) => setSaved({ ...d, key });
  const setApplied = (v: boolean) => setAppliedKey(v ? key : null);

  useEffect(() => {
    let live = true;
    fetch("/api/local-llm/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h: LocalLLMHealth) => live && setHealth(h))
      .catch(() => live && setHealth({ configured: false, ok: false, model: null, reason: "unreachable" }));
    return () => {
      live = false;
    };
  }, []);

  const byId = new Map(facts.map((f) => [f.id, f]));
  const rules = (note: string): Draft => ({ engine: "rules", sentences: ruleDraft(facts), rejected: 0, note });

  const run = async () => {
    setBusy(true);
    setApplied(false);
    try {
      const res = await fetch("/api/local-llm/draft", {
        method: "POST",
        headers: { "content-type": "application/json", "x-neulgyeot-local-llm": "1" },
        body: JSON.stringify({ kind, patientId, dataClass: "synthetic", facts })
      });
      const r = (await res.json()) as LocalDraftResult;
      if (r.status === "ok") setDraft({ engine: "local-llm", sentences: r.sentences, model: r.model, rejected: r.rejected.length });
      else setDraft(rules(`${r.message} 규칙 기반 초안(기록 사실 나열)을 보여 드립니다.`));
    } catch {
      setDraft(rules("로컬 LLM 요청에 실패했습니다. 규칙 기반 초안(기록 사실 나열)을 보여 드립니다."));
    } finally {
      setBusy(false);
    }
  };

  const text = draft ? joinForField(draft.sentences, kind, maxChars) : "";
  const connected = health?.ok === true;

  return (
    <div className={`llm-draft ${styles.panel}`} aria-live="polite">
      <div className={styles.head}>
        <strong>{LOCAL_DRAFT_LABEL[kind]}</strong>
        <span className="row" style={{ gap: 6 }}>
          {health === null ? (
            <Badge tone="outline">연결 확인 중</Badge>
          ) : connected ? (
            <Badge tone="teal">로컬 LLM 연결 · {health.model}</Badge>
          ) : (
            <Badge tone="outline">로컬 LLM 미연결 · 규칙 기반</Badge>
          )}
          <button type="button" className="btn btn-sm" disabled={busy || disabled || facts.length === 0} onClick={connected ? run : () => setDraft(rules("로컬 LLM이 연결되어 있지 않아 규칙 기반 초안(기록 사실 나열)을 보여 드립니다."))}>
            {busy ? "초안 작성 중…" : connected ? "로컬 LLM 초안 만들기" : "규칙 기반 초안 보기"}
          </button>
        </span>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        아래 기록 사실 {facts.length}개만 병원 내부의 로컬 LLM에 보냅니다(합성 DEMO 데이터만). 결과는 <b>검토가 필요한 초안</b>이며 자동 저장·전송되지 않습니다.
      </p>

      {draft ? (
        <>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone="amber">검토 필요</Badge>
            <Badge tone="outline">{draft.engine === "local-llm" ? `로컬 LLM · ${draft.model}` : "규칙 기반"}</Badge>
            {draft.rejected > 0 ? <span className="hint">검증에서 제외된 문장 {draft.rejected}개</span> : null}
          </div>
          {draft.note ? <div className="notice info">{draft.note}</div> : null}
          <ol className={`llm-sentences ${styles.sentences}`}>
            {draft.sentences.map((s, i) => (
              <li key={i}>
                {s.text}
                {s.factIds.map((id) => (
                  <span key={id} className={styles.cite} title={byId.get(id)?.text ?? ""}>{id}</span>
                ))}
              </li>
            ))}
          </ol>
          <div className="row" style={{ gap: 6 }}>
            {onApply ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={disabled || !text}
                onClick={() => {
                  onApply(text);
                  setApplied(true);
                }}
              >
                {applyLabel}
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" disabled={!text} onClick={() => navigator.clipboard?.writeText(text).catch(() => undefined)}>
              복사
            </button>
            {applied ? <span className="hint">입력란에 넣었습니다. 내용을 확인·수정한 뒤 평소처럼 저장해 주세요.</span> : null}
            {maxChars ? <span className="hint">{text.length}/{maxChars}자</span> : null}
          </div>
        </>
      ) : null}

      <details className={styles.facts}>
        <summary>보내는 기록 사실 보기 ({facts.length})</summary>
        <ol>
          {facts.map((f) => (
            <li key={f.id}>
              <span className="mono">{f.id}</span> {f.text} <span className="muted small">· {f.source}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
