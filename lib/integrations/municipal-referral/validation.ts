import type { Patient } from "../../hospital/types";
import { K_ADL_LABEL } from "../../hospital/types";
import {
  CONSENT_FORM_VERSION,
  COGNITION_LABEL,
  FALL_RISK_LABEL,
  HOUSING_LABEL,
  LIVING_LABEL,
  BARRIER_LABEL,
  REFERRAL_SCHEMA_VERSION,
  SERVICE_LABEL,
  TRANSFER_CATEGORIES,
  type ConsentRecord,
  type DraftStatus,
  type ReadinessCheck,
  type ReferralEnvelope,
  type SocialWorkAssessment,
  type TransferCategory,
  type ValidationIssue
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/;
export const NOTE_MAX = 500;

export function isSensitiveCategory(id: TransferCategory): boolean {
  return TRANSFER_CATEGORIES.some((c) => c.id === id && c.sensitive);
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

export function validateAssessment(a: SocialWorkAssessment): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  (["eating", "mobility", "toileting"] as const).forEach((k) => {
    if (a.kAdl[k] === null) issues.push({ path: `kAdl.${k}`, message: "K-ADL 항목을 선택해 주세요." });
  });
  if (!a.cognition) issues.push({ path: "cognition", message: "인지·의사소통 상태를 선택해 주세요." });
  if (!a.fallRisk) issues.push({ path: "fallRisk", message: "낙상 위험 구간을 선택해 주세요." });
  if (!a.livingArrangement) issues.push({ path: "livingArrangement", message: "퇴원 후 동거 형태를 선택해 주세요." });
  if (a.livingArrangement === "other" && !a.livingArrangementOther.trim())
    issues.push({ path: "livingArrangementOther", message: "기타 동거 형태를 입력해 주세요." });
  if (!a.housingType) issues.push({ path: "housingType", message: "주거 형태를 선택해 주세요." });
  if (a.housingType === "other" && !a.housingTypeOther.trim())
    issues.push({ path: "housingTypeOther", message: "기타 주거 형태를 입력해 주세요." });
  if (a.barriers.includes("other") && !a.barrierOther.trim())
    issues.push({ path: "barrierOther", message: "기타 주거 장애요인을 입력해 주세요." });
  if (a.requestedServices.length === 0)
    issues.push({ path: "requestedServices", message: "요청 서비스를 1개 이상 선택해 주세요." });
  if (a.requestedServices.includes("other") && !a.serviceOther.trim())
    issues.push({ path: "serviceOther", message: "기타 요청 서비스를 입력해 주세요." });
  if (a.socialWorkerNote.length > NOTE_MAX)
    issues.push({ path: "socialWorkerNote", message: `소견은 ${NOTE_MAX}자 이내로 작성해 주세요.` });
  return issues;
}

/* ------------------------------------------------------------------ */
/* Consent & review gate                                               */
/* ------------------------------------------------------------------ */

export function consentChecks(c: ConsentRecord): ReadinessCheck[] {
  const hasSensitive = c.categories.some(isSensitiveCategory);
  return [
    { id: "recipient", label: "수신 지자체·기관 지정", ok: Boolean(c.municipalityCode && c.recipientOrganization.trim()) },
    { id: "purpose", label: "제공 목적 기재", ok: c.purpose.trim().length >= 5 },
    {
      id: "categories",
      label: "제공 항목 선택 (기본 식별정보 포함)",
      ok: c.categories.includes("identity") && c.categories.length >= 2,
      detail: "기본 식별정보 외 1개 이상의 항목이 필요합니다."
    },
    { id: "retention", label: "보유·이용 기간 지정", ok: c.retention !== null },
    { id: "consentAt", label: "동의 일시 기록", ok: DATETIME_RE.test(c.consentAt) },
    { id: "recorder", label: "동의 기록자 지정", ok: Boolean(c.recorder.trim()) },
    {
      id: "consenter",
      label: "동의 주체 (본인 또는 법정대리인) 확인",
      ok:
        c.consenterType !== null &&
        Boolean(c.consenterName.trim()) &&
        (c.consenterType === "patient" || c.representativeAuthorityVerified),
      detail: c.consenterType === "legalRepresentative" ? "법정대리인 권한 확인 서류 확인이 필요합니다." : undefined
    },
    {
      id: "document",
      label: "동의서 참조번호·확인 상태",
      ok: Boolean(c.documentRef.trim()) && c.documentStatus === "verifiedDemo"
    },
    {
      id: "sensitive",
      label: "민감정보 별도 동의",
      ok: hasSensitive ? c.sensitiveConsent === "granted" : c.sensitiveConsent !== "notGranted",
      detail: hasSensitive ? "건강 관련 항목이 포함되어 별도 동의가 필요합니다." : "민감정보 항목 미포함"
    },
    { id: "version", label: `동의서 양식 버전 ${CONSENT_FORM_VERSION}`, ok: c.version === CONSENT_FORM_VERSION },
    { id: "withdrawal", label: "동의 철회 없음", ok: !c.withdrawn },
    {
      id: "privacyReview",
      label: "병원 개인정보보호 담당 검토 표시 (DEMO)",
      ok: c.review.hospitalPrivacyReviewed
    },
    {
      id: "municipalReview",
      label: "수신 지자체 요건 확인 표시 (DEMO)",
      ok: c.review.municipalRequirementChecked
    },
    {
      id: "legalBasis",
      label: "법적 근거 검토 메모",
      ok: c.review.legalBasisNote.trim().length >= 5,
      detail: "동의만으로 모든 의무기록 제공이 허용된다고 가정하지 않습니다."
    }
  ];
}

export function readinessChecks(assessment: SocialWorkAssessment, consent: ConsentRecord): ReadinessCheck[] {
  const issues = validateAssessment(assessment);
  return [
    {
      id: "assessment",
      label: "사회복지 평가 필수 항목 완료",
      ok: issues.length === 0,
      detail: issues.length ? `${issues.length}개 항목 확인 필요` : undefined
    },
    {
      id: "assessmentSaved",
      label: "평가 임시저장",
      ok: assessment.savedAt !== null
    },
    ...consentChecks(consent)
  ];
}

export function draftStatus(assessment: SocialWorkAssessment, consent: ConsentRecord): DraftStatus {
  if (validateAssessment(assessment).length > 0 || assessment.savedAt === null) return "작성 중";
  if (consentChecks(consent).some((c) => !c.ok)) return "동의 확인 필요";
  return "전송 준비";
}

/* ------------------------------------------------------------------ */
/* Envelope builder — includes only approved categories                */
/* ------------------------------------------------------------------ */

export interface BuildContext {
  facilityId: string;
  transferId: string;
}

function labelOrOther<T extends string>(value: T | null, labels: Record<T, string>, other: string): string {
  if (!value) return "";
  return value === ("other" as T) ? `기타: ${other.trim()}` : labels[value];
}

export function buildReferralEnvelope(
  patient: Patient,
  assessment: SocialWorkAssessment,
  consent: ConsentRecord,
  ctx: BuildContext
): ReferralEnvelope {
  const scope = new Set(consent.categories);
  const principal = patient.diagnoses.find((d) => d.principal);

  const clinical: NonNullable<ReferralEnvelope["clinicalSummary"]> = {};
  if (scope.has("principalDiagnosis") && principal) {
    clinical.principalDiagnosis = { system: "KCD", code: principal.code, display: principal.display };
  }
  if (scope.has("kAdl")) {
    const k = assessment.kAdl;
    clinical.kAdl = {
      eating: k.eating ? K_ADL_LABEL[k.eating] : "",
      mobility: k.mobility ? K_ADL_LABEL[k.mobility] : "",
      toileting: k.toileting ? K_ADL_LABEL[k.toileting] : ""
    };
  }
  if (scope.has("fallRisk") && assessment.fallRisk) clinical.fallRisk = FALL_RISK_LABEL[assessment.fallRisk];
  if (scope.has("cognition") && assessment.cognition) clinical.cognition = COGNITION_LABEL[assessment.cognition];
  if (scope.has("medicationSummary")) {
    clinical.medicationSummary = patient.medications.map((m) => ({ name: m.name, frequency: m.frequency }));
  }

  const envelope: ReferralEnvelope = {
    schemaVersion: REFERRAL_SCHEMA_VERSION,
    transferId: ctx.transferId,
    eventType: "discharge-care-referral",
    source: { facilityId: ctx.facilityId },
    destination: { municipalityCode: consent.municipalityCode },
    subject: { patientId: patient.id, name: patient.name, birthDate: patient.birthDate, contact: null },
    consent: {
      status: "DEMO_GRANTED",
      version: CONSENT_FORM_VERSION,
      recordedAt: consent.consentAt ? `${consent.consentAt.length === 16 ? `${consent.consentAt}:00` : consent.consentAt}+09:00` : "",
      scope: TRANSFER_CATEGORIES.map((c) => c.id).filter((id) => scope.has(id)),
      sensitiveInformationConsent: consent.sensitiveConsent,
      retention: consent.retention ?? "untilCaseClosure"
    }
  };

  if (scope.has("discharge")) envelope.discharge = { plannedDate: patient.discharge.plannedDate };
  if (Object.keys(clinical).length > 0) envelope.clinicalSummary = clinical;
  if (scope.has("livingNeeds")) {
    envelope.livingNeeds = {
      livingArrangement: labelOrOther(assessment.livingArrangement, LIVING_LABEL, assessment.livingArrangementOther),
      housingType: labelOrOther(assessment.housingType, HOUSING_LABEL, assessment.housingTypeOther),
      barriers: assessment.barriers.map((b) => (b === "other" ? `기타: ${assessment.barrierOther.trim()}` : BARRIER_LABEL[b])),
      requestedServices: assessment.requestedServices.map((s) =>
        s === "other" ? `기타: ${assessment.serviceOther.trim()}` : SERVICE_LABEL[s]
      )
    };
    if (scope.has("socialWorkerNote") && assessment.socialWorkerNote.trim()) {
      envelope.livingNeeds.socialWorkerNote = assessment.socialWorkerNote.trim();
    }
  }
  return envelope;
}

/* ------------------------------------------------------------------ */
/* Envelope validation — structural + minimum-necessary checks         */
/* ------------------------------------------------------------------ */

export function validateReferralEnvelope(env: ReferralEnvelope): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const scope = new Set(env.consent.scope);
  const need = (cond: boolean, path: string, message: string) => {
    if (!cond) issues.push({ path, message });
  };

  need(env.schemaVersion === REFERRAL_SCHEMA_VERSION, "schemaVersion", "지원하지 않는 스키마 버전입니다.");
  need(env.eventType === "discharge-care-referral", "eventType", "이벤트 유형이 올바르지 않습니다.");
  need(/^DEMO-/.test(env.transferId), "transferId", "DEMO 전송 ID 형식이 아닙니다.");
  need(Boolean(env.source.facilityId), "source.facilityId", "송신 기관 ID가 없습니다.");
  need(Boolean(env.destination.municipalityCode), "destination.municipalityCode", "수신 지자체 코드가 없습니다.");
  need(/^SYN-/.test(env.subject.patientId), "subject.patientId", "합성 환자 ID만 허용됩니다.");
  need(DATE_RE.test(env.subject.birthDate), "subject.birthDate", "생년월일 형식(YYYY-MM-DD)이 아닙니다.");
  need(env.subject.contact === null, "subject.contact", "연락처는 이 계약에 포함하지 않습니다.");
  need(env.consent.status === "DEMO_GRANTED", "consent.status", "동의 상태가 확인되지 않았습니다.");
  need(env.consent.version === CONSENT_FORM_VERSION, "consent.version", "동의서 버전이 일치하지 않습니다.");
  need(DATETIME_RE.test(env.consent.recordedAt), "consent.recordedAt", "동의 일시가 ISO-8601 형식이 아닙니다.");
  need(scope.has("identity"), "consent.scope", "기본 식별정보 범위가 누락되었습니다.");

  const sensitiveInScope = env.consent.scope.some(isSensitiveCategory);
  need(
    !sensitiveInScope || env.consent.sensitiveInformationConsent === "granted",
    "consent.sensitiveInformationConsent",
    "민감정보 항목에 대한 별도 동의가 없습니다."
  );

  // Minimum-necessary: every populated section must be inside the approved scope.
  const cs = env.clinicalSummary;
  const inScope = (present: unknown, cat: TransferCategory, path: string) => {
    if (present !== undefined && !scope.has(cat)) issues.push({ path, message: `동의 범위(${cat}) 밖의 항목이 포함되었습니다.` });
  };
  inScope(env.discharge, "discharge", "discharge");
  inScope(cs?.principalDiagnosis, "principalDiagnosis", "clinicalSummary.principalDiagnosis");
  inScope(cs?.kAdl, "kAdl", "clinicalSummary.kAdl");
  inScope(cs?.fallRisk, "fallRisk", "clinicalSummary.fallRisk");
  inScope(cs?.cognition, "cognition", "clinicalSummary.cognition");
  inScope(cs?.medicationSummary, "medicationSummary", "clinicalSummary.medicationSummary");
  inScope(env.livingNeeds, "livingNeeds", "livingNeeds");
  inScope(env.livingNeeds?.socialWorkerNote, "socialWorkerNote", "livingNeeds.socialWorkerNote");

  if (env.discharge?.plannedDate) need(DATE_RE.test(env.discharge.plannedDate), "discharge.plannedDate", "퇴원 예정일 형식 오류");
  if (cs?.principalDiagnosis) need(Boolean(cs.principalDiagnosis.code), "clinicalSummary.principalDiagnosis.code", "KCD 코드가 없습니다.");
  return issues;
}
