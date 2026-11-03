"use client";

import { useState } from "react";
import { formatKst } from "@/lib/demo/clock";
import { K_ADL_LABEL, type KAdlLevel, type Patient } from "@/lib/hospital/types";
import {
  BARRIER_LABEL,
  COGNITION_LABEL,
  FALL_RISK_LABEL,
  HOUSING_LABEL,
  LIVING_LABEL,
  SERVICE_LABEL,
  type CognitionStatus,
  type CommunityService,
  type FallRiskBand,
  type HousingBarrier,
  type HousingType,
  type LivingArrangement,
  type SocialWorkAssessment
} from "@/lib/integrations/municipal-referral/types";
import { NOTE_MAX, validateAssessment } from "@/lib/integrations/municipal-referral/validation";
import { Badge, Panel } from "@/components/ui/primitives";

interface Props {
  patient: Patient;
  value: SocialWorkAssessment;
  locked: boolean;
  onChange: (patch: Partial<SocialWorkAssessment>) => void;
  onSave: () => void;
}

const entries = <K extends string>(r: Record<K, string>) => Object.entries(r) as [K, string][];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function AssessmentForm({ patient, value: a, locked, onChange, onSave }: Props) {
  const [showErrors, setShowErrors] = useState(false);
  const issues = validateAssessment(a);
  const err = (path: string) => (showErrors ? issues.find((i) => i.path === path)?.message : undefined);
  const errId = (path: string) => `as-${path.replace(".", "-")}-err`;

  const errorText = (path: string) => {
    const m = err(path);
    return m ? <span className="err" id={errId(path)}>{m}</span> : null;
  };

  return (
    <Panel
      title="2. 사회복지 평가"
      id="assessment"
      actions={
        <>
          {a.savedAt ? <Badge tone="green">임시저장 {formatKst(a.savedAt)}</Badge> : <Badge tone="amber">저장되지 않은 변경</Badge>}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={locked}
            onClick={() => {
              setShowErrors(true);
              onSave();
            }}
          >
            임시저장
          </button>
        </>
      }
    >
      {locked ? <div className="notice info" style={{ marginBottom: 10 }}>진행 중인 연계 건이 있어 평가를 수정할 수 없습니다.</div> : null}
      <p className="hint" style={{ marginBottom: 10 }}>
        <span className="req">*</span> 필수 항목. K-ADL·낙상 구간은 EMR 최근 평가로 미리 채워졌으며 사회복지사가 확인 후 저장합니다. 미완성 상태로도 임시저장할 수 있으나 전송은 불가합니다.
      </p>
      <fieldset disabled={locked} className="stack">
        <div className="grid-3">
          {(["eating", "mobility", "toileting"] as const).map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`as-${k}`}>
                K-ADL {{ eating: "식사", mobility: "이동", toileting: "화장실 사용" }[k]}
                <span className="req">*</span>
              </label>
              <select
                id={`as-${k}`}
                className="select"
                value={a.kAdl[k] ?? ""}
                aria-invalid={Boolean(err(`kAdl.${k}`))}
                aria-describedby={err(`kAdl.${k}`) ? errId(`kAdl.${k}`) : undefined}
                onChange={(e) => onChange({ kAdl: { ...a.kAdl, [k]: e.target.value ? (Number(e.target.value) as KAdlLevel) : null } })}
              >
                <option value="">선택</option>
                {([1, 2, 3] as KAdlLevel[]).map((l) => (
                  <option key={l} value={l}>{l} · {K_ADL_LABEL[l]}</option>
                ))}
              </select>
              {errorText(`kAdl.${k}`)}
            </div>
          ))}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="as-cog">인지·의사소통 상태<span className="req">*</span></label>
            <select
              id="as-cog"
              className="select"
              value={a.cognition ?? ""}
              aria-invalid={Boolean(err("cognition"))}
              onChange={(e) => onChange({ cognition: (e.target.value || null) as CognitionStatus | null })}
            >
              <option value="">선택</option>
              {entries(COGNITION_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <span className="hint">
              EMR 기록: {patient.cognition.tool} {patient.cognition.score ?? "기록 없음"}
              {patient.cognition.assessedAt ? ` (${patient.cognition.assessedAt})` : ""}
            </span>
            {errorText("cognition")}
          </div>
          <div className="field">
            <label htmlFor="as-fall">낙상 위험 구간<span className="req">*</span></label>
            <select
              id="as-fall"
              className="select"
              value={a.fallRisk ?? ""}
              aria-invalid={Boolean(err("fallRisk"))}
              onChange={(e) => onChange({ fallRisk: (e.target.value || null) as FallRiskBand | null })}
            >
              <option value="">선택</option>
              {entries(FALL_RISK_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <span className="hint">EMR 기록: {patient.fallRisk.tool} {patient.fallRisk.score ?? "기록 없음"}</span>
            {errorText("fallRisk")}
          </div>
        </div>

        <hr className="divider" />

        <div className="grid-2">
          <fieldset>
            <legend>퇴원 후 동거 형태<span className="req">*</span></legend>
            <div className="choice-row" role="radiogroup">
              {entries(LIVING_LABEL).map(([k, l]) => (
                <label className="check" key={k}>
                  <input type="radio" name="living" checked={a.livingArrangement === k} onChange={() => onChange({ livingArrangement: k as LivingArrangement })} />
                  {l}
                </label>
              ))}
            </div>
            {a.livingArrangement === "other" ? (
              <input
                className="input"
                aria-label="기타 동거 형태"
                placeholder="기타 동거 형태 입력"
                value={a.livingArrangementOther}
                aria-invalid={Boolean(err("livingArrangementOther"))}
                onChange={(e) => onChange({ livingArrangementOther: e.target.value })}
              />
            ) : null}
            {errorText("livingArrangement")}
            {errorText("livingArrangementOther")}
          </fieldset>
          <div className="field">
            <label htmlFor="as-housing">주거 형태<span className="req">*</span></label>
            <select
              id="as-housing"
              className="select"
              value={a.housingType ?? ""}
              aria-invalid={Boolean(err("housingType"))}
              onChange={(e) => onChange({ housingType: (e.target.value || null) as HousingType | null })}
            >
              <option value="">선택</option>
              {entries(HOUSING_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            {a.housingType === "other" ? (
              <input className="input" aria-label="기타 주거 형태" placeholder="기타 주거 형태 입력" value={a.housingTypeOther} onChange={(e) => onChange({ housingTypeOther: e.target.value })} />
            ) : null}
            {errorText("housingType")}
            {errorText("housingTypeOther")}
          </div>
        </div>

        <fieldset>
          <legend>주거 장애요인<span className="opt">선택</span></legend>
          <div className="choice-row">
            {entries(BARRIER_LABEL).map(([k, l]) => (
              <label className="check" key={k}>
                <input type="checkbox" checked={a.barriers.includes(k)} onChange={() => onChange({ barriers: toggle<HousingBarrier>(a.barriers, k) })} />
                {l}
              </label>
            ))}
          </div>
          {a.barriers.includes("other") ? (
            <input className="input" aria-label="기타 주거 장애요인" placeholder="기타 장애요인 입력" value={a.barrierOther} onChange={(e) => onChange({ barrierOther: e.target.value })} />
          ) : null}
          {errorText("barrierOther")}
        </fieldset>

        <fieldset>
          <legend>요청 지역사회 서비스<span className="req">*</span></legend>
          <div className="choice-row">
            {entries(SERVICE_LABEL).map(([k, l]) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={a.requestedServices.includes(k)}
                  onChange={() => onChange({ requestedServices: toggle<CommunityService>(a.requestedServices, k) })}
                />
                {l}
              </label>
            ))}
          </div>
          {a.requestedServices.includes("other") ? (
            <input className="input" aria-label="기타 요청 서비스" placeholder="기타 서비스 입력" value={a.serviceOther} onChange={(e) => onChange({ serviceOther: e.target.value })} />
          ) : null}
          {errorText("requestedServices")}
          {errorText("serviceOther")}
        </fieldset>

        <div className="field">
          <label htmlFor="as-note">
            사회복지사 소견<span className="opt">선택 · 기본적으로 병원 내부 기록</span>
          </label>
          <textarea
            id="as-note"
            className="textarea"
            maxLength={NOTE_MAX + 50}
            value={a.socialWorkerNote}
            aria-invalid={Boolean(err("socialWorkerNote"))}
            onChange={(e) => onChange({ socialWorkerNote: e.target.value })}
            placeholder="퇴원 후 생활 계획, 보호자 상황 등 (실제 개인정보 입력 금지)"
          />
          <span className="hint">{a.socialWorkerNote.length}/{NOTE_MAX}자 · 동의 범위에 &lsquo;사회복지사 소견&rsquo;을 포함한 경우에만 전송됩니다.</span>
          {errorText("socialWorkerNote")}
        </div>
      </fieldset>
      {showErrors && issues.length > 0 ? (
        <div className="notice warn" role="status" style={{ marginTop: 10 }}>
          임시저장됨 · 전송 전 {issues.length}개 필수 항목을 완료해 주세요.
        </div>
      ) : null}
    </Panel>
  );
}
