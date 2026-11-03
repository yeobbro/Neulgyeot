"use client";

import { useState } from "react";
import type { ReferralEnvelope } from "@/lib/integrations/municipal-referral/types";
import { TRANSFER_CATEGORIES } from "@/lib/integrations/municipal-referral/types";
import { validateReferralEnvelope } from "@/lib/integrations/municipal-referral/validation";
import { Badge, Panel } from "@/components/ui/primitives";

export function PayloadPreview({ envelope }: { envelope: ReferralEnvelope }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const json = JSON.stringify(envelope, null, 2);
  const issues = validateReferralEnvelope(envelope);
  const included = TRANSFER_CATEGORIES.filter((c) => envelope.consent.scope.includes(c.id));
  const excluded = TRANSFER_CATEGORIES.filter((c) => !envelope.consent.scope.includes(c.id));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2000);
  };

  return (
    <Panel
      title="4. 전송 데이터 미리보기 (JSON)"
      id="payload"
      actions={
        <>
          <Badge tone="outline">schema v{envelope.schemaVersion}</Badge>
          <Badge tone={issues.length ? "amber" : "green"}>{issues.length ? `구조 검증 ${issues.length}건` : "구조 검증 통과"}</Badge>
          <button type="button" className="btn btn-sm" onClick={copy}>
            {copied === "ok" ? "복사됨" : copied === "fail" ? "복사 실패" : "JSON 복사"}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 8 }}>
        예시 계약(illustrative contract)이며 확정된 정부·지자체 연계 표준이 아닙니다. 동의된 최소 항목만 포함하고 EMR 전체·병력 전체·간호기록 전문은 포함하지 않습니다.
      </p>
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <div>
          <p className="subhead">포함 항목 ({included.length})</p>
          <div className="row">{included.map((c) => <Badge key={c.id} tone="teal">{c.label}</Badge>)}</div>
        </div>
        <div>
          <p className="subhead">제외 항목</p>
          <div className="row">
            {excluded.map((c) => <Badge key={c.id} tone="outline">{c.label}</Badge>)}
            <Badge tone="outline">부진단·병력 전체</Badge>
            <Badge tone="outline">간호기록 전문</Badge>
            <Badge tone="outline">활력징후</Badge>
            <Badge tone="outline">연락처</Badge>
          </div>
        </div>
      </div>
      {issues.length ? (
        <ul className="notice warn" style={{ display: "block", margin: "0 0 10px", paddingLeft: 24 }}>
          {issues.map((i) => (
            <li key={i.path}>
              <span className="mono">{i.path}</span> — {i.message}
            </li>
          ))}
        </ul>
      ) : null}
      <pre className="code" tabIndex={0} aria-label="전송 JSON 미리보기">{json}</pre>
    </Panel>
  );
}
