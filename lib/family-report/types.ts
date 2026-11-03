/**
 * Family Care Reports (보호자 리포트) — hospital-side types.
 * Reports share only staff-approved, category-scoped information with an
 * authorized guardian. They are never a view into the full EMR.
 */

export type FamilyCategory =
  | "careSummary"
  | "dailyLiving"
  | "observations"
  | "rehabSchedule"
  | "communication"
  | "diagnosis"
  | "medication"
  | "testResults";

export interface FamilyCategoryMeta {
  id: FamilyCategory;
  label: string;
  description: string;
  sensitive: boolean;
}

export const FAMILY_CATEGORIES: FamilyCategoryMeta[] = [
  { id: "careSummary", label: "기본 돌봄 요약", description: "보고 기간, 전반 요약, 주요 돌봄 활동", sensitive: false },
  { id: "dailyLiving", label: "일상생활", description: "식사·수분·수면·활동 기록, ADL 변화", sensitive: false },
  { id: "observations", label: "간호·돌봄 관찰", description: "보호자 공유로 표시된 기록만", sensitive: false },
  { id: "rehabSchedule", label: "재활·일정", description: "재활 참여, 예정 진료·프로그램·안내", sensitive: false },
  { id: "communication", label: "보호자 소통", description: "돌봄팀 메시지, 협조 요청, 담당 부서", sensitive: false },
  { id: "diagnosis", label: "진단 정보", description: "주진단 명칭 — 기본 제외", sensitive: true },
  { id: "medication", label: "투약 정보", description: "약품명·투여 빈도 — 기본 제외", sensitive: true },
  { id: "testResults", label: "검사 결과", description: "검사 수치 — 기본 제외", sensitive: true }
];

export type PatientConsentStatus = "동의" | "미확인" | "철회";
export type SharingStatus = "활성" | "일시 중지" | "철회";

export interface GuardianSharingSetting {
  patientId: string;
  guardianId: string;
  authorityVerified: boolean;
  patientConsent: PatientConsentStatus;
  consentRecordedAt: string;
  allowedCategories: FamilyCategory[];
  sensitiveReview: { reviewed: boolean; legalBasisNote: string };
  status: SharingStatus;
}

export type ReportPeriodKind = "weekly" | "monthly" | "custom";

export interface ReportPeriod {
  kind: ReportPeriodKind;
  from: string;
  to: string;
}

export type ItemOrigin = "기록 사실" | "자동 집계 초안" | "직원 작성";

export interface ReportItem {
  id: string;
  section: FamilyCategory;
  label: string;
  text: string;
  origin: ItemOrigin;
  /** Source record IDs the item was derived from. Empty for staff-authored text. */
  sources: string[];
  /** True when the records needed for this item are missing or incomplete. */
  incomplete: boolean;
  edited: boolean;
  included: boolean;
}

export type ReportStatus = "작성 중" | "검토 중" | "승인 완료" | "전송 완료" | "열람 완료" | "전송 실패";

export interface DeliveryAttempt {
  attempt: number;
  at: string;
  outcome: "전송 완료" | "전송 실패";
  message: string;
}

export interface FamilyReport {
  id: string;
  patientId: string;
  guardianId: string;
  period: ReportPeriod;
  categories: FamilyCategory[];
  items: ReportItem[];
  careTeamMessage: string;
  familyRequests: string;
  contactDepartment: string;
  status: ReportStatus;
  createdAt: string;
  createdBy: string;
  reviewConfirmed: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  deliveries: DeliveryAttempt[];
  openedAt: string | null;
}

export const SECTION_TITLE: Record<FamilyCategory, string> = {
  careSummary: "1. 기본 돌봄 요약",
  dailyLiving: "2. 일상생활",
  observations: "3. 간호·돌봄 관찰",
  rehabSchedule: "4. 재활 및 일정",
  communication: "5. 보호자 소통",
  diagnosis: "추가. 진단 정보 (승인된 범위)",
  medication: "추가. 투약 정보 (승인된 범위)",
  testResults: "추가. 검사 결과 (승인된 범위)"
};
