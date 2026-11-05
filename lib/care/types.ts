/**
 * Quick Tagging care-event model (늘곁 현장 케어 기록 자동화).
 *
 * DEMO: every resident, staff member and event in this prototype is synthetic. The model is designed so that a tag touch is
 * never treated as proof that care was performed: an event starts as "recorded" and only becomes "staff_confirmed" when the
 * performing staff member confirms it, and "independently_verified" only when a different, authorised staff member verifies it.
 */

export const CARE_TYPES = [
  "repositioning",
  "medication_assist",
  "diaper_change",
  "meal_assist",
  "hydration",
  "mobility_assist",
  "hygiene",
  "observation",
  "other"
] as const;
export type CareType = (typeof CARE_TYPES)[number];

export const CARE_TYPE_LABEL: Record<CareType, string> = {
  repositioning: "체위변경",
  medication_assist: "복약 보조",
  diaper_change: "기저귀 교체",
  meal_assist: "식사 보조",
  hydration: "수분 섭취",
  mobility_assist: "이동 보조",
  hygiene: "위생 관리",
  observation: "관찰 기록",
  other: "기타 업무"
};

/** How the event was captured. Wearables are adapters: not every watch / ring supports NFC (see wearables.ts). */
export type SourceDevice = "qr" | "nfc_mobile" | "mobile_web" | "wearable_watch" | "wearable_ring";
export const SOURCE_LABEL: Record<SourceDevice, string> = {
  qr: "QR 코드",
  nfc_mobile: "모바일 NFC",
  mobile_web: "모바일 웹",
  wearable_watch: "스마트워치",
  wearable_ring: "스마트링"
};

export type ConfirmationStatus = "recorded" | "staff_confirmed" | "independently_verified" | "voided";

export type StaffRole = "간호사" | "요양보호사" | "간호조무사" | "사회복지사" | "재활치료사";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  wards: string[];           // wards this staff member is assigned to (authorisation scope)
  badgeId: string;           // NFC staff badge / QR badge id (demo)
  active: boolean;
}

export interface Resident {
  id: string;                // synthetic patient id (SYN-P-xxxx)
  ward: string;
  displayName: string;       // name shown to staff
  tagId: string;             // bedside QR / NFC tag id
}

export interface CareEvent {
  care_event_id: string;
  client_event_id: string;           // idempotency key from the capturing device (offline sync)
  resident_id: string;
  staff_id: string;
  care_type: CareType;
  performed_at: string;              // when the staff member says the care happened (ISO, +09:00)
  recorded_at: string;               // SERVER time the record was accepted
  source_device: SourceDevice;
  confirmation_status: ConfirmationStatus;
  confirmed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  correction_reference: string | null;   // id of the event this one corrects (append-only corrections)
  created_at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor_staff_id: string | null;
  action: "care_event.create" | "care_event.confirm" | "care_event.verify" | "care_event.correct" | "care_event.reject" | "family.view" | "family.denied";
  resident_id: string | null;
  target_id: string | null;
  detail: string;
}

/** Display status used by timelines and reports. "missing" / "unconfirmed" are derived, never stored. */
export type TimelineStatus = "Recorded" | "Staff-confirmed" | "Independently verified" | "Missing" | "Unconfirmed";
export const TIMELINE_STATUS_LABEL: Record<TimelineStatus, string> = {
  Recorded: "기록됨",
  "Staff-confirmed": "수행자 확인",
  "Independently verified": "독립 검증",
  Missing: "기록 누락",
  Unconfirmed: "확인 대기"
};

export type MunicipalCareStatus = "심사중" | "승인" | "개시" | "종료" | "보완 필요";
