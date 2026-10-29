/** Shared enums and Korean labels. DB CHECK constraints use the same values. */

export const ROLES = ["admin", "worker", "provider", "recipient", "family"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "지자체 관리자",
  worker: "돌봄 담당자",
  provider: "기관 담당자",
  recipient: "돌봄 대상자",
  family: "가족",
};

export const SERVICE_TYPES = [
  "meal",
  "home_care",
  "mobility",
  "daily_living",
  "housing",
  "community_program",
  "health_welfare_counsel",
  "family_support",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  meal: "식사 지원",
  home_care: "방문 돌봄",
  mobility: "이동 지원",
  daily_living: "일상생활 지원",
  housing: "주거 환경 개선",
  community_program: "지역 복지 프로그램",
  health_welfare_counsel: "보건·복지 상담",
  family_support: "가족 돌봄 지원",
};

export const CARE_STATUSES = ["active", "monitoring", "needs_review", "closed"] as const;
export type CareStatus = (typeof CARE_STATUSES)[number];
export const CARE_STATUS_LABEL: Record<CareStatus, string> = {
  active: "지원 중",
  monitoring: "관찰 중",
  needs_review: "확인 필요",
  closed: "종결",
};

export const RECORD_TYPES = ["consultation", "visit", "phone", "observation"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  consultation: "상담",
  visit: "방문",
  phone: "전화 확인",
  observation: "관찰 메모",
};

export const VISIT_STATUSES = ["scheduled", "completed", "missed", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: "예정",
  completed: "완료",
  missed: "미완료",
  cancelled: "취소",
};

/** Structured flags a worker ticks on a record. Rules read these, not free text. */
export const RECORD_FLAGS = ["condition_worse", "needs_support", "emergency_mention"] as const;
export type RecordFlag = (typeof RECORD_FLAGS)[number];
export const RECORD_FLAG_LABEL: Record<RecordFlag, string> = {
  condition_worse: "생활 상태 악화 기록",
  needs_support: "추가 지원 필요 기록",
  emergency_mention: "긴급 상황 언급",
};

export const SOURCE_TYPES = ["manual", "voice", "import", "seed"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const REFERRAL_STATUSES = [
  "requested",
  "received",
  "in_progress",
  "in_service",
  "suspended",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  requested: "의뢰 생성",
  received: "기관 접수",
  in_progress: "처리 중",
  in_service: "서비스 제공 중",
  suspended: "서비스 중단",
  completed: "종료",
  failed: "연계 실패",
  cancelled: "취소",
};
/** Referral statuses that count as the need being connected. */
export const ACTIVE_REFERRAL_STATUSES: ReferralStatus[] = ["requested", "received", "in_progress", "in_service"];

export const TASK_STATUSES = ["open", "in_progress", "waiting", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "신규",
  in_progress: "진행 중",
  waiting: "대기",
  completed: "완료",
  cancelled: "취소",
};
export const OPEN_TASK_STATUSES: TaskStatus[] = ["open", "in_progress", "waiting"];

export const TASK_TYPES = [
  "assessment_review",
  "missed_visit",
  "service_interruption",
  "referral_failure",
  "overdue_followup",
  "support_request",
  "manual",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  assessment_review: "분석 결과 검토",
  missed_visit: "미완료 방문 확인",
  service_interruption: "서비스 중단 확인",
  referral_failure: "연계 실패 후속",
  overdue_followup: "지연 조치 후속",
  support_request: "문의 대응",
  manual: "수동 등록",
};

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority | "none", string> = {
  high: "우선 확인",
  medium: "확인 권장",
  low: "참고",
  none: "신호 없음",
};

export const REVIEW_STATUSES = ["pending", "accepted", "modified", "dismissed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "검토 대기",
  accepted: "수용",
  modified: "수정 후 수용",
  dismissed: "기각",
};

export const AVAILABILITY_STATUSES = ["open", "waitlist", "closed", "unknown"] as const;
export type Availability = (typeof AVAILABILITY_STATUSES)[number];
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  open: "신청 가능",
  waitlist: "대기 필요",
  closed: "모집 마감",
  unknown: "확인 필요",
};

export const SUPPORT_REQUEST_TYPES = ["schedule", "service", "general", "other"] as const;
export type SupportRequestType = (typeof SUPPORT_REQUEST_TYPES)[number];
export const SUPPORT_REQUEST_TYPE_LABEL: Record<SupportRequestType, string> = {
  schedule: "일정 문의",
  service: "서비스 문의",
  general: "일반 문의",
  other: "기타",
};
export const SUPPORT_REQUEST_STATUSES = ["received", "in_progress", "answered", "closed"] as const;
export type SupportRequestStatus = (typeof SUPPORT_REQUEST_STATUSES)[number];
export const SUPPORT_REQUEST_STATUS_LABEL: Record<SupportRequestStatus, string> = {
  received: "접수",
  in_progress: "처리 중",
  answered: "답변 완료",
  closed: "종결",
};

export const FAMILY_PERMISSIONS = ["view_services", "view_schedule", "create_requests"] as const;
export type FamilyPermission = (typeof FAMILY_PERMISSIONS)[number];
