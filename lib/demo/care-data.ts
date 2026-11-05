/**
 * DEMO care-tagging data (synthetic). Staff, bedside tags, care plans, seeded care events, guardian accounts and municipal
 * care-link statuses for the Quick Tagging, Care Timeline and Family Dashboard screens. Deterministic: no randomness, no wall clock.
 */
import { PATIENTS } from "./hospital-data";
import type { CareEvent, CareType, ConfirmationStatus, Resident, Staff, SourceDevice } from "../care/types";
import type { CarePlanItem } from "../care/timeline";
import type { GuardianAccount, MunicipalLink } from "../care/family";

export const CARE_DEMO_TODAY = "2026-11-03";
/** Demo "server now" for the tagging screens: 14:00 KST on the demo day (matches lib/demo/clock.ts base). */
export const CARE_DEMO_NOW = "2026-11-03T14:00:00+09:00";

export const CARE_STAFF: Staff[] = [
  { id: "ST-N01", name: "이수아", role: "간호사", wards: ["2W", "3W"], badgeId: "BADGE-N01", active: true },
  { id: "ST-N02", name: "문지훈", role: "간호사", wards: ["5W"], badgeId: "BADGE-N02", active: true },
  { id: "ST-C01", name: "김말순", role: "요양보호사", wards: ["3W"], badgeId: "BADGE-C01", active: true },
  { id: "ST-C02", name: "박영희", role: "요양보호사", wards: ["2W"], badgeId: "BADGE-C02", active: true },
  { id: "ST-C03", name: "최동수", role: "요양보호사", wards: ["5W"], badgeId: "BADGE-C03", active: true },
  { id: "ST-A01", name: "서하늘", role: "간호조무사", wards: ["2W", "3W", "5W"], badgeId: "BADGE-A01", active: true },
  { id: "ST-X01", name: "퇴사자(DEMO)", role: "요양보호사", wards: ["3W"], badgeId: "BADGE-X01", active: false }
];

export const CARE_RESIDENTS: Resident[] = PATIENTS.map((p) => ({ id: p.id, ward: p.ward, displayName: `${p.name} (${p.room}-${p.bed})`, tagId: `TAG-${p.id.slice(-4)}` }));

const BASE_PLAN: { care_type: CareType; times: string[] }[] = [
  { care_type: "repositioning", times: ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"] },
  { care_type: "meal_assist", times: ["07:30", "12:00", "17:30"] },
  { care_type: "medication_assist", times: ["08:00", "18:00"] },
  { care_type: "hydration", times: ["10:30", "15:00"] },
  { care_type: "diaper_change", times: ["06:30", "11:00", "15:30", "21:00"] },
  { care_type: "hygiene", times: ["09:00"] }
];

export const CARE_PLAN: CarePlanItem[] = CARE_RESIDENTS.flatMap((r, i) =>
  BASE_PLAN.filter((b) => !(b.care_type === "diaper_change" && i % 3 === 2)).map((b) => ({ resident_id: r.id, care_type: b.care_type, times: b.times }))
);

const CAREGIVER_BY_WARD: Record<string, string> = { "2W": "ST-C02", "3W": "ST-C01", "5W": "ST-C03" };
const NURSE_BY_WARD: Record<string, string> = { "2W": "ST-N01", "3W": "ST-N01", "5W": "ST-N02" };
const SOURCES: SourceDevice[] = ["nfc_mobile", "qr", "mobile_web"];

function iso(date: string, hhmm: string, plusMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + plusMin;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00+09:00`;
}

/** Seven days of seeded events (10-28 … 11-03 until 14:00). A deterministic pattern leaves some slots missing / unconfirmed. */
function seed(): CareEvent[] {
  const out: CareEvent[] = [];
  const days = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
  let n = 0;
  days.forEach((date, di) => {
    CARE_RESIDENTS.forEach((r, ri) => {
      CARE_PLAN.filter((p) => p.resident_id === r.id).forEach((p, pi) => {
        p.times.forEach((hhmm, ti) => {
          if (date === "2026-11-03" && hhmm > "13:30") return;            // future relative to the demo "now"
          const h = (di * 7 + ri * 5 + pi * 3 + ti) % 23;
          if (h === 0 || (h === 11 && p.care_type === "repositioning")) return;   // missing
          const delay = ((h * 7) % 41) - 15;                                   // −15 … +25 min
          const performed = iso(date, hhmm, delay);
          const staff = p.care_type === "medication_assist" ? NURSE_BY_WARD[r.ward] : h % 5 === 0 ? "ST-A01" : CAREGIVER_BY_WARD[r.ward];
          const status: ConfirmationStatus = h % 9 === 4 ? "recorded" : h % 3 === 0 && staff !== NURSE_BY_WARD[r.ward] ? "independently_verified" : "staff_confirmed";
          const recorded = iso(date, hhmm, delay + 1);
          n++;
          out.push({
            care_event_id: `CE-${String(n).padStart(5, "0")}`, client_event_id: `seed-${n}`, resident_id: r.id, staff_id: staff, care_type: p.care_type,
            performed_at: performed, recorded_at: recorded, source_device: SOURCES[h % 3], confirmation_status: status,
            confirmed_at: status === "recorded" ? null : iso(date, hhmm, delay + 2),
            verified_by: status === "independently_verified" ? NURSE_BY_WARD[r.ward] : null,
            verified_at: status === "independently_verified" ? iso(date, hhmm, delay + 40) : null,
            notes: null, correction_reference: null, created_at: recorded
          });
        });
      });
    });
  });
  return out;
}

export const SEED_CARE_EVENTS: CareEvent[] = seed();

export const GUARDIAN_ACCOUNTS: GuardianAccount[] = PATIENTS.flatMap((p) =>
  p.guardians.map((g) => ({
    guardian_account_id: `GA-${p.id.slice(-4)}-${g.id}`,
    name: g.name,
    links: [{ resident_id: p.id, authority: g.authority, revoked: false }]
  }))
);

const MUNI_STATUSES: MunicipalLink["status"][] = ["심사중", "승인", "개시", "보완 필요", "종료"];
export const MUNICIPAL_LINKS: MunicipalLink[] = PATIENTS.slice(0, 6).map((p, i) => ({
  resident_id: p.id,
  program: i % 2 === 0 ? "퇴원 후 재가 방문요양 (통합돌봄)" : "방문의료·방문간호 연계",
  status: MUNI_STATUSES[i % MUNI_STATUSES.length],
  updated_at: `2026-11-0${1 + (i % 3)}T10:00:00+09:00`,
  note: MUNI_STATUSES[i % MUNI_STATUSES.length] === "보완 필요" ? "주민센터에서 장기요양 등급 결정 통지서 사본을 요청했어요 (DEMO)" : null
}));

export const STAFF_ROLES: Record<string, string> = Object.fromEntries(CARE_STAFF.map((s) => [s.id, s.role]));
