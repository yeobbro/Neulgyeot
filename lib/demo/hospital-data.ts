/**
 * SYNTHETIC DEMO DATA — Neulgyeot Hospital.
 *
 * Every person, staff member, code assignment, measurement and note below is
 * fabricated for interface demonstration. Nothing here describes a real
 * patient, and nothing here is a clinical interpretation.
 */
import type {
  CareNote,
  DailyLivingRecord,
  Patient,
  VitalSign,
  Ward
} from "../hospital/types";

export const DEMO_FACILITY = {
  id: "DEMO-FACILITY-0001",
  name: "늘곁 요양병원 (DEMO)",
  today: "2026-11-03"
} as const;

export const DEMO_STAFF = {
  currentUser: { name: "정다은", role: "의료사회복지사", department: "사회사업팀" },
  socialWorkers: ["정다은", "한유리"],
  recorders: ["정다은", "한유리", "오세훈(원무)"]
} as const;

export const WARDS: Ward[] = [
  {
    id: "2W",
    name: "2병동",
    floor: "2F",
    rooms: [
      { room: "201", beds: ["1", "2", "3", "4"] },
      { room: "202", beds: ["1", "2", "3", "4"] },
      { room: "203", beds: ["1", "2"] }
    ]
  },
  {
    id: "3W",
    name: "3병동 (재활)",
    floor: "3F",
    rooms: [
      { room: "301", beds: ["1", "2", "3", "4"] },
      { room: "302", beds: ["1", "2", "3", "4"] },
      { room: "303", beds: ["1", "2"] }
    ]
  },
  {
    id: "5W",
    name: "5병동 (인지)",
    floor: "5F",
    rooms: [
      { room: "501", beds: ["1", "2", "3", "4"] },
      { room: "502", beds: ["1", "2", "3", "4"] }
    ]
  }
];

const DAYS = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
const VITAL_SOURCE = "간호사 수기 측정 · EMR 입력 (가상)";

type VitalTuple = [sbp: number | null, dbp: number | null, pulse: number | null, temp: number | null, spo2: number | null];

function vitals(pid: string, nurse: string, rows: VitalTuple[]): VitalSign[] {
  return rows.map(([sbp, dbp, pulse, temp, spo2], i) => ({
    id: `${pid}-V${i + 1}`,
    at: `${DAYS[i]}T06:${i % 2 === 0 ? "10" : "30"}`,
    sbp,
    dbp,
    pulse,
    temp,
    spo2,
    source: VITAL_SOURCE,
    recordedBy: nurse
  }));
}

type DailyTuple = [meal: number | null, hydration: number | null, sleep: number | null, activity: number | null, rehab: number];

function daily(rows: DailyTuple[]): DailyLivingRecord[] {
  return rows.map(([mealIntakePct, hydrationMl, sleepHours, activityMinutes, rehabSessions], i) => ({
    date: DAYS[i],
    mealIntakePct,
    hydrationMl,
    sleepHours,
    activityMinutes,
    rehabSessions
  }));
}

function note(pid: string, n: number, at: string, type: CareNote["type"], author: string, text: string, familyShareable: boolean): CareNote {
  return { id: `${pid}-N${n}`, at, type, author, text, familyShareable };
}

