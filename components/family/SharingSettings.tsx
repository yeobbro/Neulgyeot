"use client";

import { DEMO_FACILITY } from "@/lib/demo/hospital-data";
import { sharingChecks } from "@/lib/family-report/build";
import { FAMILY_CATEGORIES, type FamilyCategory, type GuardianSharingSetting, type PatientConsentStatus } from "@/lib/family-report/types";
import { sharingKey } from "@/lib/state/hospital-store";
import { Badge, Checklist, Panel } from "@/components/ui/primitives";
import { useHospital } from "@/components/hospital/HospitalContext";

export function SharingSettings() {
  const { patient, state, dispatch } = useHospital();

  return (
    <>
      <div className="notice info" role="note">
        보호자 공유는 항목별로 명시적으로 허용해야 합니다. 진단·투약·검사 결과는 기본 제외이며, 공유 범위와 적용 가능한 법적 근거를 검토한 경우에만 허용할 수 있습니다.
      </div>
      {patient.guardians.map((g) => {
        const s = state.sharing[sharingKey(patient.id, g.id)];
        const update = (patch: Partial<GuardianSharingSetting>, action: string) => dispatch({ type: "updateSharing", setting: { ...s, ...patch }, action });
        const toggleCat = (id: FamilyCategory) =>
          update(
            { allowedCategories: s.allowedCategories.includes(id) ? s.allowedCategories.filter((x) => x !== id) : [...s.allowedCategories, id] },
            `공유 항목 변경: ${id}`
          );
        const revoked = s.status === "철회";
        return (
          <Panel
            key={g.id}
            id={`share-${g.id}`}
            title={`${g.name} (${g.relationship}) · ${g.authority}`}
            actions={<Badge tone={s.status === "활성" ? "green" : revoked ? "red" : "amber"}>{s.status}</Badge>}
          >
            <div className="grid-3" style={{ alignItems: "start" }}>
              <fieldset disabled={revoked} className="stack">
                <legend>권한·동의</legend>
                <label className="check">
                  <input type="checkbox" checked={s.authorityVerified} onChange={(e) => update({ authorityVerified: e.target.checked }, e.target.checked ? "보호자 권한 확인" : "보호자 권한 확인 해제")} />
                  보호자 권한 확인 (DEMO 표시)
                </label>
                <div className="field">
                  <label htmlFor={`sc-${g.id}`}>환자 동의 / 법정대리인 권한</label>
                  <select
                    id={`sc-${g.id}`}
                    className="select"
                    value={s.patientConsent}
                    onChange={(e) =>
                      update(
                        { patientConsent: e.target.value as PatientConsentStatus, consentRecordedAt: e.target.value === "동의" ? DEMO_FACILITY.today : s.consentRecordedAt },
                        `환자 동의 상태: ${e.target.value}`
                      )
                    }
                  >
                    <option value="미확인">미확인</option>
                    <option value="동의">동의 기록</option>
                    <option value="철회">동의 철회</option>
                  </select>
                  <span className="hint">기록일: {s.consentRecordedAt || "—"} · 연락처 {g.phoneMasked}</span>
                </div>
                <Checklist checks={sharingChecks(s)} />
              </fieldset>

              <fieldset disabled={revoked} className="stack">
                <legend>공유 허용 항목</legend>
                {FAMILY_CATEGORIES.map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" checked={s.allowedCategories.includes(c.id)} onChange={() => toggleCat(c.id)} />
                    {c.label}
                    {c.sensitive ? <Badge tone="amber">민감 · 기본 제외</Badge> : null}
                  </label>
                ))}
              </fieldset>

              <fieldset disabled={revoked} className="stack">
                <legend>민감정보 공유 검토</legend>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.sensitiveReview.reviewed}
                    onChange={(e) => update({ sensitiveReview: { ...s.sensitiveReview, reviewed: e.target.checked } }, e.target.checked ? "민감정보 공유 검토 표시" : "민감정보 공유 검토 해제")}
                  />
                  공유 범위·법적 근거 검토 완료 (DEMO 표시)
                </label>
                <label className="field">
                  <span className="label">검토 메모</span>
                  <textarea
                    className="textarea"
                    value={s.sensitiveReview.legalBasisNote}
                    onChange={(e) => dispatch({ type: "updateSharing", setting: { ...s, sensitiveReview: { ...s.sensitiveReview, legalBasisNote: e.target.value } }, action: null })}
                    placeholder="검토 근거 요약 (DEMO). 실제 법적 판단 아님."
                  />
                </label>
                <span className="hint">검토 표시와 메모가 모두 있어야 민감 항목을 리포트에 포함할 수 있습니다.</span>
              </fieldset>
            </div>
            <hr className="divider" />
            <div className="row">
              {s.status === "활성" ? (
                <button type="button" className="btn btn-sm" onClick={() => update({ status: "일시 중지" }, "보호자 공유 일시 중지")}>공유 일시 중지</button>
              ) : null}
              {s.status === "일시 중지" ? (
                <button type="button" className="btn btn-sm" onClick={() => update({ status: "활성" }, "보호자 공유 재개")}>공유 재개</button>
              ) : null}
              {!revoked ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => update({ status: "철회", patientConsent: "철회" }, "보호자 열람 권한 철회")}>
                  열람 권한 철회
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => update({ status: "일시 중지", patientConsent: "미확인", authorityVerified: false }, "철회 후 재등록 — 동의·권한 재확인 필요")}
                >
                  재등록 (동의·권한 재확인)
                </button>
              )}
              <span className="hint">철회 시 이미 전송된 리포트도 늘곁 패밀리에서 열람할 수 없도록 처리하는 것을 전제로 합니다 (향후 연동).</span>
            </div>
          </Panel>
        );
      })}
    </>
  );
}
