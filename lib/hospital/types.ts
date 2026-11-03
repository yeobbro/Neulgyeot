/**
 * Hospital-side domain types for Neulgyeot Hospital (늘곁 요양병원용).
 *
 * All values handled by this prototype are synthetic. These types describe the
 * shape of demo records only; they are not a validated clinical data model.
 */

export type Gender = "남" | "여";
export type AdmissionStatus = "재원" | "퇴원 예정" | "외출·외박";
export type WardId = "2W" | "3W" | "5W";

/** K-ADL item level as recorded: 1 = 자립, 2 = 부분 도움, 3 = 완전 도움 */
export type KAdlLevel = 1 | 2 | 3;

export interface KAdlAssessment {
  eating: KAdlLevel;
  mobility: KAdlLevel;
  toileting: KAdlLevel;
  assessedAt: string; // YYYY-MM-DD
  assessedBy: string;
}

export interface CognitionRecord {
  tool: "K-MMSE";
  score: number | null;
  max: 30;
  assessedAt: string | null;
}

export interface FallRiskRecord {
  tool: "Morse Fall Scale";
  score: number | null;
  assessedAt: string | null;
}

export interface Diagnosis {
  system: "KCD";
  code: string;
  display: string;
  principal: boolean;
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  route: "경구" | "피하" | "외용" | "흡입";
  frequency: string;
  startedAt: string;
  /** Record of today's administration entry — presence/status only. */
  todayRecord: "투약 기록 완료" | "기록 없음" | "보류 기록";
}

export type NoteType = "간호" | "요양" | "재활" | "사회복지" | "의사";

export interface CareNote {
  id: string;
  at: string; // ISO local datetime (no timezone; demo clock)
  type: NoteType;
  author: string;
  text: string;
  /** Whether hospital staff have marked the note as appropriate for family sharing. */
  familyShareable: boolean;
}

export interface VitalSign {
  id: string;
  at: string;
  sbp: number | null;
  dbp: number | null;
  pulse: number | null;
  temp: number | null;
  spo2: number | null;
  source: string;
  recordedBy: string;
}

/** Explainable change signal versus the person's own synthetic baseline. */
export interface ChangeSignal {
  id: string;
  domain: string;
  title: string;
  value: string;
  baseline: string;
  period: string;
  evidence: string;
  source: string;
  status: "확인 필요" | "관찰 중" | "데이터 부족";
}

export interface DailyLivingRecord {
  date: string;
  mealIntakePct: number | null;
  hydrationMl: number | null;
  sleepHours: number | null;
  activityMinutes: number | null;
  rehabSessions: number;
}

export interface ScheduleItem {
  id: string;
  date: string;
  title: string;
  kind: "진료 예약" | "재활" | "프로그램" | "병원 안내";
}

export type GuardianAuthority = "법정대리인(후견인)" | "환자 지정 보호자" | "권한 확인 전";

export interface Guardian {
  id: string;
  name: string;
  relationship: "배우자" | "자녀" | "형제·자매" | "기타";
  authority: GuardianAuthority;
  phoneMasked: string;
  /** Deterministic mock-delivery outcome for the demo (first attempt). */
  demoDeliveryOutcome: "success" | "fail-first";
}

export interface DischargePlan {
  plannedDate: string | null;
  destination: string;
  socialWorker: string;
  coordinationStatus: "계획 전" | "평가 중" | "연계 준비" | "연계 진행" | "완료";
  municipalityCode: string;
  municipalityName: string;
}

export interface Patient {
  id: string; // synthetic patient id
  name: string;
  initials: string;
  birthDate: string;
  gender: Gender;
  ward: WardId;
  room: string;
  bed: string;
  physician: string;
  primaryNurse: string;
  admissionDate: string;
  status: AdmissionStatus;
  diagnoses: Diagnosis[];
  functionalNote: string;
  kAdl: KAdlAssessment[]; // most recent last
  cognition: CognitionRecord;
  fallRisk: FallRiskRecord;
  medications: Medication[];
  notes: CareNote[];
  vitals: VitalSign[]; // chronological
  signals: ChangeSignal[];
  dailyLiving: DailyLivingRecord[];
  schedule: ScheduleItem[];
  guardians: Guardian[];
  discharge: DischargePlan;
}

export interface Ward {
  id: WardId;
  name: string;
  floor: string;
  rooms: { room: string; beds: string[] }[];
}

export const K_ADL_LABEL: Record<KAdlLevel, string> = {
  1: "자립",
  2: "부분 도움",
  3: "완전 도움"
};