export const PATIENTS: Patient[] = [
  {
    id: "SYN-P-0001",
    name: "한서진",
    initials: "한",
    birthDate: "1942-03-14",
    gender: "여",
    ward: "3W",
    room: "301",
    bed: "1",
    physician: "이준호 (재활의학과)",
    primaryNurse: "김수아",
    admissionDate: "2026-08-21",
    status: "퇴원 예정",
    diagnoses: [
      { system: "KCD", code: "I69.3", display: "뇌경색증의 후유증 (가상 기록)", principal: true },
      { system: "KCD", code: "I10", display: "본태성(원발성) 고혈압 (가상 기록)", principal: false },
      { system: "KCD", code: "E11.9", display: "합병증을 동반하지 않은 2형 당뇨병 (가상 기록)", principal: false }
    ],
    functionalNote: "보행기 사용 하 병동 내 이동 기록. 식사는 준비 후 스스로 수행 기록.",
    kAdl: [
      { eating: 2, mobility: 3, toileting: 3, assessedAt: "2026-08-22", assessedBy: "박지훈 (작업치료)" },
      { eating: 1, mobility: 2, toileting: 2, assessedAt: "2026-10-02", assessedBy: "박지훈 (작업치료)" },
      { eating: 1, mobility: 2, toileting: 2, assessedAt: "2026-10-30", assessedBy: "박지훈 (작업치료)" }
    ],
    cognition: { tool: "K-MMSE", score: 26, max: 30, assessedAt: "2026-10-15" },
    fallRisk: { tool: "Morse Fall Scale", score: 45, assessedAt: "2026-10-30" },
    medications: [
      { id: "M1", name: "Amlodipine", dose: "5 mg", route: "경구", frequency: "1일 1회 아침", startedAt: "2026-08-21", todayRecord: "투약 기록 완료" },
      { id: "M2", name: "Metformin", dose: "500 mg", route: "경구", frequency: "1일 2회 식후", startedAt: "2026-08-21", todayRecord: "투약 기록 완료" },
      { id: "M3", name: "Clopidogrel", dose: "75 mg", route: "경구", frequency: "1일 1회 아침", startedAt: "2026-08-21", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0001", 1, "2026-11-03T07:40", "간호", "김수아", "아침 식사 약 80% 섭취 기록. 보행기 이용하여 화장실 이동, 동행 1인.", true),
      note("SYN-P-0001", 2, "2026-11-02T15:10", "재활", "박지훈", "보행 훈련 20분 참여. 계단 2단 오르기 연습 시 난간 사용.", true),
      note("SYN-P-0001", 3, "2026-11-02T11:00", "사회복지", "정다은", "배우자와 퇴원 후 거주 계획 상담. 자택 욕실 문턱 관련 문의 있음.", false),
      note("SYN-P-0001", 4, "2026-11-01T21:30", "간호", "최민재", "취침 전 혈당 측정 기록. 특이 호소 기록 없음.", false),
      note("SYN-P-0001", 5, "2026-10-31T10:20", "요양", "오정희", "오전 레크리에이션 프로그램 참여 기록.", true)
    ],
    vitals: vitals("SYN-P-0001", "김수아", [
      [132, 78, 74, 36.6, 97],
      [128, 76, 72, 36.5, 97],
      [136, 80, 76, 36.7, 96],
      [130, 78, 73, 36.6, 97],
      [134, 82, 75, 36.6, 97],
      [129, 77, 72, 36.5, 98],
      [131, 79, 74, 36.6, 97]
    ]),
    signals: [],
    dailyLiving: daily([
      [80, 1200, 7, 45, 2],
      [75, 1100, 6.5, 50, 2],
      [85, 1250, 7, 55, 2],
      [80, 1150, 7.5, 40, 1],
      [70, 1000, 6, 30, 0],
      [85, 1200, 7, 50, 2],
      [80, null, null, null, 0]
    ]),
    schedule: [
      { id: "S1", date: "2026-11-05", title: "재활의학과 외래 경과 확인", kind: "진료 예약" },
      { id: "S2", date: "2026-11-07", title: "보호자 퇴원 교육 (낙상 예방, 보행기 사용)", kind: "병원 안내" },
      { id: "S3", date: "2026-11-12", title: "퇴원 예정일", kind: "병원 안내" }
    ],
    guardians: [
      { id: "G1", name: "한도윤", relationship: "자녀", authority: "환자 지정 보호자", phoneMasked: "010-****-1201", demoDeliveryOutcome: "success" },
      { id: "G2", name: "김영식", relationship: "배우자", authority: "권한 확인 전", phoneMasked: "010-****-4410", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: "2026-11-12",
      destination: "자택 (배우자와 거주)",
      socialWorker: "정다은",
      coordinationStatus: "평가 중",
      municipalityCode: "DEMO-MUNI-11001",
      municipalityName: "DEMO시 늘봄구"
    }
  },
  {
    id: "SYN-P-0002",
    name: "박정호",
    initials: "박",
    birthDate: "1938-11-02",
    gender: "남",
    ward: "3W",
    room: "302",
    bed: "3",
    physician: "이준호 (재활의학과)",
    primaryNurse: "김수아",
    admissionDate: "2026-09-10",
    status: "퇴원 예정",
    diagnoses: [
      { system: "KCD", code: "S72.0", display: "대퇴골 경부의 골절 — 수술 후 재활 (가상 기록)", principal: true },
      { system: "KCD", code: "M81.0", display: "폐경후 골다공증 외 골다공증 (가상 기록)", principal: false }
    ],
    functionalNote: "워커 보행 기록. 야간 화장실 이동 시 보조 요청 기록 다수.",
    kAdl: [
      { eating: 1, mobility: 3, toileting: 3, assessedAt: "2026-09-11", assessedBy: "박지훈 (작업치료)" },
      { eating: 1, mobility: 2, toileting: 2, assessedAt: "2026-10-28", assessedBy: "박지훈 (작업치료)" }
    ],
    cognition: { tool: "K-MMSE", score: 24, max: 30, assessedAt: "2026-09-14" },
    fallRisk: { tool: "Morse Fall Scale", score: 55, assessedAt: "2026-10-28" },
    medications: [
      { id: "M1", name: "Acetaminophen ER", dose: "650 mg", route: "경구", frequency: "1일 2회 필요 시", startedAt: "2026-09-10", todayRecord: "기록 없음" },
      { id: "M2", name: "Calcium + Vitamin D", dose: "1정", route: "경구", frequency: "1일 1회", startedAt: "2026-09-10", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0002", 1, "2026-11-03T05:50", "간호", "최민재", "02:30 화장실 이동 보조 요청 기록. 보조 하 이동.", false),
      note("SYN-P-0002", 2, "2026-11-02T14:00", "재활", "박지훈", "평행봉 보행 15분, 워커 보행 30m 기록.", true),
      note("SYN-P-0002", 3, "2026-11-01T10:30", "사회복지", "한유리", "독거 예정. 자녀 원거리 거주. 식사 준비 지원 필요 여부 상담 기록.", false),
      note("SYN-P-0002", 4, "2026-10-31T19:00", "요양", "오정희", "저녁 식사 절반가량 섭취 기록.", true)
    ],
    vitals: vitals("SYN-P-0002", "최민재", [
      [124, 70, 68, 36.4, 96],
      [126, 72, 70, 36.5, 96],
      [122, 70, 66, null, 95],
      [128, 74, 71, 36.6, 96],
      [120, 68, 69, 36.5, 96],
      [125, 72, 70, 36.5, 95],
      [123, 71, 68, 36.4, 96]
    ]),
    signals: [
      {
        id: "SIG-0002-1",
        domain: "식사",
        title: "최근 식사 섭취 기록이 개인 기준선보다 낮게 이어짐",
        value: "평균 58%",
        baseline: "개인 기준 76% (직전 14일)",
        period: "최근 3일",
        evidence: "최근 9회 식사 기록 중 6회가 개인 기준선보다 낮음. 원인은 판단하지 않습니다.",
        source: "식사 섭취 관찰 기록 (가상)",
        status: "확인 필요"
      }
    ],
    dailyLiving: daily([
      [75, 1000, 6, 30, 2],
      [70, 950, 5.5, 35, 2],
      [70, 900, 6, 30, 2],
      [60, 900, 5, 25, 1],
      [55, 850, 5, 20, 0],
      [60, 900, 5.5, 30, 2],
      [55, null, 5, null, 0]
    ]),
    schedule: [
      { id: "S1", date: "2026-11-10", title: "정형외과 협진 외래", kind: "진료 예약" },
      { id: "S2", date: "2026-11-20", title: "퇴원 예정일", kind: "병원 안내" }
    ],
    guardians: [
      { id: "G1", name: "박미경", relationship: "자녀", authority: "환자 지정 보호자", phoneMasked: "010-****-7720", demoDeliveryOutcome: "fail-first" }
    ],
    discharge: {
      plannedDate: "2026-11-20",
      destination: "자택 (독거)",
      socialWorker: "한유리",
      coordinationStatus: "평가 중",
      municipalityCode: "DEMO-MUNI-11002",
      municipalityName: "DEMO시 늘곁구"
    }
  },
  {
    id: "SYN-P-0003",
    name: "오미자",
    initials: "오",
    birthDate: "1945-06-30",
    gender: "여",
    ward: "5W",
    room: "501",
    bed: "2",
    physician: "윤가람 (신경과)",
    primaryNurse: "이하린",
    admissionDate: "2026-04-03",
    status: "재원",
    diagnoses: [
      { system: "KCD", code: "F00.1", display: "만기 발병 알츠하이머병에서의 치매 (가상 기록)", principal: true },
      { system: "KCD", code: "I10", display: "본태성(원발성) 고혈압 (가상 기록)", principal: false }
    ],
    functionalNote: "식사 시 언어적 촉구 필요 기록. 병동 내 독립 보행 기록.",
    kAdl: [{ eating: 2, mobility: 1, toileting: 2, assessedAt: "2026-10-12", assessedBy: "박지훈 (작업치료)" }],
    cognition: { tool: "K-MMSE", score: 15, max: 30, assessedAt: "2026-10-12" },
    fallRisk: { tool: "Morse Fall Scale", score: 35, assessedAt: "2026-10-12" },
    medications: [
      { id: "M1", name: "Donepezil", dose: "5 mg", route: "경구", frequency: "1일 1회 취침 전", startedAt: "2026-04-03", todayRecord: "기록 없음" },
      { id: "M2", name: "Losartan", dose: "50 mg", route: "경구", frequency: "1일 1회 아침", startedAt: "2026-04-03", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0003", 1, "2026-11-03T08:10", "요양", "오정희", "아침 식사 시 촉구 후 섭취 시작, 약 60% 섭취 기록.", true),
      note("SYN-P-0003", 2, "2026-11-02T16:00", "요양", "오정희", "회상 프로그램 참여 40분 기록.", true),
      note("SYN-P-0003", 3, "2026-11-01T23:10", "간호", "이하린", "야간 병동 복도 보행 기록, 동행 후 병실 복귀.", false)
    ],
    vitals: vitals("SYN-P-0003", "이하린", [
      [138, 82, 78, 36.7, 97],
      [140, 84, 80, 36.6, 97],
      [null, null, null, null, null],
      [136, 80, 77, 36.6, 96],
      [142, 86, 79, 36.8, 97],
      [139, 83, 78, 36.7, 97],
      [137, 82, 77, 36.6, 97]
    ]),
    signals: [
      {
        id: "SIG-0003-1",
        domain: "수면",
        title: "야간 수면 기록 시간이 개인 기준보다 짧게 기록됨",
        value: "평균 4.8시간",
        baseline: "개인 기준 6.5시간 (직전 14일)",
        period: "최근 4일",
        evidence: "야간 순회 기록 기반 추정치. 기록 누락 가능성을 함께 확인해 주세요.",
        source: "야간 순회 관찰 기록 (가상)",
        status: "관찰 중"
      },
      {
        id: "SIG-0003-2",
        domain: "활력징후",
        title: "10/30 활력징후 측정 기록 없음",
        value: "기록 없음",
        baseline: "1일 1회 측정 기록",
        period: "2026-10-30",
        evidence: "해당 일자 측정값이 입력되지 않았습니다. 정상으로 간주하지 않습니다.",
        source: "활력징후 기록 (가상)",
        status: "데이터 부족"
      }
    ],
    dailyLiving: daily([
      [65, 900, 6.5, 40, 0],
      [60, 850, 6, 35, 0],
      [60, null, 5, 30, 0],
      [55, 800, 4.5, 35, 0],
      [60, 850, 4.5, 40, 0],
      [65, 900, 5, 45, 0],
      [60, null, null, null, 0]
    ]),
    schedule: [{ id: "S1", date: "2026-11-06", title: "인지 프로그램 (음악)", kind: "프로그램" }],
    guardians: [
      { id: "G1", name: "오준석", relationship: "자녀", authority: "법정대리인(후견인)", phoneMasked: "010-****-3305", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: null,
      destination: "미정",
      socialWorker: "한유리",
      coordinationStatus: "계획 전",
      municipalityCode: "DEMO-MUNI-11001",
      municipalityName: "DEMO시 늘봄구"
    }
  },
  {
    id: "SYN-P-0004",
    name: "최동석",
    initials: "최",
    birthDate: "1950-01-19",
    gender: "남",
    ward: "2W",
    room: "201",
    bed: "2",
    physician: "서지안 (내과)",
    primaryNurse: "최민재",
    admissionDate: "2026-10-05",
    status: "외출·외박",
    diagnoses: [
      { system: "KCD", code: "J18.9", display: "상세불명의 폐렴 — 회복기 (가상 기록)", principal: true },
      { system: "KCD", code: "J44.9", display: "상세불명의 만성 폐쇄성 폐질환 (가상 기록)", principal: false }
    ],
    functionalNote: "외박 중 (11/02 ~ 11/04). 복귀 후 활력징후 측정 예정.",
    kAdl: [{ eating: 1, mobility: 1, toileting: 1, assessedAt: "2026-10-20", assessedBy: "박지훈 (작업치료)" }],
    cognition: { tool: "K-MMSE", score: 28, max: 30, assessedAt: "2026-10-07" },
    fallRisk: { tool: "Morse Fall Scale", score: 20, assessedAt: "2026-10-20" },
    medications: [
      { id: "M1", name: "Tiotropium", dose: "18 mcg", route: "흡입", frequency: "1일 1회", startedAt: "2026-10-05", todayRecord: "보류 기록" }
    ],
    notes: [
      note("SYN-P-0004", 1, "2026-11-02T10:00", "간호", "최민재", "외박 출발. 흡입제 사용 교육 재확인 기록.", false),
      note("SYN-P-0004", 2, "2026-11-01T14:30", "재활", "박지훈", "호흡 재활 30분 참여 기록.", true)
    ],
    vitals: vitals("SYN-P-0004", "최민재", [
      [126, 76, 82, 36.8, 94],
      [124, 74, 80, 36.7, 95],
      [122, 74, 78, 36.6, 95],
      [120, 72, 79, 36.6, 95],
      [122, 73, 78, 36.5, 95],
      [null, null, null, null, null],
      [null, null, null, null, null]
    ]),
    signals: [
      {
        id: "SIG-0004-1",
        domain: "활력징후",
        title: "외박 기간 측정 기록 없음",
        value: "2일 기록 없음",
        baseline: "1일 1회 측정 기록",
        period: "11/02 ~ 11/03",
        evidence: "외박으로 인한 측정 공백입니다. 복귀 후 측정 기록을 확인해 주세요.",
        source: "활력징후 기록 (가상)",
        status: "데이터 부족"
      }
    ],
    dailyLiving: daily([
      [85, 1300, 7, 60, 1],
      [90, 1350, 7.5, 55, 1],
      [85, 1250, 7, 60, 1],
      [90, 1300, 7, 65, 1],
      [85, 1200, 7, 50, 1],
      [null, null, null, null, 0],
      [null, null, null, null, 0]
    ]),
    schedule: [{ id: "S1", date: "2026-11-04", title: "외박 복귀 예정", kind: "병원 안내" }],
    guardians: [
      { id: "G1", name: "최은정", relationship: "배우자", authority: "환자 지정 보호자", phoneMasked: "010-****-9014", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: null,
      destination: "미정",
      socialWorker: "정다은",
      coordinationStatus: "계획 전",
      municipalityCode: "DEMO-MUNI-11003",
      municipalityName: "DEMO군 늘솔읍"
    }
  },
  {
    id: "SYN-P-0005",
    name: "윤복순",
    initials: "윤",
    birthDate: "1936-09-08",
    gender: "여",
    ward: "3W",
    room: "301",
    bed: "3",
    physician: "이준호 (재활의학과)",
    primaryNurse: "김수아",
    admissionDate: "2026-09-25",
    status: "퇴원 예정",
    diagnoses: [
      { system: "KCD", code: "M17.0", display: "양측성 원발성 무릎관절증 — 인공관절 수술 후 (가상 기록)", principal: true },
      { system: "KCD", code: "I10", display: "본태성(원발성) 고혈압 (가상 기록)", principal: false }
    ],
    functionalNote: "지팡이 보행 기록. 계단 이동 시 보조 필요 기록.",
    kAdl: [
      { eating: 1, mobility: 2, toileting: 2, assessedAt: "2026-09-26", assessedBy: "박지훈 (작업치료)" },
      { eating: 1, mobility: 2, toileting: 1, assessedAt: "2026-10-29", assessedBy: "박지훈 (작업치료)" }
    ],
    cognition: { tool: "K-MMSE", score: 27, max: 30, assessedAt: "2026-09-28" },
    fallRisk: { tool: "Morse Fall Scale", score: 40, assessedAt: "2026-10-29" },
    medications: [
      { id: "M1", name: "Valsartan", dose: "80 mg", route: "경구", frequency: "1일 1회 아침", startedAt: "2026-09-25", todayRecord: "투약 기록 완료" },
      { id: "M2", name: "Celecoxib", dose: "200 mg", route: "경구", frequency: "1일 1회", startedAt: "2026-09-25", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0005", 1, "2026-11-03T09:00", "재활", "박지훈", "계단 오르내리기 연습 4층분 기록, 난간 사용.", true),
      note("SYN-P-0005", 2, "2026-11-02T11:20", "사회복지", "정다은", "퇴원 후 자녀 가족과 거주 예정. 주소지 이전 예정 여부 확인 필요.", false)
    ],
    vitals: vitals("SYN-P-0005", "김수아", [
      [142, 84, 76, 36.6, 97],
      [138, 82, 74, 36.5, 97],
      [140, 82, 75, 36.6, 97],
      [136, 80, 74, 36.5, 98],
      [139, 83, 75, 36.6, 97],
      [137, 81, 73, 36.5, 97],
      [138, 82, 74, 36.6, 97]
    ]),
    signals: [],
    dailyLiving: daily([
      [90, 1300, 7, 60, 2],
      [90, 1250, 7.5, 65, 2],
      [85, 1300, 7, 60, 2],
      [90, 1350, 7, 70, 1],
      [90, 1300, 8, 40, 0],
      [95, 1300, 7, 65, 2],
      [90, null, null, null, 1]
    ]),
    schedule: [{ id: "S1", date: "2026-11-08", title: "퇴원 예정일", kind: "병원 안내" }],
    guardians: [
      { id: "G1", name: "윤성민", relationship: "자녀", authority: "환자 지정 보호자", phoneMasked: "010-****-5521", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: "2026-11-08",
      destination: "자녀 가족 자택",
      socialWorker: "정다은",
      coordinationStatus: "연계 준비",
      municipalityCode: "DEMO-MUNI-11002",
      municipalityName: "DEMO시 늘곁구"
    }
  },
  {
    id: "SYN-P-0006",
    name: "강태수",
    initials: "강",
    birthDate: "1947-12-01",
    gender: "남",
    ward: "2W",
    room: "202",
    bed: "1",
    physician: "윤가람 (신경과)",
    primaryNurse: "최민재",
    admissionDate: "2026-07-14",
    status: "재원",
    diagnoses: [{ system: "KCD", code: "G20", display: "파킨슨병 (가상 기록)", principal: true }],
    functionalNote: "휠체어 이동 기록. 식사 시 보조 도구 사용.",
    kAdl: [{ eating: 2, mobility: 3, toileting: 2, assessedAt: "2026-10-18", assessedBy: "박지훈 (작업치료)" }],
    cognition: { tool: "K-MMSE", score: 22, max: 30, assessedAt: "2026-10-18" },
    fallRisk: { tool: "Morse Fall Scale", score: 60, assessedAt: "2026-10-18" },
    medications: [
      { id: "M1", name: "Levodopa/Carbidopa", dose: "100/25 mg", route: "경구", frequency: "1일 3회", startedAt: "2026-07-14", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0006", 1, "2026-11-03T08:30", "간호", "최민재", "아침 식사 보조 도구 사용, 약 70% 섭취 기록.", true),
      note("SYN-P-0006", 2, "2026-11-02T13:00", "재활", "박지훈", "상지 기능 훈련 30분 기록.", true)
    ],
    vitals: vitals("SYN-P-0006", "최민재", [
      [118, 70, 72, 36.5, 96],
      [116, 68, 70, 36.4, 96],
      [120, 72, 71, 36.5, 96],
      [118, 70, 72, 36.5, 97],
      [114, 66, 70, 36.4, 96],
      [117, 69, 71, 36.5, 96],
      [119, 70, 72, 36.5, 96]
    ]),
    signals: [],
    dailyLiving: daily([
      [70, 1000, 7, 30, 1],
      [70, 1050, 7, 30, 1],
      [75, 1000, 6.5, 35, 1],
      [70, 1000, 7, 30, 1],
      [65, 950, 7, 25, 0],
      [70, 1000, 7, 30, 1],
      [70, null, null, null, 1]
    ]),
    schedule: [{ id: "S1", date: "2026-11-09", title: "신경과 정기 진료", kind: "진료 예약" }],
    guardians: [
      { id: "G1", name: "강민호", relationship: "자녀", authority: "환자 지정 보호자", phoneMasked: "010-****-6602", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: null,
      destination: "미정",
      socialWorker: "한유리",
      coordinationStatus: "계획 전",
      municipalityCode: "DEMO-MUNI-11001",
      municipalityName: "DEMO시 늘봄구"
    }
  },
  {
    id: "SYN-P-0007",
    name: "임순례",
    initials: "임",
    birthDate: "1940-02-22",
    gender: "여",
    ward: "2W",
    room: "202",
    bed: "4",
    physician: "서지안 (내과)",
    primaryNurse: "이하린",
    admissionDate: "2026-06-30",
    status: "재원",
    diagnoses: [
      { system: "KCD", code: "I50.0", display: "울혈성 심부전 (가상 기록)", principal: true },
      { system: "KCD", code: "N18.3", display: "만성 콩팥병 3기 (가상 기록)", principal: false }
    ],
    functionalNote: "병실 내 보행 기록. 하지 부종 관찰 기록 지속.",
    kAdl: [{ eating: 1, mobility: 2, toileting: 2, assessedAt: "2026-10-10", assessedBy: "박지훈 (작업치료)" }],
    cognition: { tool: "K-MMSE", score: 25, max: 30, assessedAt: "2026-07-02" },
    fallRisk: { tool: "Morse Fall Scale", score: 50, assessedAt: "2026-10-10" },
    medications: [
      { id: "M1", name: "Furosemide", dose: "20 mg", route: "경구", frequency: "1일 1회 아침", startedAt: "2026-06-30", todayRecord: "투약 기록 완료" },
      { id: "M2", name: "Bisoprolol", dose: "2.5 mg", route: "경구", frequency: "1일 1회", startedAt: "2026-06-30", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0007", 1, "2026-11-03T06:40", "간호", "이하린", "아침 체중 측정 기록. 섭취·배설량 기록 진행.", false),
      note("SYN-P-0007", 2, "2026-11-02T10:00", "요양", "오정희", "오전 산책 프로그램 10분 참여 기록.", true)
    ],
    vitals: vitals("SYN-P-0007", "이하린", [
      [122, 68, 66, 36.4, 95],
      [120, 66, 64, 36.4, 94],
      [124, 70, 67, 36.5, 95],
      [118, 66, 65, 36.4, 94],
      [121, 68, 66, 36.4, 94],
      [119, 67, 65, 36.3, 93],
      [120, 67, 66, 36.4, 93]
    ]),
    signals: [
      {
        id: "SIG-0007-1",
        domain: "산소포화도",
        title: "SpO₂ 기록값이 개인 최근 범위보다 낮은 쪽으로 기록됨",
        value: "93% (최근 2회)",
        baseline: "개인 기준 94–95% (직전 14일)",
        period: "11/02 ~ 11/03",
        evidence: "수기 측정 기록 2회 기준. 측정 조건 차이 가능성 포함, 단일 수치로 판단하지 않습니다.",
        source: "활력징후 기록 (가상)",
        status: "확인 필요"
      }
    ],
    dailyLiving: daily([
      [70, 900, 6, 20, 0],
      [75, 950, 6.5, 20, 0],
      [70, 900, 6, 15, 0],
      [70, 900, 6, 20, 0],
      [65, 850, 6, 10, 0],
      [70, 900, 6, 15, 0],
      [70, null, null, null, 0]
    ]),
    schedule: [{ id: "S1", date: "2026-11-11", title: "내과 정기 진료", kind: "진료 예약" }],
    guardians: [
      { id: "G1", name: "임정우", relationship: "형제·자매", authority: "권한 확인 전", phoneMasked: "010-****-8831", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: null,
      destination: "미정",
      socialWorker: "정다은",
      coordinationStatus: "계획 전",
      municipalityCode: "DEMO-MUNI-11001",
      municipalityName: "DEMO시 늘봄구"
    }
  },
  {
    id: "SYN-P-0008",
    name: "서영길",
    initials: "서",
    birthDate: "1944-05-17",
    gender: "남",
    ward: "3W",
    room: "303",
    bed: "1",
    physician: "이준호 (재활의학과)",
    primaryNurse: "김수아",
    admissionDate: "2026-08-04",
    status: "퇴원 예정",
    diagnoses: [
      { system: "KCD", code: "I69.4", display: "출혈 또는 경색증으로 명시되지 않은 뇌졸중의 후유증 (가상 기록)", principal: true },
      { system: "KCD", code: "E78.5", display: "상세불명의 고지질혈증 (가상 기록)", principal: false }
    ],
    functionalNote: "편측 보조기 착용 하 지팡이 보행 기록. 우측 상지 미세동작 훈련 중.",
    kAdl: [
      { eating: 2, mobility: 2, toileting: 2, assessedAt: "2026-08-05", assessedBy: "박지훈 (작업치료)" },
      { eating: 1, mobility: 2, toileting: 1, assessedAt: "2026-10-31", assessedBy: "박지훈 (작업치료)" }
    ],
    cognition: { tool: "K-MMSE", score: 27, max: 30, assessedAt: "2026-10-20" },
    fallRisk: { tool: "Morse Fall Scale", score: 35, assessedAt: "2026-10-31" },
    medications: [
      { id: "M1", name: "Aspirin", dose: "100 mg", route: "경구", frequency: "1일 1회", startedAt: "2026-08-04", todayRecord: "투약 기록 완료" },
      { id: "M2", name: "Atorvastatin", dose: "20 mg", route: "경구", frequency: "1일 1회 저녁", startedAt: "2026-08-04", todayRecord: "기록 없음" }
    ],
    notes: [
      note("SYN-P-0008", 1, "2026-11-03T10:10", "재활", "박지훈", "지팡이 보행 100m 기록. 휴식 1회.", true),
      note("SYN-P-0008", 2, "2026-11-02T15:30", "사회복지", "한유리", "독거. 2층 주택(엘리베이터 없음). 계단 이동 관련 상담 기록.", false)
    ],
    vitals: vitals("SYN-P-0008", "김수아", [
      [128, 78, 70, 36.5, 97],
      [130, 80, 72, 36.6, 97],
      [126, 76, 70, 36.5, 98],
      [128, 78, 71, 36.5, 97],
      [127, 77, 70, 36.6, 97],
      [129, 78, 72, 36.5, 97],
      [128, 77, 71, 36.5, 97]
    ]),
    signals: [],
    dailyLiving: daily([
      [90, 1400, 7, 70, 2],
      [90, 1350, 7, 75, 2],
      [85, 1300, 7.5, 70, 2],
      [90, 1400, 7, 80, 2],
      [90, 1300, 7, 50, 0],
      [90, 1350, 7, 75, 2],
      [90, null, null, null, 1]
    ]),
    schedule: [
      { id: "S1", date: "2026-11-13", title: "퇴원 전 가정 환경 점검 상담", kind: "병원 안내" },
      { id: "S2", date: "2026-11-15", title: "퇴원 예정일", kind: "병원 안내" }
    ],
    guardians: [
      { id: "G1", name: "서지민", relationship: "자녀", authority: "환자 지정 보호자", phoneMasked: "010-****-2218", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: "2026-11-15",
      destination: "자택 (독거)",
      socialWorker: "한유리",
      coordinationStatus: "평가 중",
      municipalityCode: "DEMO-MUNI-11003",
      municipalityName: "DEMO군 늘솔읍"
    }
  },
  {
    id: "SYN-P-0009",
    name: "노금자",
    initials: "노",
    birthDate: "1939-07-25",
    gender: "여",
    ward: "5W",
    room: "502",
    bed: "1",
    physician: "윤가람 (신경과)",
    primaryNurse: "이하린",
    admissionDate: "2026-02-11",
    status: "재원",
    diagnoses: [{ system: "KCD", code: "F01.9", display: "상세불명의 혈관성 치매 (가상 기록)", principal: true }],
    functionalNote: "식사 전 과정 보조 기록. 침상-휠체어 이동 2인 보조 기록.",
    kAdl: [{ eating: 3, mobility: 3, toileting: 3, assessedAt: "2026-10-05", assessedBy: "박지훈 (작업치료)" }],
    cognition: { tool: "K-MMSE", score: null, max: 30, assessedAt: null },
    fallRisk: { tool: "Morse Fall Scale", score: 50, assessedAt: "2026-10-05" },
    medications: [
      { id: "M1", name: "Memantine", dose: "10 mg", route: "경구", frequency: "1일 1회", startedAt: "2026-02-11", todayRecord: "투약 기록 완료" }
    ],
    notes: [
      note("SYN-P-0009", 1, "2026-11-03T07:20", "요양", "오정희", "체위 변경 2시간 간격 기록 유지.", false),
      note("SYN-P-0009", 2, "2026-11-02T12:30", "요양", "오정희", "점심 식사 보조 하 약 50% 섭취 기록.", true)
    ],
    vitals: vitals("SYN-P-0009", "이하린", [
      [112, 64, 74, 36.6, 96],
      [110, 62, 72, 36.5, 96],
      [114, 66, 75, 36.7, 96],
      [112, 64, 74, 36.6, 95],
      [110, 64, 73, 36.6, 96],
      [113, 65, 74, 36.6, 96],
      [111, 63, 73, 36.5, 96]
    ]),
    signals: [
      {
        id: "SIG-0009-1",
        domain: "인지 평가",
        title: "K-MMSE 평가 기록 없음",
        value: "기록 없음",
        baseline: "—",
        period: "입원 이후",
        evidence: "평가 수행 가능 여부 및 기록 위치를 확인해 주세요.",
        source: "평가 기록 (가상)",
        status: "데이터 부족"
      }
    ],
    dailyLiving: daily([
      [50, 700, 8, 0, 0],
      [55, 750, 8, 0, 0],
      [50, 700, 8.5, 0, 0],
      [50, 700, 8, 0, 0],
      [45, 650, 8, 0, 0],
      [50, 700, 8, 0, 0],
      [50, null, null, null, 0]
    ]),
    schedule: [],
    guardians: [
      { id: "G1", name: "노현정", relationship: "자녀", authority: "법정대리인(후견인)", phoneMasked: "010-****-0912", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: null,
      destination: "미정",
      socialWorker: "한유리",
      coordinationStatus: "계획 전",
      municipalityCode: "DEMO-MUNI-11002",
      municipalityName: "DEMO시 늘곁구"
    }
  },
  {
    id: "SYN-P-0010",
    name: "문기철",
    initials: "문",
    birthDate: "1952-10-03",
    gender: "남",
    ward: "3W",
    room: "302",
    bed: "1",
    physician: "이준호 (재활의학과)",
    primaryNurse: "김수아",
    admissionDate: "2026-10-14",
    status: "재원",
    diagnoses: [{ system: "KCD", code: "M48.06", display: "척추협착 — 요추부, 수술 후 재활 (가상 기록)", principal: true }],
    functionalNote: "보조기 착용 하 독립 보행 기록.",
    kAdl: [{ eating: 1, mobility: 2, toileting: 1, assessedAt: "2026-10-15", assessedBy: "박지훈 (작업치료)" }],
    cognition: { tool: "K-MMSE", score: 29, max: 30, assessedAt: "2026-10-16" },
    fallRisk: { tool: "Morse Fall Scale", score: 25, assessedAt: "2026-10-15" },
    medications: [
      { id: "M1", name: "Pregabalin", dose: "75 mg", route: "경구", frequency: "1일 2회", startedAt: "2026-10-14", todayRecord: "투약 기록 완료" }
    ],
    notes: [note("SYN-P-0010", 1, "2026-11-03T09:40", "재활", "박지훈", "코어 근력 운동 30분 기록.", true)],
    vitals: vitals("SYN-P-0010", "김수아", [
      [124, 76, 68, 36.5, 98],
      [126, 78, 70, 36.6, 98],
      [122, 76, 68, 36.5, 98],
      [124, 76, 69, 36.5, 98],
      [125, 77, 70, 36.6, 98],
      [123, 76, 68, 36.5, 98],
      [124, 76, 69, 36.5, 98]
    ]),
    signals: [],
    dailyLiving: daily([
      [95, 1500, 7, 80, 2],
      [95, 1500, 7, 85, 2],
      [90, 1400, 7.5, 80, 2],
      [95, 1500, 7, 90, 2],
      [95, 1450, 7, 60, 0],
      [95, 1500, 7, 85, 2],
      [95, null, null, null, 1]
    ]),
    schedule: [{ id: "S1", date: "2026-11-17", title: "신경외과 협진 외래", kind: "진료 예약" }],
    guardians: [
      { id: "G1", name: "문혜진", relationship: "배우자", authority: "환자 지정 보호자", phoneMasked: "010-****-3317", demoDeliveryOutcome: "success" }
    ],
    discharge: {
      plannedDate: null,
      destination: "미정",
      socialWorker: "정다은",
      coordinationStatus: "계획 전",
      municipalityCode: "DEMO-MUNI-11001",
      municipalityName: "DEMO시 늘봄구"
    }
  }
];

export const MUNICIPALITIES = [
  { code: "DEMO-MUNI-11001", name: "DEMO시 늘봄구", organization: "늘봄구 통합돌봄 전담팀 (DEMO)" },
  { code: "DEMO-MUNI-11002", name: "DEMO시 늘곁구", organization: "늘곁구 통합돌봄 전담팀 (DEMO)" },
  { code: "DEMO-MUNI-11003", name: "DEMO군 늘솔읍", organization: "늘솔읍 행정복지센터 돌봄창구 (DEMO)" }
] as const;
