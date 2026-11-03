"use client";

import { useState } from "react";
import { formatKst } from "@/lib/demo/clock";
import type { TransferRecord, TransferStatus } from "@/lib/integrations/municipal-referral/types";
import { Badge, Panel, type Tone } from "@/components/ui/primitives";

export const TRANSFER_TONE: Record<TransferStatus, Tone> = {
  "전송 완료": "blue",
  "수신 확인": "blue",
  "심사 중": "blue",
  "보완 요청": "amber",
  승인: "green",
  반려: "red",
  "연계 종료": "outline"
};

interface Props {
  transfers: TransferRecord[];
  busy: boolean;
  canAdvance: (t: TransferRecord) => boolean;
  onAdvance: (t: TransferRecord) => void;
  onResubmit: (t: TransferRecord, note: string) => void;
}

export function TransferTimeline({ transfers, busy, canAdvance, onAdvance, onResubmit }: Props) {
  const [note, setNote] = useState("");

  return (
    <Panel title="연계 이력 · 상태 동기화" id="transfers" actions={<Badge tone="demo">모의 응답</Badge>}>
      {transfers.length === 0 ? (
        <p className="muted">아직 전송된 연계 건이 없습니다.</p>
      ) : (
        <div className="stack">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>전송 ID</th>
                  <th>수신 지자체</th>
                  <th>전송 일시</th>
                  <th>현재 상태</th>
                  <th>상태 갱신</th>
                  <th>사유 / 최근 응답</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.transferId}>
                    <td className="mono nowrap">{t.transferId}</td>
                    <td>{t.municipalityName}</td>
                    <td className="nowrap">{formatKst(t.submittedAt)}</td>
                    <td><Badge tone={TRANSFER_TONE[t.status]}>{t.status}</Badge></td>
                    <td className="nowrap">{formatKst(t.statusUpdatedAt)}</td>
                    <td>
                      {t.reason ? <strong>{t.reason}</strong> : null}
                      <span className="muted small" style={{ display: "block" }}>{t.latestMessage}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {transfers.map((t) => (
            <section key={t.transferId} className="panel" aria-label={`${t.transferId} 타임라인`}>
              <div className="panel-h">
                <h3 className="mono">{t.transferId}</h3>
                <div className="actions">
                  <span className="hint mono">Idempotency-Key {t.idempotencyKey} · Trace {t.traceId}</span>
                </div>
              </div>
              <div className="panel-b">
                <ol className="timeline">
                  {t.events.map((e, i) => (
                    <li key={i} className={e.actor === "병원 (DEMO)" ? "hospital" : "muni"}>
                      <span className="t-at">{formatKst(e.at)}</span>
                      <span className="t-dot" aria-hidden="true" />
                      <span>
                        <Badge tone={TRANSFER_TONE[e.status]}>{e.status}</Badge> <span className="small muted">{e.actor}</span>
                        <span style={{ display: "block" }}>{e.message}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="row" style={{ marginTop: 8 }}>
                  {canAdvance(t) ? (
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onAdvance(t)}>
                      {busy ? "처리 중…" : "다음 모의 응답 받기"}
                    </button>
                  ) : null}
                  {t.status === "연계 종료" ? <span className="hint">병원 측 연계 절차가 종료되었습니다. 사례관리는 별도 지자체 시스템 소관입니다.</span> : null}
                  {t.status === "반려" ? <span className="hint">반려된 건은 수정 후 새 연계로 다시 전송할 수 있습니다.</span> : null}
                </div>
                {t.status === "보완 요청" ? (
                  <div className="stack" style={{ marginTop: 8 }}>
                    <label className="field">
                      <span className="label">보완 내용 (DEMO)</span>
                      <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="보완한 항목을 요약 (실제 개인정보 입력 금지)" />
                    </label>
                    <div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy || note.trim().length < 5}
                        onClick={() => {
                          onResubmit(t, note);
                          setNote("");
                        }}
                      >
                        보완 제출 (DEMO)
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
