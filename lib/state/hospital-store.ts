/**
 * In-memory demo state for the Hospital workspace. Nothing is persisted;
 * reloading the page resets the demo. Audit events are recorded in memory only
 * to demonstrate which actions a production system must audit.
 */
import { demoNow } from "../demo/clock";
import { PATIENTS } from "../demo/hospital-data";
import type { Patient } from "../hospital/types";
import { initialAssessment, initialConsent } from "../integrations/municipal-referral/defaults";
import type { ConsentRecord, SocialWorkAssessment, TransferRecord } from "../integrations/municipal-referral/types";
import { defaultSharingSetting } from "../family-report/build";
import type { FamilyReport, GuardianSharingSetting } from "../family-report/types";

export type View = "summary" | "ward" | "records" | "medication" | "discharge" | "family" | "alerts";

export type AuditCategory = "지역연계" | "동의" | "보호자 리포트" | "공유 설정" | "관찰 검토";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  category: AuditCategory;
  action: string;
  patientId: string;
  detail: string;
}

export interface HospitalState {
  tick: number;
  view: View;
  selectedPatientId: string;
  assessments: Record<string, SocialWorkAssessment>;
  consents: Record<string, ConsentRecord>;
  transfers: TransferRecord[];
  sharing: Record<string, GuardianSharingSetting>;
  reports: FamilyReport[];
  reviewedSignals: string[];
  audit: AuditEvent[];
}

export const CURRENT_ACTOR = "정다은 (의료사회복지사 · DEMO)";

export const sharingKey = (patientId: string, guardianId: string) => `${patientId}:${guardianId}`;

export function initialState(patients: Patient[] = PATIENTS): HospitalState {
  const sharing: Record<string, GuardianSharingSetting> = {};
  patients.forEach((p) => p.guardians.forEach((g) => (sharing[sharingKey(p.id, g.id)] = defaultSharingSetting(p, g))));
  return {
    tick: 0,
    view: "summary",
    selectedPatientId: patients[0].id,
    assessments: {},
    consents: {},
    transfers: [],
    sharing,
    reports: [],
    reviewedSignals: [],
    audit: []
  };
}

export function getAssessment(state: HospitalState, patient: Patient): SocialWorkAssessment {
  return state.assessments[patient.id] ?? initialAssessment(patient);
}
export function getConsent(state: HospitalState, patient: Patient): ConsentRecord {
  return state.consents[patient.id] ?? initialConsent(patient);
}

export type HospitalAction =
  | { type: "setView"; view: View }
  | { type: "selectPatient"; patientId: string }
  | { type: "updateAssessment"; patient: Patient; patch: Partial<SocialWorkAssessment> }
  | { type: "saveAssessment"; patient: Patient }
  | { type: "updateConsent"; patient: Patient; patch: Partial<ConsentRecord> }
  | { type: "setConsentWithdrawn"; patient: Patient; withdrawn: boolean }
  | { type: "upsertTransfer"; record: TransferRecord; action: string }
  | { type: "reviewSignal"; patientId: string; signalId: string }
  | { type: "updateSharing"; setting: GuardianSharingSetting; action: string | null }
  | { type: "upsertReport"; report: FamilyReport; action: string | null };

function audit(state: HospitalState, category: AuditCategory, action: string, patientId: string, detail = ""): HospitalState {
  const at = demoNow(state.tick);
  return {
    ...state,
    tick: state.tick + 1,
    audit: [{ id: `AUD-${String(state.audit.length + 1).padStart(4, "0")}`, at, actor: CURRENT_ACTOR, category, action, patientId, detail }, ...state.audit]
  };
}

export function hospitalReducer(state: HospitalState, action: HospitalAction): HospitalState {
  switch (action.type) {
    case "setView":
      return { ...state, view: action.view };
    case "selectPatient":
      return { ...state, selectedPatientId: action.patientId };
    case "updateAssessment": {
      const cur = getAssessment(state, action.patient);
      // Any edit invalidates the saved draft until it is saved again.
      return { ...state, assessments: { ...state.assessments, [action.patient.id]: { ...cur, ...action.patch, savedAt: null } } };
    }
    case "saveAssessment": {
      const cur = getAssessment(state, action.patient);
      const at = demoNow(state.tick);
      const next = { ...state, assessments: { ...state.assessments, [action.patient.id]: { ...cur, savedAt: at } } };
      return audit(next, "지역연계", "사회복지 평가 임시저장", action.patient.id);
    }
    case "updateConsent": {
      const cur = getConsent(state, action.patient);
      return { ...state, consents: { ...state.consents, [action.patient.id]: { ...cur, ...action.patch } } };
    }
    case "setConsentWithdrawn": {
      const cur = getConsent(state, action.patient);
      const next = { ...state, consents: { ...state.consents, [action.patient.id]: { ...cur, withdrawn: action.withdrawn } } };
      return audit(next, "동의", action.withdrawn ? "제3자 제공 동의 철회 기록" : "동의 철회 기록 취소", action.patient.id);
    }
    case "upsertTransfer": {
      const exists = state.transfers.some((t) => t.transferId === action.record.transferId);
      const transfers = exists
        ? state.transfers.map((t) => (t.transferId === action.record.transferId ? action.record : t))
        : [action.record, ...state.transfers];
      return audit({ ...state, transfers }, "지역연계", action.action, action.record.patientId, `${action.record.transferId} · ${action.record.status}`);
    }
    case "reviewSignal": {
      if (state.reviewedSignals.includes(action.signalId)) return state;
      return audit({ ...state, reviewedSignals: [...state.reviewedSignals, action.signalId] }, "관찰 검토", "관찰 변화 검토 완료 표시", action.patientId, action.signalId);
    }
    case "updateSharing": {
      const key = sharingKey(action.setting.patientId, action.setting.guardianId);
      const next = { ...state, sharing: { ...state.sharing, [key]: action.setting } };
      return action.action ? audit(next, "공유 설정", action.action, action.setting.patientId, action.setting.guardianId) : next;
    }
    case "upsertReport": {
      const exists = state.reports.some((r) => r.id === action.report.id);
      const reports = exists ? state.reports.map((r) => (r.id === action.report.id ? action.report : r)) : [action.report, ...state.reports];
      const next = { ...state, reports };
      return action.action ? audit(next, "보호자 리포트", action.action, action.report.patientId, `${action.report.id} · ${action.report.status}`) : next;
    }
  }
}
