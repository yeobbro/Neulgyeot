"use client";

import { DEMO_STAFF, MUNICIPALITIES } from "@/lib/demo/hospital-data";
import type { Patient } from "@/lib/hospital/types";
import {
  RETENTION_LABEL,
  TRANSFER_CATEGORIES,
  type ConsentRecord,
  type ConsenterType,
  type RetentionPeriod,
  type SensitiveConsentStatus,
  type TransferCategory
} from "@/lib/integrations/municipal-referral/types";
import { consentChecks, isSensitiveCategory } from "@/lib/integrations/municipal-referral/validation";
import { Badge, Checklist, Panel } from "@/components/ui/primitives";

interface Props {
  patient: Patient;
  value: ConsentRecord;
  locked: boolean;
  onChange: (patch: Partial<ConsentRecord>) => void;
  onWithdraw: (withdrawn: boolean) => void;
}

export function ConsentPanel({ patient, value: c, locked, onChange, onWithdraw }: Props) {
  const checks = consentChecks(c);
  const passed = checks.filter((x) => x.ok).length;
  const hasSensitive = c.categories.some(isSensitiveCategory);

  const toggleCategory = (id: TransferCategory) => {
    const next = c.categories.includes(id) ? c.categories.filter((x) => x !== id) : [...c.categories, id];
    const patch: Partial<ConsentRecord> = { categories: next };
    if (!next.some(isSensitiveCategory) && c.sensitiveConsent === "granted") patch.sensitiveConsent = "notApplicable";
    onChange(patch);
  };

  return (
    <Panel
      title="3. 제3자 제공 동의 · 법적 근거 검토"
      id="consent"
      actions={
        <>
          <Badge tone={passed === checks.length ? "green" : "amber"}>
            확인 {passed}/{checks.length}
          </Badge>
          <Badge tone="outline">양식 v{c.version}</Badge>
        </>
      }
    >
      <div className="notice warn" style={{ marginBottom: 10 }}>
        데모 워크플로입니다. 동의만으로 모든 의무기록 제공이 허용된다고 가정하지 않으며, 실제 운영 전 병원·지자체 개인정보 및 법률 검토가 필요합니다. 실제 동의서나 개인정보를 업로드하지 마세요.
      </div>
      {c.withdrawn ? (
        <div className="notice danger" role="status" style={{ marginBottom: 10 }}>
          동의 철회가 기록되었습니다. 전송이 차단됩니다.
        </div>
      ) : null}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <fieldset disabled={locked} className="stack">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="cs-muni">수신 지자체<span className="req">*</span></label>
              <select
                id="cs-muni"
                className="select"
                value={c.municipalityCode}
                onChange={(e) => {
                  const m = MUNICIPALITIES.find((x) => x.code === e.target.value);
                  onChange({ municipalityCode: e.target.value, recipientOrganization: m?.organization ?? "" });
                }}
              >
                {MUNICIPALITIES.map((m) => (
                  <option key={m.code} value={m.code}>{m.name}</option>
                ))}
              </select>
              <span className="hint mono">{c.municipalityCode}</span>
            </div>
            <div className="field">
              <label htmlFor="cs-org">수신 기관<span className="req">*</span></label>
              <input id="cs-org" className="input" value={c.recipientOrganization} onChange={(e) => onChange({ recipientOrganization: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="cs-purpose">제공 목적<span className="req">*</span></label>
            <input id="cs-purpose" className="input" value={c.purpose} onChange={(e) => onChange({ purpose: e.target.value })} />
          </div>

          <fieldset>
            <legend>제공 항목 (최소 필요 범위)<span className="req">*</span></legend>
            <div className="stack" style={{ gap: 4 }}>
              {TRANSFER_CATEGORIES.map((cat) => (
                <label key={cat.id} className={`check ${cat.required ? "disabled" : ""}`}>
                  <input type="checkbox" checked={c.categories.includes(cat.id)} disabled={cat.required} onChange={() => toggleCategory(cat.id)} />
                  <span>
                    {cat.label}
                    {cat.required ? <span className="opt">필수</span> : null}
                    {cat.sensitive ? <> <Badge tone="amber">민감정보</Badge></> : null}
                    <span className="hint" style={{ display: "block" }}>{cat.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <span className="hint">부진단 전체, 간호기록 전문, 활력징후, 연락처는 제공 항목에서 제외됩니다.</span>
          </fieldset>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="cs-ret">보유·이용 기간<span className="req">*</span></label>
              <select id="cs-ret" className="select" value={c.retention ?? ""} onChange={(e) => onChange({ retention: (e.target.value || null) as RetentionPeriod | null })}>
                <option value="">선택</option>
                {(Object.entries(RETENTION_LABEL) as [RetentionPeriod, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cs-at">동의 일시<span className="req">*</span></label>
              <input id="cs-at" className="input" type="datetime-local" value={c.consentAt} max="2026-11-03T23:59" onChange={(e) => onChange({ consentAt: e.target.value })} />
            </div>
          </div>
        </fieldset>

        <fieldset disabled={locked} className="stack">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="cs-rec">동의 기록자<span className="req">*</span></label>
              <select id="cs-rec" className="select" value={c.recorder} onChange={(e) => onChange({ recorder: e.target.value })}>
                <option value="">선택</option>
                {DEMO_STAFF.recorders.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cs-type">동의 주체<span className="req">*</span></label>
              <select
                id="cs-type"
                className="select"
                value={c.consenterType ?? ""}
                onChange={(e) => {
                  const t = (e.target.value || null) as ConsenterType | null;
                  onChange({ consenterType: t, consenterName: t === "patient" ? patient.name : "", representativeAuthorityVerified: false });
                }}
              >
                <option value="">선택</option>
                <option value="patient">환자 본인</option>
                <option value="legalRepresentative">법정대리인</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cs-name">동의자 성명<span className="req">*</span></label>
            <input id="cs-name" className="input" value={c.consenterName} onChange={(e) => onChange({ consenterName: e.target.value })} placeholder="가상 성명만 입력" />
          </div>
          {c.consenterType === "legalRepresentative" ? (
            <label className="check">
              <input type="checkbox" checked={c.representativeAuthorityVerified} onChange={(e) => onChange({ representativeAuthorityVerified: e.target.checked })} />
              법정대리인 권한 확인 서류 확인 (DEMO 표시)
            </label>
          ) : null}
          <div className="grid-2">
            <div className="field">
              <label htmlFor="cs-doc">동의서 참조번호<span className="req">*</span></label>
              <input id="cs-doc" className="input mono" value={c.documentRef} onChange={(e) => onChange({ documentRef: e.target.value })} placeholder="DEMO-CONSENT-0001" />
            </div>
            <div className="field">
              <label htmlFor="cs-docst">동의서 확인 상태<span className="req">*</span></label>
              <select id="cs-docst" className="select" value={c.documentStatus} onChange={(e) => onChange({ documentStatus: e.target.value as ConsentRecord["documentStatus"] })}>
                <option value="notVerified">미확인</option>
                <option value="verifiedDemo">서명본 확인 (DEMO 표시)</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cs-sens">
              민감정보 별도 동의{hasSensitive ? <span className="req">*</span> : <span className="opt">민감정보 항목 미선택</span>}
            </label>
            <select id="cs-sens" className="select" value={c.sensitiveConsent} onChange={(e) => onChange({ sensitiveConsent: e.target.value as SensitiveConsentStatus })}>
              <option value="notApplicable">해당 없음</option>
              <option value="granted">별도 동의 받음</option>
              <option value="notGranted">동의하지 않음</option>
            </select>
          </div>

          <p className="subhead" style={{ marginTop: 4 }}>기관 검토 (DEMO 표시)</p>
          <label className="check">
            <input
              type="checkbox"
              checked={c.review.hospitalPrivacyReviewed}
              onChange={(e) => onChange({ review: { ...c.review, hospitalPrivacyReviewed: e.target.checked } })}
            />
            병원 개인정보보호 담당 검토 완료 표시
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={c.review.municipalRequirementChecked}
              onChange={(e) => onChange({ review: { ...c.review, municipalRequirementChecked: e.target.checked } })}
            />
            수신 지자체 접수 요건 확인 표시
          </label>
          <div className="field">
            <label htmlFor="cs-legal">법적 근거 검토 메모<span className="req">*</span></label>
            <textarea
              id="cs-legal"
              className="textarea"
              value={c.review.legalBasisNote}
              onChange={(e) => onChange({ review: { ...c.review, legalBasisNote: e.target.value } })}
              placeholder="예: 본인 동의 및 기관 검토 기준 확인 (DEMO). 실제 법적 판단 아님."
            />
          </div>
        </fieldset>
      </div>

      <hr className="divider" />
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div>
          <p className="subhead">동의·검토 조건</p>
          <Checklist checks={checks} />
        </div>
        <div className="stack">
          <p className="subhead">동의 철회</p>
          <p className="small">
            철회 상태: <Badge tone={c.withdrawn ? "red" : "green"}>{c.withdrawn ? "철회됨" : "철회 없음"}</Badge>
          </p>
          <div>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onWithdraw(!c.withdrawn)}>
              {c.withdrawn ? "철회 기록 취소 (DEMO)" : "동의 철회 기록"}
            </button>
          </div>
          <p className="hint">철회 시 신규 전송이 차단됩니다. 이미 전송된 건의 처리 중단 요청은 운영 단계에서 지자체 연계 규격에 따라 정의해야 합니다.</p>
        </div>
      </div>
    </Panel>
  );
}
