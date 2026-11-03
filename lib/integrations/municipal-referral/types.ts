/**
 * Discharge-care referral contract (Hospital → Municipality).
 *
 * ILLUSTRATIVE CONTRACT ONLY. This is not a finalized government or municipal
 * integration standard. A production contract must follow approved municipal
 * API specifications, partner agreements, legal review and security review.
 */
import type { KAdlLevel } from "../../hospital/types";

export const REFERRAL_SCHEMA_VERSION = "1.0" as const;
export const CONSENT_FORM_VERSION = "1.0" as const;

/* ------------------------------------------------------------------ */
/* Social-work assessment (hospital-internal working record)           */
/* ------------------------------------------------------------------ */

export type LivingArrangement = "alone" | "spouse" | "family" | "other";
export type HousingType = "apartment" | "detached" | "multiUnit" | "other";
export type HousingBarrier = "stairs" | "bathroom" | "mobilityAccess" | "other";
export type CommunityService =
  | "visitingNursing"
  | "mealSupport"
  | "homeModification"
  | "mobilityAssistance"
  | "dailyLifeSupport"
  | "other";
export type CognitionStatus = "independentCommunication" | "partialSupport" | "continuousSupport" | "needsAssessment";
export type FallRiskBand = "low" | "moderate" | "high" | "notRecorded";

export interface SocialWorkAssessment {
  kAdl: { eating: KAdlLevel | null; mobility: KAdlLevel | null; toileting: KAdlLevel | null };
  cognition: CognitionStatus | null;
  fallRisk: FallRiskBand | null;
  livingArrangement: LivingArrangement | null;
  livingArrangementOther: string;
  housingType: HousingType | null;
  housingTypeOther: string;
  barriers: HousingBarrier[];
  barrierOther: string;
  requestedServices: CommunityService[];
  serviceOther: string;
  /** Social worker's note. Hospital-internal unless the `socialWorkerNote` category is approved. */
  socialWorkerNote: string;
  savedAt: string | null;
}

export const LIVING_LABEL: Record<LivingArrangement, string> = {
  alone: "독거",
  spouse: "배우자와 동거",
  family: "가족과 동거",
  other: "기타"
};
export const HOUSING_LABEL: Record<HousingType, string> = {
  apartment: "아파트 (승강기 있음)",
  detached: "단독주택",
  multiUnit: "다세대·연립",
  other: "기타"
};
export const BARRIER_LABEL: Record<HousingBarrier, string> = {
  stairs: "계단",
  bathroom: "욕실 접근성",
  mobilityAccess: "이동 동선·출입",
  other: "기타"
};
export const SERVICE_LABEL: Record<CommunityService, string> = {
  visitingNursing: "방문 간호",
  mealSupport: "식사 지원",
  homeModification: "주거 개선",
  mobilityAssistance: "이동 지원",
  dailyLifeSupport: "일상생활 지원",
  other: "기타"
};
export const COGNITION_LABEL: Record<CognitionStatus, string> = {
  independentCommunication: "일상 의사소통 가능",
  partialSupport: "일부 도움 필요",
  continuousSupport: "상시 도움 필요",
  needsAssessment: "추가 평가 필요"
};
export const FALL_RISK_LABEL: Record<FallRiskBand, string> = {
  low: "낮음 구간",
  moderate: "중간 구간",
  high: "높음 구간",
  notRecorded: "기록 없음"
};

/* ------------------------------------------------------------------ */
/* Third-party provision consent & legal-basis review (demo workflow)  */
/* ------------------------------------------------------------------ */

export type TransferCategory =
  | "identity"
  | "discharge"
  | "principalDiagnosis"
  | "kAdl"
  | "fallRisk"
  | "cognition"
  | "medicationSummary"
  | "livingNeeds"
  | "socialWorkerNote";

export interface TransferCategoryMeta {
  id: TransferCategory;
  label: string;
  description: string;
  /** Health-related information that requires separate sensitive-information consent in this demo. */
  sensitive: boolean;
  required: boolean;
}

export const TRANSFER_CATEGORIES: TransferCategoryMeta[] = [
  { id: "identity", label: "기본 식별정보", description: "가명 환자 ID, 성명, 생년월일 (연락처 제외)", sensitive: false, required: true },
  { id: "discharge", label: "퇴원 예정 정보", description: "퇴원 예정일", sensitive: false, required: false },
  { id: "principalDiagnosis", label: "주진단 (KCD)", description: "주진단 1건만. 부진단·병력 전체 제외", sensitive: true, required: false },
  { id: "kAdl", label: "K-ADL 3개 항목", description: "식사, 이동, 화장실 사용", sensitive: true, required: false },
  { id: "fallRisk", label: "낙상 위험 구간", description: "평가 도구 구간만 (점수·간호기록 제외)", sensitive: true, required: false },
  { id: "cognition", label: "인지·의사소통 상태", description: "사회복지 평가 구분값만", sensitive: true, required: false },
  { id: "medicationSummary", label: "투약 요약", description: "약품명·투여 빈도 (처방 상세 제외)", sensitive: true, required: false },
  { id: "livingNeeds", label: "생활환경·요청 서비스", description: "거주 형태, 주거 장애요인, 요청 서비스", sensitive: false, required: false },
  { id: "socialWorkerNote", label: "사회복지사 소견", description: "사회복지사 작성 메모 (간호기록 아님)", sensitive: false, required: false }
];

export type ConsenterType = "patient" | "legalRepresentative";
export type RetentionPeriod = "untilCaseClosure" | "oneYear" | "threeYears";
export type SensitiveConsentStatus = "notApplicable" | "granted" | "notGranted";
export type DocumentStatus = "notVerified" | "verifiedDemo";

export const RETENTION_LABEL: Record<RetentionPeriod, string> = {
  untilCaseClosure: "연계 종결 시까지",
  oneYear: "수신일로부터 1년",
  threeYears: "수신일로부터 3년"
};

export interface ConsentRecord {
  municipalityCode: string;
  recipientOrganization: string;
  purpose: string;
  categories: TransferCategory[];
  retention: RetentionPeriod | null;
  consentAt: string; // datetime-local value, demo only
  recorder: string;
  consenterType: ConsenterType | null;
  consenterName: string;
  representativeAuthorityVerified: boolean;
  documentRef: string;
  documentStatus: DocumentStatus;
  sensitiveConsent: SensitiveConsentStatus;
  version: typeof CONSENT_FORM_VERSION;
  withdrawn: boolean;
  review: {
    hospitalPrivacyReviewed: boolean;
    municipalRequirementChecked: boolean;
    legalBasisNote: string;
  };
}

/* ------------------------------------------------------------------ */
/* Transfer envelope (minimum-necessary payload)                       */
/* ------------------------------------------------------------------ */

export interface CodedValue {
  system: "KCD";
  code: string;
  display: string;
}

export interface MedicationSummaryItem {
  name: string;
  frequency: string;
}

export interface ReferralEnvelope {
  schemaVersion: typeof REFERRAL_SCHEMA_VERSION;
  transferId: string;
  eventType: "discharge-care-referral";
  source: { facilityId: string };
  destination: { municipalityCode: string };
  subject: {
    patientId: string;
    name: string;
    birthDate: string;
    contact: null;
  };
  discharge?: { plannedDate: string | null };
  clinicalSummary?: {
    principalDiagnosis?: CodedValue;
    kAdl?: { eating: string; mobility: string; toileting: string };
    fallRisk?: string;
    cognition?: string;
    medicationSummary?: MedicationSummaryItem[];
  };
  livingNeeds?: {
    livingArrangement: string;
    housingType: string;
    barriers: string[];
    requestedServices: string[];
    socialWorkerNote?: string;
  };
  consent: {
    status: "DEMO_GRANTED";
    version: typeof CONSENT_FORM_VERSION;
    recordedAt: string;
    scope: TransferCategory[];
    sensitiveInformationConsent: SensitiveConsentStatus;
    retention: RetentionPeriod;
  };
}

/* ------------------------------------------------------------------ */
/* Transfer lifecycle                                                  */
/* ------------------------------------------------------------------ */

export type DraftStatus = "작성 중" | "동의 확인 필요" | "전송 준비";
export type TransferStatus =
  | "전송 완료"
  | "수신 확인"
  | "심사 중"
  | "보완 요청"
  | "승인"
  | "반려"
  | "연계 종료";

export interface TransferEvent {
  at: string;
  status: TransferStatus;
  actor: "병원 (DEMO)" | "지자체 모의 응답 (DEMO)";
  message: string;
}

export interface TransferRecord {
  transferId: string;
  patientId: string;
  municipalityCode: string;
  municipalityName: string;
  submittedAt: string;
  status: TransferStatus;
  statusUpdatedAt: string;
  idempotencyKey: string;
  traceId: string;
  schemaVersion: typeof REFERRAL_SCHEMA_VERSION;
  reason: string | null;
  latestMessage: string;
  events: TransferEvent[];
  envelope: ReferralEnvelope;
  /** Number of supplementary resubmissions after a 보완 요청. */
  resubmissions: number;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}
